-- The three accessors every RLS policy in fast_route now goes through.
--
-- These are worth testing above everything else: 26 of 26 policies delegate
-- their authorization decision to them, so a regression here is not one broken
-- table, it is the whole schema either locked shut or wide open.

begin;
select plan(11);

-- A member's claims, as `sync_role_to_app_metadata` writes them.
set local role authenticated;
set local request.jwt.claims = '{
  "sub": "11111111-1111-1111-1111-111111111111",
  "app_metadata": {
    "fast_route": {
      "role": "admin",
      "tenant_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "permissions": ["users.manage", "orders.create"]
    }
  }
}';

select is(
  fast_route_private.tenant_id(),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'tenant_id() reads the namespaced claim'
);
select ok(
  fast_route_private.has_permission('users.manage'),
  'has_permission() is true for a granted permission'
);
select ok(
  not fast_route_private.has_permission('products.manage'),
  'has_permission() is false for a permission that was not granted'
);
select ok(
  fast_route_private.claims() ? 'role',
  'claims() exposes the namespaced slice'
);

-- THE regression guard. Before this model, these exact keys at the top level
-- WERE authorization. app_metadata is one blob shared by every app in the
-- project, so if a top-level claim still counted, any other app could mint
-- membership here just by picking an obvious key name.
set local request.jwt.claims = '{
  "sub": "11111111-1111-1111-1111-111111111111",
  "app_metadata": {
    "role": "admin",
    "tenant_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "permissions": ["users.manage"]
  }
}';

select is(
  fast_route_private.tenant_id(),
  null,
  'a TOP-LEVEL tenant_id is not membership'
);
select ok(
  not fast_route_private.has_permission('users.manage'),
  'a TOP-LEVEL permission grants nothing'
);
select is(
  fast_route_private.claims(),
  '{}'::jsonb,
  'claims() is empty when nothing lives under the fast_route key'
);

-- Another app's namespace must be just as inert as the top level.
set local request.jwt.claims = '{
  "sub": "11111111-1111-1111-1111-111111111111",
  "app_metadata": {
    "oasis": {
      "role": "admin",
      "tenant_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "permissions": ["users.manage"]
    }
  }
}';

select is(
  fast_route_private.tenant_id(),
  null,
  'another app''s namespace is not membership here'
);
select ok(
  not fast_route_private.has_permission('users.manage'),
  'another app''s permissions grant nothing here'
);

-- An authenticated non-member: a real session in the shared pool, no claims.
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "app_metadata": {}}';

select is(
  fast_route_private.tenant_id(),
  null,
  'an authenticated non-member has no tenant'
);
-- Null is load-bearing, not incidental: `tenant_id = null` is never true, which
-- is what makes every tenant-scoped policy fail closed for a non-member.
select ok(
  not ((select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid = fast_route_private.tenant_id())
       is true),
  'a null tenant never matches a real tenant_id'
);

select * from finish();
rollback;
