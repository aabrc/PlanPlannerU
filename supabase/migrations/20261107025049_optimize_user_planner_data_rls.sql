-- Optimize the existing per-user planner policies.
-- The table and its original RLS policies predate migration tracking in this project.
-- This migration changes only the auth.uid() evaluation strategy; ownership rules remain unchanged.

drop policy if exists "Users can read their own planner data" on public.user_planner_data;
create policy "Users can read their own planner data"
on public.user_planner_data
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own planner data" on public.user_planner_data;
create policy "Users can insert their own planner data"
on public.user_planner_data
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own planner data" on public.user_planner_data;
create policy "Users can update their own planner data"
on public.user_planner_data
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
