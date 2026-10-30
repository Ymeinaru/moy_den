-- Вход по magic link: таблица принадлежит владельцу.
-- Выполнять ТОЛЬКО когда готова войти на всех устройствах.

alter table public.days
  add column if not exists user_id uuid default auth.uid()
  references auth.users(id) on delete cascade;

create index if not exists days_user_idx on public.days (user_id);

drop policy if exists "days anon rw" on public.days;
drop policy if exists "days anon legacy" on public.days;
drop policy if exists "days owner rw" on public.days;

-- пока не вошла — видны только «бесхозные» строки, остальные закрыты
create policy "days anon legacy" on public.days
  for all to anon
  using (user_id is null)
  with check (user_id is null);

-- после входа — только свои строки
create policy "days owner rw" on public.days
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- присвоить старые строки текущему пользователю (вызывается из приложения)
create or replace function public.claim_legacy_rows()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update public.days set user_id = auth.uid() where user_id is null;
  get diagnostics n = row_count;

  -- push-подписки тоже становятся личными
  if to_regclass('public.push_subs') is not null then
    alter table public.push_subs alter column user_id set default auth.uid();
    update public.push_subs set user_id = auth.uid() where user_id is null;

    drop policy if exists "push anon rw" on public.push_subs;
    drop policy if exists "push anon legacy" on public.push_subs;
    drop policy if exists "push owner rw" on public.push_subs;

    create policy "push anon legacy" on public.push_subs
      for all to anon using (user_id is null) with check (user_id is null);
    create policy "push owner rw" on public.push_subs
      for all to authenticated
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  return n;
end $$;

revoke all on function public.claim_legacy_rows() from anon;
grant execute on function public.claim_legacy_rows() to authenticated;
