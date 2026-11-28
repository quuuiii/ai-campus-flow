\set ON_ERROR_STOP 0
\pset pager off
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','admin@x.tw'),('22222222-2222-2222-2222-222222222222','mate@x.tw'),('33333333-3333-3333-3333-333333333333','new@x.tw') on conflict do nothing;
update public.profiles set role='admin' where user_id='11111111-1111-1111-1111-111111111111';
update public.profiles set role='member' where user_id='22222222-2222-2222-2222-222222222222';
-- 正常流程（PostgREST 實際送出的語句形式）
set role anon; set test.uid = '';
select 'OK1 匿名回報（含去重重送）';
insert into public.crowd_observations (client_id, observed_at, place_id, crowd_level, method, source, note, device_hash) values ('anon-0001', now(), 'backdoor', 3, 'onsite', 'app', '匿名', 'devA') on conflict (client_id) do nothing;
insert into public.crowd_observations (client_id, observed_at, place_id, crowd_level, method, source, note, device_hash) values ('anon-0001', now(), 'backdoor', 3, 'onsite', 'app', '匿名', 'devA') on conflict (client_id) do nothing;
select 'OK2 匿名讀公開資料', count(*) from public.crowd_observations_public;
set role authenticated; set test.uid = '22222222-2222-2222-2222-222222222222';
select 'OK3 組員回報';
insert into public.crowd_observations (client_id, observed_at, place_id, crowd_level, method, source, note, device_hash) values ('mate-0001', now(), 'backdoor', 3, 'onsite', 'app', '我是組員', 'devMATE') on conflict (client_id) do nothing;
select 'OK4 讀自己角色', role from public.profiles;
-- 攻擊
set test.uid = '33333333-3333-3333-3333-333333333333';
select 'A1 自己升級角色'; update public.profiles set role='admin' where user_id='33333333-3333-3333-3333-333333333333';
select 'A3 讀別人 device_hash'; select device_hash from public.crowd_observations;
select 'A3b 讀別人 note'; select note from public.crowd_observations;
select 'A3c 讀別人 reporter'; select reporter from public.crowd_observations;
select 'A4 改別人狀態'; update public.crowd_observations set status='rejected' where client_id='mate-0001';
select 'A4b 改內容'; update public.crowd_observations set crowd_level=1 where client_id='mate-0001';
select 'A5 刪除'; delete from public.crowd_observations where client_id='mate-0001';
select 'A6 成員清單', count(*) from public.member_list;
select 'A7 待審清單', count(*) from public.crowd_review_queue;
select 'A9 偽造 reporter'; insert into public.crowd_observations (client_id, observed_at, place_id, crowd_level, reporter) values ('fake-001', now(), 'backdoor', 3, '22222222-2222-2222-2222-222222222222');
select 'A10 偽造核可（reporter 身分）'; insert into public.crowd_observations (client_id, observed_at, place_id, crowd_level, status) values ('fake-002', now(), 'backdoor', 3, 'approved');
select 'OK9 組員一次補傳 8 筆（不受限流）';
set test.uid = '22222222-2222-2222-2222-222222222222';
insert into public.crowd_observations (client_id, observed_at, place_id, crowd_level, method, source, device_hash) select 'bulk-'||g, now() - (g || ' hours')::interval, 'backdoor', 3, 'manual', 'csv_import', 'devMATE' from generate_series(1,8) g on conflict (client_id) do nothing;
select 'OK9 結果', count(*) from public.crowd_observations_public where client_id like 'bulk-%';
select 'A11 匿名一次 7 筆（第 6 筆起應被限流）';
set role anon; set test.uid = '';
insert into public.crowd_observations (client_id, observed_at, place_id, crowd_level, device_hash) select 'spam-'||g, now(), 'backdoor', 3, 'devSPAM' from generate_series(1,7) g;
set role authenticated;
-- 管理員
set test.uid = '11111111-1111-1111-1111-111111111111';
select 'OK5 管理員讀待審', client_id, note from public.crowd_review_queue;
select 'OK6 管理員審核（PATCH ?id=eq.）';
update public.crowd_observations set status='approved' where id = (select id from public.crowd_observations where client_id='anon-0001');
select 'OK7 管理員改組員角色'; update public.profiles set role='member' where user_id='33333333-3333-3333-3333-333333333333';
select 'OK8 管理員看成員', count(*) from public.member_list;
reset role;
select '最終', client_id, status, crowd_level, (reviewed_by is not null) reviewed from public.crowd_observations order by client_id;
select '最終角色', user_id, role from public.profiles order by user_id;
