-- ============================================================
--  AUTO-DRAFT: single combined preference queue + permissions
--  Run this ONCE in the Supabase SQL editor (safe to re-run).
-- ============================================================

-- Each manager's ranked board: ONE list mixing players and teams,
-- in preference order. Each element: { "type": "player"|"team", "id": <int> }.
create table if not exists public.draft_queue (
  manager_id uuid primary key references public.profiles(id) on delete cascade,
  queue      jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Migrate older two-list version if it exists:
alter table public.draft_queue add column if not exists queue jsonb not null default '[]'::jsonb;
alter table public.draft_queue drop column if exists player_ids;
alter table public.draft_queue drop column if exists team_ids;

alter table public.draft_queue enable row level security;

-- Managers read/write their OWN queue; the commissioner may read everyone's.
drop policy if exists "queue read"   on public.draft_queue;
drop policy if exists "queue write"  on public.draft_queue;
drop policy if exists "queue modify" on public.draft_queue;
create policy "queue read"   on public.draft_queue for select to authenticated
  using (manager_id = auth.uid() or public.is_admin());
create policy "queue write"  on public.draft_queue for insert to authenticated
  with check (manager_id = auth.uid());
create policy "queue modify" on public.draft_queue for update to authenticated
  using (manager_id = auth.uid()) with check (manager_id = auth.uid());

-- Let the commissioner insert picks on behalf of everyone during the auto-draft.
drop policy if exists "admin inserts picks" on public.picks;
create policy "admin inserts picks" on public.picks for insert to authenticated
  with check (public.is_admin());
