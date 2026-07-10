-- A delivered order IS a sale. Capture when and by whom it was completed.
alter table public.orders
  add column delivered_at timestamptz,
  add column delivered_by uuid references auth.users (id) on delete set null;

-- Stamp delivery metadata automatically on the status transition, so it can
-- never be forgotten or faked from the client.
create or replace function private.set_order_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    new.delivered_at := now();
    new.delivered_by := (select auth.uid());
  elsif new.status <> 'delivered' then
    new.delivered_at := null;
    new.delivered_by := null;
  end if;
  return new;
end;
$$;

create trigger orders_set_delivery
  before update on public.orders
  for each row execute function private.set_order_delivery();

create index orders_delivered_at_idx on public.orders (delivered_at);