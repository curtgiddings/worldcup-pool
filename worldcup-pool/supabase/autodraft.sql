-- ============================================================
--  AUTO-DRAFT: preference queues + commissioner runner
--  Run this ONCE in the Supabase SQL editor (after schema.sql).
-- ============================================================

-- Each manager's ranked preference lists. Arrays are in preference
-- order: player_ids[0] is their #1 target, etc.
create table if not exists public.draft_queue (
  manager_id uuid primary key references public.profiles(id) on delete cascade,
  player_ids int[] not null default '{}',
  team_ids   int[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.draft_queue enable row level security;

-- Managers read/write their OWN queue; the commissioner may read everyone's
-- (needed to run the draft).
drop policy if exists "queue read"   on public.draft_queue;
drop policy if exists "queue write"  on public.draft_queue;
drop policy if exists "queue modify" on public.draft_queue;
create policy "queue read"   on public.draft_queue for select to authenticated
  using (manager_id = auth.uid() or public.is_admin());
create policy "queue write"  on public.draft_queue for insert to authenticated
  with check (manager_id = auth.uid());
create policy "queue modify" on public.draft_queue for update to authenticated
  using (manager_id = auth.uid()) with check (manager_id = auth.uid());

-- Allow the commissioner to insert picks on behalf of everyone during the
-- auto-draft. (Regular managers still only insert their own, via the
-- existing "insert own picks" policy — both are OR'd together.)
drop policy if exists "admin inserts picks" on public.picks;
create policy "admin inserts picks" on public.picks for insert to authenticated
  with check (public.is_admin());
