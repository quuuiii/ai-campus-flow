-- AI Campus Flow：多人人潮資料蒐集（Supabase / Postgres）
-- 狀態：草案。尚未在任何 Supabase 專案執行過；執行前請先在測試專案跑一次。
-- 安全原則：前端只放 anon key；service_role key 只能留在 Supabase 後台，不可進前端、repo、截圖或簡報。
-- 本檔可重複執行（if not exists / or replace），不含任何 drop table / delete 等破壞性操作。

-- ───────────────────────── 1. 地點 ─────────────────────────
-- 與前端 src/data/places.js 的地點代碼一致；新增地點只能由管理員在後台加入。
create table if not exists public.places (
  id          text primary key,                 -- 例：backdoor、mainlib
  name        text not null,
  category    text not null check (category in ('meal','study','errand')),
  active      boolean not null default true,    -- 停業／不再蒐集時設為 false，不刪除歷史資料
  note        text,
  created_at  timestamptz not null default now()
);
insert into public.places (id, name, category) values
  ('backdoor',    '後門餐飲區',          'meal'),
  ('female14',    '女十四舍 B1 商場',     'meal'),
  ('nightmarket', '宵夜街（外帶）',       'meal'),
  ('mainlib',     '總圖書館 閱覽區',      'study'),
  ('zhongzheng',  '中正圖書館 K書中心',   'study'),
  ('admin',       '行政大樓',            'errand'),
  ('pinecone',    '松果餐廳',            'meal'),
  ('male9_711',   '男九 7-11',           'meal')
on conflict (id) do nothing;
-- 行政大樓不再蒐集人潮（保留歷史資料，不刪除）
update public.places set active = false where id = 'admin';

-- ───────────────────────── 2. 使用者與角色 ─────────────────────────
-- 登入使用 Supabase Auth（建議學校信箱 magic link）。未登入者為 anon，可匿名回報（進入待審）。
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  -- reporter：新登入者，回報仍需審核；member：管理員確認過的組員，回報直接核可；admin：可審核與管理角色
  role         text not null default 'reporter' check (role in ('reporter','member','admin')),
  display_name text check (char_length(display_name) <= 30),
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;
-- 既有專案升級：放寬角色限制並把預設改為 reporter（已是 member/admin 的人不受影響）
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('reporter','member','admin'));
alter table public.profiles alter column role set default 'reporter';

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin');
$$;
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role in ('member','admin'));
$$;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "admin manages profiles" on public.profiles;
create policy "admin manages profiles" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- 新使用者登入時自動建立 member profile（角色只能由管理員升級）
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin insert into public.profiles (user_id) values (new.id) on conflict do nothing; return new; end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ───────────────────────── 3. 人潮觀察 ─────────────────────────
create table if not exists public.crowd_observations (
  id            uuid primary key default gen_random_uuid(),
  client_id     text not null unique check (char_length(client_id) between 6 and 60),  -- 前端產生的 id：去重、離線重送不重複
  observed_at   timestamptz not null,
  place_id      text not null references public.places(id),
  crowd_level   smallint not null check (crowd_level between 1 and 5),
  queue_minutes smallint check (queue_minutes between 0 and 180),
  method        text not null default 'onsite' check (method in ('onsite','manual')),   -- 現場／事後補記
  source        text not null default 'app' check (source in ('app','csv_import','field_team')),
  note          text check (char_length(note) <= 100),
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  reporter      uuid references auth.users(id) on delete set null,  -- 匿名回報為 null
  device_hash   text check (char_length(device_hash) <= 64),         -- 匿名裝置識別，只用於限流，不對外公開
  reviewed_by   uuid references auth.users(id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  constraint observed_not_future check (observed_at <= now() + interval '5 minutes'),
  constraint observed_not_too_old check (observed_at >= timestamptz '2025-01-01')
);
create index if not exists obs_place_time on public.crowd_observations (place_id, observed_at desc);
create index if not exists obs_status on public.crowd_observations (status);
alter table public.crowd_observations enable row level security;

-- 寫入時由伺服器決定：狀態、回報者、審核欄位，前端不能偽造
create or replace function public.obs_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare recent int;
begin
  new.reporter := auth.uid();
  new.reviewed_by := null; new.reviewed_at := null;
  -- 只有管理員確認過的組員（member/admin）直接核可；匿名與 reporter 進入待審
  new.status := case when public.is_member() then 'approved' else 'pending' end;
  if new.source = 'field_team' and not public.is_member() then new.source := 'app'; end if;
  if not exists (select 1 from public.places where id = new.place_id and active) then
    raise exception 'place not active';
  end if;
  -- 限流：同一裝置或同一帳號每 10 分鐘最多 5 筆
  select count(*) into recent from public.crowd_observations
   where created_at > now() - interval '10 minutes'
     and ((new.device_hash is not null and device_hash = new.device_hash) or (new.reporter is not null and reporter = new.reporter));
  -- 錯誤碼 PT429：PostgREST 會回 HTTP 429
  if recent >= 5 then raise exception 'rate limit exceeded' using errcode = 'PT429'; end if;
  return new;
end $$;
drop trigger if exists trg_obs_before_insert on public.crowd_observations;
create trigger trg_obs_before_insert before insert on public.crowd_observations for each row execute function public.obs_before_insert();

-- 審核時只能改 status；審核人與時間由伺服器填入，觀察內容不可被改動
create or replace function public.obs_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.client_id, new.observed_at, new.place_id, new.crowd_level, new.queue_minutes, new.method, new.source, new.note, new.reporter, new.device_hash, new.created_at)
     is distinct from (old.client_id, old.observed_at, old.place_id, old.crowd_level, old.queue_minutes, old.method, old.source, old.note, old.reporter, old.device_hash, old.created_at)
  then raise exception 'only status can be changed'; end if;
  if new.status is distinct from old.status then new.reviewed_by := auth.uid(); new.reviewed_at := now();
  else new.reviewed_by := old.reviewed_by; new.reviewed_at := old.reviewed_at; end if;
  return new;
