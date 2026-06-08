-- ============================================================
--  WORLD CUP 2026 POOL — DATABASE SCHEMA
--  Run this in the Supabase SQL editor (one time).
--  It creates every table, the rules that make the pool fair,
--  and a view that calculates the live standings.
-- ============================================================

-- ---------- PROFILES (one row per signed-up manager) ----------
create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null,
  is_admin     boolean not null default false,   -- commissioner = true
  created_at   timestamptz not null default now()
);

-- Auto-create a profile whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- TEAMS & PLAYERS (the draftable catalog) ----------
create table public.teams (
  id            serial primary key,
  name          text unique not null,
  confederation text,
  grp           text                       -- group letter, fill in once known
);

create table public.players (
  id        serial primary key,
  name      text not null,
  team_id   int references public.teams(id) on delete cascade,
  position  text,
  unique (name, team_id)
);

-- ---------- PICKS (each manager's 4 players + 3 teams) ----------
create table public.picks (
  id         uuid primary key default gen_random_uuid(),
  manager_id uuid not null references public.profiles(id) on delete cascade,
  pick_type  text not null check (pick_type in ('player','team')),
  player_id  int references public.players(id),
  team_id    int references public.teams(id),
  created_at timestamptz not null default now(),
  -- a pick is EITHER a player or a team, never both
  check (
    (pick_type = 'player' and player_id is not null and team_id is null) or
    (pick_type = 'team'   and team_id   is not null and player_id is null)
  )
);

-- EXCLUSIVITY: a given player or team can be drafted only ONCE across the whole pool.
-- These unique indexes make a double-draft physically impossible at the database level.
create unique index picks_one_owner_player on public.picks (player_id) where player_id is not null;
create unique index picks_one_owner_team   on public.picks (team_id)   where team_id   is not null;

-- ROSTER LIMITS: max 4 players and 3 teams per manager.
create or replace function public.enforce_pick_limits()
returns trigger
language plpgsql
as $$
declare cnt int;
begin
  if new.pick_type = 'player' then
    select count(*) into cnt from public.picks
      where manager_id = new.manager_id and pick_type = 'player';
    if cnt >= 4 then raise exception 'You already have 4 players.'; end if;
  else
    select count(*) into cnt from public.picks
      where manager_id = new.manager_id and pick_type = 'team';
    if cnt >= 3 then raise exception 'You already have 3 teams.'; end if;
  end if;
  return new;
end;
$$;

create trigger trg_pick_limits
  before insert on public.picks
  for each row execute function public.enforce_pick_limits();

-- ---------- RESULTS (commissioner enters these) ----------
create table public.player_stats (
  player_id int primary key references public.players(id) on delete cascade,
  goals     int not null default 0 check (goals   >= 0),
  assists   int not null default 0 check (assists >= 0)
);

create table public.team_progress (
  team_id          int primary key references public.teams(id) on delete cascade,
  won_group        boolean not null default false,
  reached_knockout boolean not null default false,
  elim_wins        int not null default 0 check (elim_wins between 0 and 5),
  champion         boolean not null default false
);

-- ---------- STANDINGS (live calculated leaderboard) ----------
-- Scoring:
--   Players: 3 / goal, 1 / assist
--   Teams:   +3 win group, +2 reach knockout WITHOUT winning group,
--            +2 per elimination win, +1 champion
create or replace view public.manager_scores as
select
  p.id                                  as manager_id,
  p.display_name,
  coalesce(pl.pts, 0)                   as player_pts,
  coalesce(tm.pts, 0)                   as team_pts,
  coalesce(pl.pts, 0) + coalesce(tm.pts, 0) as total
from public.profiles p
left join (
  select pk.manager_id, sum(ps.goals * 3 + ps.assists * 1) as pts
  from public.picks pk
  join public.player_stats ps on ps.player_id = pk.player_id
  where pk.pick_type = 'player'
  group by pk.manager_id
) pl on pl.manager_id = p.id
left join (
  select pk.manager_id,
    sum(
        (case when tp.won_group then 3 else 0 end)
      + (case when tp.reached_knockout and not tp.won_group then 2 else 0 end)
      + tp.elim_wins * 2
      + (case when tp.champion then 1 else 0 end)
    ) as pts
  from public.picks pk
  join public.team_progress tp on tp.team_id = pk.team_id
  where pk.pick_type = 'team'
  group by pk.manager_id
) tm on tm.manager_id = p.id;

-- ============================================================
--  ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles      enable row level security;
alter table public.teams         enable row level security;
alter table public.players       enable row level security;
alter table public.picks         enable row level security;
alter table public.player_stats  enable row level security;
alter table public.team_progress enable row level security;

-- helper: is the current user the commissioner?
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select is_admin from public.profiles where id = auth.uid()), false); $$;

-- PROFILES: everyone signed in can read names; you edit only your own.
create policy "profiles readable"      on public.profiles for select to authenticated using (true);
create policy "update own profile"     on public.profiles for update to authenticated using (id = auth.uid());

-- CATALOG: everyone signed in can read; nobody edits via the app (seeded by you).
create policy "teams readable"   on public.teams   for select to authenticated using (true);
create policy "players readable" on public.players for select to authenticated using (true);
create policy "admin manages players" on public.players for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- PICKS: everyone signed in can see all picks (to know what's taken + show standings).
--        You may only add/remove YOUR OWN picks.
create policy "picks readable"   on public.picks for select to authenticated using (true);
create policy "insert own picks" on public.picks for insert to authenticated with check (manager_id = auth.uid());
create policy "delete own picks" on public.picks for delete to authenticated using (manager_id = auth.uid());

-- RESULTS: everyone reads; only the commissioner writes.
create policy "stats readable"     on public.player_stats  for select to authenticated using (true);
create policy "admin writes stats" on public.player_stats  for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "prog readable"      on public.team_progress for select to authenticated using (true);
create policy "admin writes prog"  on public.team_progress for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- DRAFT ORDER (single row, set by the commissioner) ----------
create table public.draft_order (
  id          int primary key default 1 check (id = 1),
  manager_ids uuid[] not null default '{}',  -- in pick order, [0] = pick #1
  created_at  timestamptz not null default now()
);
alter table public.draft_order enable row level security;
create policy "draft order readable" on public.draft_order for select to authenticated using (true);
create policy "admin sets order"     on public.draft_order for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================
--  AFTER RUNNING THIS:
--  1. Run seed_teams.sql and seed_players.sql.
--  2. Have everyone sign up in the app.
--  3. Make yourself commissioner:
--       update public.profiles set is_admin = true where display_name = 'YOUR NAME';
-- ============================================================

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
