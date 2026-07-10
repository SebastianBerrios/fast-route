-- Team invitations: an admin generates a coded invite; the invitee signs up
-- with that code and joins the admin's tenant (instead of creating a new one).
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    references public.tenants (id) on delete cascade,
  code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  role public.user_role not null default 'driver',
  email text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.invites enable row level security;

-- Only users who can manage users, within their own tenant.
create policy "View tenant invites"
  on public.invites for select to authenticated
  using (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (select auth.jwt() -> 'app_metadata' -> 'permissions') ? 'users.manage'
  );

create policy "Create tenant invites"
  on public.invites for insert to authenticated
  with check (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and created_by = (select auth.uid())
    and (select auth.jwt() -> 'app_metadata' -> 'permissions') ? 'users.manage'
  );

create policy "Delete tenant invites"
  on public.invites for delete to authenticated
  using (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (select auth.jwt() -> 'app_metadata' -> 'permissions') ? 'users.manage'
  );

create index invites_tenant_id_idx on public.invites (tenant_id);
create index invites_code_idx on public.invites (code);

-- Signup with a valid invite joins that tenant; otherwise creates a new one.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_tenant uuid;
  invite public.invites;
  invite_code text;
begin
  invite_code := nullif(new.raw_user_meta_data ->> 'invite_code', '');

  if invite_code is not null then
    select * into invite
    from public.invites
    where code = invite_code and used_at is null and expires_at > now();

    if not found then
      raise exception 'Invitación inválida o expirada';
    end if;

    insert into public.profiles (id, tenant_id, email, full_name, role, permissions)
    values (
      new.id,
      invite.tenant_id,
      new.email,
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      invite.role,
      private.default_permissions(invite.role)
    );

    update public.invites
    set used_at = now(), used_by = new.id
    where id = invite.id;

    return new;
  end if;

  -- No invite: create a new business, creator is its admin.
  insert into public.tenants (name)
  values (coalesce(nullif(new.raw_user_meta_data ->> 'business_name', ''), 'Mi negocio'))
  returning id into new_tenant;

  insert into public.profiles (id, tenant_id, email, full_name, role, permissions)
  values (
    new.id,
    new_tenant,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'admin',
    private.default_permissions('admin')
  );
  return new;
end;
$$;