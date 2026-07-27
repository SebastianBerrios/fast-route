-- End-to-end RLS, exercised as a real `authenticated` user against real tables.
--
-- The claim helpers have their own unit tests, but those call the functions
-- directly. This file is the one that answers the question the app actually
-- asks: "can this signed-in person read and write these rows?" The distinction
-- is not academic — a missing USAGE grant on the helper schema once made every
-- one of these queries fail while the helpers themselves tested green.

begin;
select plan(12);

-- ---------------------------------------------------------------------------
-- Fixtures: two businesses that must never see each other.
-- ---------------------------------------------------------------------------
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),  -- admin of tenant A
  ('22222222-2222-2222-2222-222222222222'),  -- driver of tenant A
  ('33333333-3333-3333-3333-333333333333'),  -- admin of tenant B
  ('44444444-4444-4444-4444-444444444444');  -- signed in, member of nothing

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

insert into fast_route.customers (id, tenant_id, name, created_by) values
  ('cccccccc-cccc-cccc-cccc-cccccccccc01', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'Customer of A', '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc02', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Customer of B', '33333333-3333-3333-3333-333333333333');

-- ---------------------------------------------------------------------------
-- Tenant A's admin
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{
  "sub": "11111111-1111-1111-1111-111111111111",
  "app_metadata": {"fast_route": {"role": "admin",
    "tenant_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "permissions": ["users.manage","customers.manage","orders.create","products.manage"]}}
}';

select is(
  (select count(*) from fast_route.profiles),
  2::bigint,
  'an admin sees their own tenant''s members and no others'
);
select is(
  (select count(*) from fast_route.customers),
  1::bigint,
  'customers are scoped to the tenant'
);
select is(
  (select name from fast_route.customers),
  'Customer of A',
  'and it is the right tenant''s customer'
);
select is(
  (select count(*) from fast_route.tenants),
  1::bigint,
  'a member sees only their own business row'
);

-- Writing into someone else's tenant must be rejected by the check constraint
-- on the policy, not merely filtered.
select throws_ok(
  $$insert into fast_route.customers (tenant_id, name, created_by)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Smuggled',
            '11111111-1111-1111-1111-111111111111')$$,
  '42501',
  null,
  'an admin cannot insert a row into another tenant'
);

-- Updating across the boundary silently affects nothing (RLS filters the row).
update fast_route.customers set name = 'Renamed by A'
where id = 'cccccccc-cccc-cccc-cccc-cccccccccc02';
select is(
  (select count(*) from fast_route.customers where name = 'Renamed by A'),
  0::bigint,
  'an admin cannot rename another tenant''s customer'
);

-- ---------------------------------------------------------------------------
-- A driver in the same tenant: sees the tenant, but lacks customers.manage
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{
  "sub": "22222222-2222-2222-2222-222222222222",
  "app_metadata": {"fast_route": {"role": "driver",
    "tenant_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "permissions": ["orders.deliver"]}}
}';

select is(
  (select count(*) from fast_route.customers),
  1::bigint,
  'a driver still reads their tenant''s customers'
);
select throws_ok(
  $$insert into fast_route.customers (tenant_id, name, created_by)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'By a driver',
            '22222222-2222-2222-2222-222222222222')$$,
  '42501',
  null,
  'a driver cannot create customers without customers.manage'
);

-- ---------------------------------------------------------------------------
-- An authenticated NON-member: the shared-pool case this whole model exists for
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{
  "sub": "44444444-4444-4444-4444-444444444444",
  "app_metadata": {}
}';

select is(
  (select count(*) from fast_route.profiles),
  0::bigint,
  'a non-member sees no profiles'
);
select is(
  (select count(*) from fast_route.customers),
  0::bigint,
  'a non-member sees no customers'
);
select is(
  (select count(*) from fast_route.tenants),
  0::bigint,
  'a non-member sees no businesses'
);

-- The exact attack the namespacing closed: another app's user carrying
-- top-level claims that name a real fast_route tenant.
set local request.jwt.claims = '{
  "sub": "44444444-4444-4444-4444-444444444444",
  "app_metadata": {"role": "admin",
    "tenant_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "permissions": ["users.manage"]}
}';

select is(
  (select count(*) from fast_route.profiles),
  0::bigint,
  'TOP-LEVEL claims naming a real tenant still see nothing'
);

select * from finish();
rollback;
