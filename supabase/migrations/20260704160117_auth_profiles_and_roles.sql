-- Roles for the delivery business.
create type public.user_role as enum ('admin', 'seller', 'driver');

-- User profiles, 1:1 with auth.users.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role public.user_role not null default 'seller',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read their own profile.
create policy "Profiles are viewable by owner"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

-- Users can update their own display name (role changes are NOT allowed here).
create policy "Owners can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Private schema for security-definer helpers, kept out of the exposed Data API.
create schema if not exists private;

-- Auto-create a profile when a new auth user signs up.
-- The first user ever becomes admin; everyone else defaults to seller.
-- Role is decided server-side here, never taken from user-editable metadata.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned_role public.user_role;
begin
  if not exists (select 1 from public.profiles) then
    assigned_role := 'admin';
  else
    assigned_role := 'seller';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    assigned_role
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();