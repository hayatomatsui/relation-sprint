create table if not exists public.user_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  progress jsonb not null default '{"version":1,"records":{},"history":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_progress enable row level security;

grant select, insert, update on table public.user_progress to authenticated;
revoke all on table public.user_progress from anon;

drop policy if exists "Users can read their own progress" on public.user_progress;
create policy "Users can read their own progress"
on public.user_progress
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own progress" on public.user_progress;
create policy "Users can create their own progress"
on public.user_progress
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own progress" on public.user_progress;
create policy "Users can update their own progress"
on public.user_progress
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create index if not exists user_progress_updated_at_idx
on public.user_progress (updated_at desc);
