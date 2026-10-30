-- Схема для «Мой день».
-- Выполнить один раз в Supabase → SQL Editor → New query → вставить → Run.

-- Составной ключ (space, date): разные «пространства» не затирают друг друга.
create table if not exists public.days (
  date       text not null,
  space      text not null default 'personal',
  payload    jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (space, date)
);

create index if not exists days_space_idx on public.days (space, date desc);

alter table public.days enable row level security;

-- Планировщик личный: доступ по anon-ключу открыт, данные фильтруются по space.
-- Если захочешь настоящую приватность — включи Supabase Auth (magic link)
-- и замени политику на: using (auth.uid() = user_id) with check (auth.uid() = user_id).
drop policy if exists "days anon rw" on public.days;
create policy "days anon rw" on public.days
  for all
  to anon
  using (true)
  with check (true);

-- Проверка, что всё на месте:
-- select count(*) from public.days;
