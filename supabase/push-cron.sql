-- Вызов push-функции каждую минуту.
-- Перед этим: Database → Extensions → включить pg_cron и pg_net.
-- Замени <PROJECT_REF> на идентификатор проекта.
-- Verify JWT у функции оставить включённым: ключ передаётся в заголовке apikey.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('moy-den-push-tick')
where exists (select 1 from cron.job where jobname = 'moy-den-push-tick');

select cron.schedule(
  'moy-den-push-tick',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/push-tick',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_QM26-1GkeD67aaaoq7jXAg_p7zWuxid"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