end $$;
drop trigger if exists trg_obs_before_update on public.crowd_observations;
create trigger trg_obs_before_update before update on public.crowd_observations for each row execute function public.obs_before_update();

-- RLS
drop policy if exists "anyone can insert" on public.crowd_observations;
create policy "anyone can insert" on public.crowd_observations for insert to anon, authenticated with check (true);
drop policy if exists "members read approved and own" on public.crowd_observations;
create policy "members read approved and own" on public.crowd_observations for select to authenticated
  using (status = 'approved' or reporter = auth.uid() or public.is_admin());
drop policy if exists "admin reviews" on public.crowd_observations;
create policy "admin reviews" on public.crowd_observations for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- 不建立 delete policy：任何前端都不能刪除；需要時由管理員在後台處理（保留審核軌跡）。
-- anon 不能直接讀表，只能讀下方公開 view。

-- ───────────────────────── 4. 公開資料與儀表板 ─────────────────────────
-- 只含已核可、去除回報者與裝置資訊（預設 security definer 行為：由 view 擁有者讀取，故只暴露這些欄位）
create or replace view public.crowd_observations_public as
  select client_id, observed_at, place_id, crowd_level, queue_minutes, method, source
  from public.crowd_observations where status = 'approved';
grant select on public.crowd_observations_public to anon, authenticated;

create or replace view public.crowd_dashboard as
  select p.id as place_id, p.name,
         count(o.client_id)                                                   as n,
         count(distinct (o.observed_at at time zone 'Asia/Taipei')::date)    as dates,
         max(o.observed_at)                                                   as last_observed
  from public.places p left join public.crowd_observations_public o on o.place_id = p.id
  where p.active group by p.id, p.name;
grant select on public.crowd_dashboard to anon, authenticated;

-- 管理員審核用：待審清單（RLS 限 admin）
create or replace view public.crowd_review_queue with (security_invoker = on) as
  select id, client_id, observed_at, place_id, crowd_level, queue_minutes, note, source, created_at
  from public.crowd_observations where status = 'pending' order by created_at;

-- 管理員看成員清單（含 email，僅 admin 可讀；用於把組員從 reporter 升為 member）
create or replace view public.member_list as
  select p.user_id, u.email, p.role, p.created_at from public.profiles p join auth.users u on u.id = p.user_id
  where public.is_admin();
revoke all on public.member_list from anon;
grant select on public.member_list to authenticated;
