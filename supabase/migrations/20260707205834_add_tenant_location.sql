alter table public.tenants
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists center_lng double precision,
  add column if not exists center_lat double precision;

-- Backfill existing tenants to the app's original hardcoded region (Tacna, Perú).
update public.tenants
set center_lng = -70.2463,
    center_lat = -18.0066,
    country = 'PER',
    city = coalesce(city, 'Tacna, Perú')
where center_lng is null;

-- Extend signup handler to persist the business location captured at sign-up.
create or replace function private.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
  insert into public.tenants (name, city, country, center_lng, center_lat)
  values (
    coalesce(nullif(new.raw_user_meta_data ->> 'business_name', ''), 'Mi negocio'),
    nullif(new.raw_user_meta_data ->> 'city', ''),
    nullif(new.raw_user_meta_data ->> 'country', ''),
    (nullif(new.raw_user_meta_data ->> 'center_lng', ''))::double precision,
    (nullif(new.raw_user_meta_data ->> 'center_lat', ''))::double precision
  )
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
$function$;