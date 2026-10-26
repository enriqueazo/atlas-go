-- Step 1: accounts.
--
-- Every player gets a Supabase account automatically (anonymous sign-in), so
-- auth.uid() always names the player. Later, signing in with Google, Apple or
-- email can link to that same account and keep everything below.

-- Profile: what other players see in leagues, rankings and duels.
create table public.profiles (
  id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  nickname text not null
    check (nickname ~ '^[A-Za-z0-9_ÁÉÍÓÚÜÑáéíóúüñ]{3,20}$'),
  -- A country from the game's map (ISO 3166-1 alpha-2), or ZZ for elsewhere.
  country text not null
    check (country ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Nicknames are unique regardless of case: "Lucia" and "lucia" are the same.
create unique index profiles_nickname_key on public.profiles (lower(nickname));

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Each player can only read and write their own profile; other players' names
-- reach the app only through the ranking functions.
alter table public.profiles enable row level security;

create policy "Players read their own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "Players create their own profile" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "Players update their own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Whether a nickname is free, without exposing other players' profiles.
create function public.nickname_available(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.profiles
    where lower(nickname) = lower(name) and id <> auth.uid()
  );
$$;

-- Deletes the player's account and, through the foreign keys, everything
-- online that is theirs. Required by Apple for any app with accounts.
create function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.nickname_available(text) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.nickname_available(text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
