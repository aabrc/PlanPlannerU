-- PlanPlannerU: almacenamiento privado por cuenta.
-- Ejecutar en Supabase SQL Editor antes de activar la sincronización.
create table if not exists public.user_planner_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  device_id text not null,
  updated_at timestamptz not null default now()
);

alter table public.user_planner_data enable row level security;

drop policy if exists "Users can read their own planner data" on public.user_planner_data;
create policy "Users can read their own planner data"
on public.user_planner_data for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own planner data" on public.user_planner_data;
create policy "Users can insert their own planner data"
on public.user_planner_data for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own planner data" on public.user_planner_data;
create policy "Users can update their own planner data"
on public.user_planner_data for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on public.user_planner_data to authenticated;
