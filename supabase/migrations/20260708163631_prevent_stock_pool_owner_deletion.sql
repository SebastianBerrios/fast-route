-- W1: deleting a pool owner would silently corrupt dependents (FK is
-- ON DELETE SET NULL, so dependents fall back to their stale inert stock
-- and the pool's stock_movements history cascades away). Block it.
create or replace function private.prevent_stock_pool_owner_deletion()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if exists (
    select 1 from public.products p
    where p.stock_source_id = old.id
  ) then
    raise exception 'product is a stock pool for other products; unlink them first';
  end if;
  return old;
end;
$$;

drop trigger if exists prevent_stock_pool_owner_deletion on public.products;
create trigger prevent_stock_pool_owner_deletion
  before delete on public.products
  for each row
  execute function private.prevent_stock_pool_owner_deletion();