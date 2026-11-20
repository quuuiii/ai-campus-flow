-- AI Campus Flow：人潮觀察紀錄的 Supabase 結構（草案，尚未部署、尚未在任何專案上執行過）
-- 前端只能使用 anon key；service_role key 絕不可放進前端或提交到 repo。

create table if not exists public.crowd_observations (
  id            uuid primary key default gen_random_uuid(),
  observed_at   timestamptz not null,                       -- 實際觀察時間（前端以台灣時間轉 UTC）
  place_id      text        not null check (place_id in ('backdoor','female14','nightmarket','mainlib','zhongzheng','youyi','admin')),
  crowd_level   smallint    not null check (crowd_level between 1 and 5),
  queue_minutes smallint    check (queue_minutes between 0 and 180),
  method        text        not null default 'onsite' check (method in ('onsite','manual')),
  note          text        check (char_length(note) <= 100),
  device_hash   text,                                       -- 匿名裝置雜湊，僅用於限流，不放個資
  created_at    timestamptz not null default now(),
  constraint observed_not_future check (observed_at <= now() + interval '1 minute')
);
create index if not exists obs_place_time on public.crowd_observations (place_id, observed_at desc);

alter table public.crowd_observations enable row level security;

-- 匿名者只能「新增」，不可讀 device_hash、不可改、不可刪
create policy "anon can insert" on public.crowd_observations for insert to anon
  with check (method in ('onsite','manual') and char_length(coalesce(note,'')) <= 100);

-- 對外讀取走 view（不含 device_hash）
create or replace view public.crowd_observations_public with (security_invoker = on) as
  select id, observed_at, place_id, crowd_level, queue_minutes, method, note from public.crowd_observations;
create policy "anon can read" on public.crowd_observations for select to anon using (true);
revoke select (device_hash) on public.crowd_observations from anon;

-- 限流：同一 device_hash 每分鐘最多 3 筆（防洗版）
create or replace function public.rate_limit_obs() returns trigger language plpgsql as $$
begin
  if new.device_hash is not null and (
    select count(*) from public.crowd_observations
    where device_hash = new.device_hash and created_at > now() - interval '1 minute') >= 3
  then raise exception 'rate limit exceeded'; end if;
  return new;
end $$;
drop trigger if exists trg_rate_limit on public.crowd_observations;
create trigger trg_rate_limit before insert on public.crowd_observations for each row execute function public.rate_limit_obs();
