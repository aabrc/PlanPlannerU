-- Add an optimistic-concurrency revision to each user's planner row.
-- Existing rows, if any, receive revision 1. This does not replace or reset state.

alter table public.user_planner_data
  add column if not exists revision bigint not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_planner_data_revision_positive'
      and conrelid = 'public.user_planner_data'::regclass
  ) then
    alter table public.user_planner_data
      add constraint user_planner_data_revision_positive
      check (revision >= 1);
  end if;
end
$$;

comment on column public.user_planner_data.revision is
  'Monotonic per-user planner version used for optimistic concurrency control during multi-device sync.';
