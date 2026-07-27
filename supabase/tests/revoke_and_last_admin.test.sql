-- Revoking access, and the guard that stops a business from losing its last
-- administrator.
--
-- Both were previously verified only by a hand-run probe. A probe proves the
-- code worked once, on one afternoon, against one dataset. This proves it on
-- every run, which is what makes it safe for someone else to edit the policy.

begin;
select plan(10);

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),  -- admin of A
  ('22222222-2222-2222-2222-222222222222'),  -- driver of A
  ('55555555-5555-5555-5555-555555555555'),  -- second admin of A
  ('33333333-3333-3333-3333-333333333333');  -- admin of B

insert into fast_route.tenants (id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tenant A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tenant B');

insert into fast_route.profiles (id, tenant_id, email, full_name, role, permissions) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'a-admin@test', 'A Admin', 'admin', fast_route_private.default_permissions('admin')),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'a-driver@test', 'A Driver', 'driver', fast_route_private.default_permissions('driver')),
  ('33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'b-admin@test', 'B Admin', 'admin', fast_route_private.default_permissions('admin'));

set local role authenticated;
set local request.jwt.claims = '{
  "sub": "11111111-1111-1111-1111-111111111111",
  "app_metadata": {"fast_route": {"role": "admin",
    "tenant_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "permissions": ["users.manage"]}}
}';

-- ---------------------------------------------------------------------------
-- The policy: who may remove whom
-- ---------------------------------------------------------------------------

-- Another tenant's member is invisible, so the delete matches nothing. RLS
-- filters rather than errors, which is why the server action treats a zero-row
-- delete as a failure instead of success.
delete from fast_route.profiles where id = '33333333-3333-3333-3333-333333333333';
select is(
  (select count(*) from fast_route.profiles
   where id = '33333333-3333-3333-3333-333333333333'),
  0::bigint,
  'the other tenant''s admin is not even visible to this caller'
);
set local role postgres;
select is(
  (select count(*) from fast_route.profiles
   where id = '33333333-3333-3333-3333-333333333333'),
  1::bigint,
  'and they are still there — the cross-tenant delete removed nothing'
);
set local role authenticated;

-- Self-removal is a lockout, blocked in the policy as well as in the action.
delete from fast_route.profiles where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select count(*) from fast_route.profiles
   where id = '11111111-1111-1111-1111-111111111111'),
  1::bigint,
  'an admin cannot remove their own membership'
);

-- The legitimate case.
delete from fast_route.profiles where id = '22222222-2222-2222-2222-222222222222';
select is(
  (select count(*) from fast_route.profiles
   where id = '22222222-2222-2222-2222-222222222222'),
  0::bigint,
  'an admin removes a member of their own tenant'
);

-- Without users.manage the same call does nothing.
set local request.jwt.claims = '{
  "sub": "11111111-1111-1111-1111-111111111111",
  "app_metadata": {"fast_route": {"role": "admin",
    "tenant_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "permissions": ["orders.create"]}}
}';
set local role postgres;
insert into fast_route.profiles (id, tenant_id, email, full_name, role, permissions)
values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'a-driver@test', 'A Driver', 'driver', fast_route_private.default_permissions('driver'));
set local role authenticated;

delete from fast_route.profiles where id = '22222222-2222-2222-2222-222222222222';
select is(
  (select count(*) from fast_route.profiles
   where id = '22222222-2222-2222-2222-222222222222'),
  1::bigint,
  'a caller without users.manage removes nobody'
);

-- ---------------------------------------------------------------------------
-- The guard: a business always keeps an administrator
-- ---------------------------------------------------------------------------
-- Run as postgres so the policy is out of the picture and the trigger is the
-- only thing under test. It is SECURITY DEFINER and fires for everyone.
set local role postgres;
-- Clear the JWT too. `guard_role_change` skips its check when auth.uid() is
-- null, so without this the demotion below trips THAT trigger instead and we
-- would be testing the wrong guard. (Triggers fire in alphabetical order, so
-- `profiles_guard_last_admin` gets there before `profiles_guard_role_change` —
-- which is why the blocked cases still reported the message we expected.)
set local request.jwt.claims = '';

select throws_ok(
  $$delete from fast_route.profiles
    where id = '11111111-1111-1111-1111-111111111111'$$,
  'El negocio tiene que quedar con al menos un administrador',
  'deleting the only admin is blocked'
);

select throws_ok(
  $$update fast_route.profiles set role = 'driver'
    where id = '11111111-1111-1111-1111-111111111111'$$,
  'El negocio tiene que quedar con al menos un administrador',
  'demoting the only admin is blocked — the same dead end by another route'
);

-- A regular member is not an admin, so the guard must stay out of the way.
select lives_ok(
  $$delete from fast_route.profiles
    where id = '22222222-2222-2222-2222-222222222222'$$,
  'removing a non-admin member is unaffected by the guard'
);

-- With a second admin present, both operations become legitimate.
insert into fast_route.profiles (id, tenant_id, email, full_name, role, permissions)
values ('55555555-5555-5555-5555-555555555555', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'a-admin2@test', 'A Admin 2', 'admin', fast_route_private.default_permissions('admin'));

select lives_ok(
  $$update fast_route.profiles set role = 'driver'
    where id = '11111111-1111-1111-1111-111111111111'$$,
  'demotion is allowed once another admin exists'
);

-- That demotion left exactly one admin again, so the guard closes back up. It
-- reads the CURRENT state on every statement rather than a snapshot taken when
-- the business was created.
select throws_ok(
  $$delete from fast_route.profiles
    where id = '55555555-5555-5555-5555-555555555555'$$,
  'El negocio tiene que quedar con al menos un administrador',
  'the guard re-arms: after the demotion, the last admin is protected again'
);

select * from finish();
rollback;
