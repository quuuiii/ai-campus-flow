\set ON_ERROR_STOP 0
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','admin@x.tw'),('22222222-2222-2222-2222-222222222222','mate@x.tw'),('33333333-3333-3333-3333-333333333333','new@x.tw');
update public.profiles set role='admin' where user_id='11111111-1111-1111-1111-111111111111';
update public.profiles set role='member' where user_id='22222222-2222-2222-2222-222222222222';
select '新使用者預設角色', role from public.profiles where user_id='33333333-3333-3333-3333-333333333333';
-- 匿名回報
set role anon; set test.uid = '';
insert into public.crowd_observations (client_id, observed_at, place_id, crowd_level, status, device_hash) values ('anon-0001', now(), 'backdoor', 3, 'approved', 'devA');
select '匿名直接讀表（應失敗或 0 筆）', count(*) from public.crowd_observations;
select '公開 view 筆數（匿名待審不應出現）', count(*) from public.crowd_observations_public;
-- reporter 回報
reset role; set role authenticated; set test.uid = '33333333-3333-3333-3333-333333333333';
insert into public.crowd_observations (client_id, observed_at, place_id, crowd_level, device_hash) values ('rep-00001', now(), 'mainlib', 2, 'devR');
-- member 回報
set test.uid = '22222222-2222-2222-2222-222222222222';
insert into public.crowd_observations (client_id, observed_at, place_id, crowd_level, device_hash) values ('mem-00001', now(), 'mainlib', 4, 'devM');
insert into public.crowd_observations (client_id, observed_at, place_id, crowd_level, device_hash) values ('mem-00001', now(), 'mainlib', 4, 'devM') on conflict (client_id) do nothing;
select 'member 改狀態（應 0 列）'; update public.crowd_observations set status='approved' where client_id='rep-00001';
select 'member 刪除（應 0 列）'; delete from public.crowd_observations where client_id='mem-00001';
-- admin 審核
set test.uid = '11111111-1111-1111-1111-111111111111';
select '待審清單', client_id from public.crowd_review_queue;
update public.crowd_observations set status='approved' where client_id='anon-0001';
select 'admin 改內容（應被擋）'; update public.crowd_observations set crowd_level=1 where client_id='anon-0001';
select '成員清單（admin）', count(*) from public.member_list;
reset role;
select client_id, status, (reporter is not null) as has_reporter, (reviewed_by is not null) as reviewed from public.crowd_observations order by client_id;
select '儀表板', place_id, n from public.crowd_dashboard where n > 0 order by place_id;
-- 限流
set role anon; set test.uid = '';
insert into public.crowd_observations (client_id, observed_at, place_id, crowd_level, device_hash) select 'spam-'||g, now(), 'backdoor', 3, 'devS' from generate_series(1,5) g;
insert into public.crowd_observations (client_id, observed_at, place_id, crowd_level, device_hash) values ('spam-99', now(), 'backdoor', 3, 'devS');
insert into public.crowd_observations (client_id, observed_at, place_id, crowd_level) values ('future-1', now() + interval '1 day', 'backdoor', 3);
insert into public.crowd_observations (client_id, observed_at, place_id, crowd_level) values ('badplace', now(), 'youyi', 3);
