-- Disposable test database only: apply BEFORE the global push migration.
insert into auth.users(id) values('33333333-3333-4333-8333-333333333333'),('44444444-4444-4444-8444-444444444444');
insert into public.mf_push_subscriptions(user_id,endpoint,p256dh,auth,created_at) values
('33333333-3333-4333-8333-333333333333','https://fcm.googleapis.com/mf-only','key','auth',now()-interval '1 day'),
('33333333-3333-4333-8333-333333333333','https://fcm.googleapis.com/shared','key','auth',now()-interval '1 day'),
('33333333-3333-4333-8333-333333333333','https://fcm.googleapis.com/conflict','key','auth',now()-interval '1 day');
insert into public.health_push_subscriptions(user_id,endpoint,p256dh,auth,language) values
('33333333-3333-4333-8333-333333333333','https://fcm.googleapis.com/health-only','key','auth','en'),
('33333333-3333-4333-8333-333333333333','https://fcm.googleapis.com/shared','new-key','new-auth','es'),
('44444444-4444-4444-8444-444444444444','https://fcm.googleapis.com/conflict','key','auth','pt');
