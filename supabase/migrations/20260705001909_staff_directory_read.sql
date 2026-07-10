-- Allow signed-in staff to read the team directory (needed to attribute sales
-- and deliveries to people in metrics). A SELECT using(true) is the standard
-- pattern for shared, non-sensitive team data within a single business.
create policy "Staff can view the team directory"
  on public.profiles for select
  to authenticated
  using (true);