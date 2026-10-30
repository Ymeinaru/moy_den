-- Push-подписки для «Мой день».
-- Выполнить в Supabase → SQL Editor → Run.

create table if not exists public.push_subs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  tz         text not null default 'Europe/Moscow',
  lead_min   int  not null default 5,
  space      text not null default 'personal',
  created_at timestamptz not null default now()
);

alter table public.push_subs enable row level security;

drop policy if exists "push anon rw" on public.push_subs;
create policy "push anon rw" on public.push_subs
  for all to anon using (true) with check (true);
