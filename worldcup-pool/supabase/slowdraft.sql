-- ============================================================
--  SLOW DRAFT ENGINE — clocked snake draft + autopick
--  Run ONCE in the Supabase SQL editor (after schema.sql + autodraft.sql).
--  Safe to re-run.
-- ============================================================

-- ---------- draft state (single row) ----------
create table if not exists public.draft_state (
  id            int primary key default 1 check (id = 1),
  status        text not null default 'setup' check (status in ('setup','live','complete')),
  pick_order    uuid[] not null default '{}',  -- full snake sequence of manager_ids
  current_pick  int  not null default 0,        -- # picks completed = index of the next turn
  pick_seconds  int  not null default 28800,    -- clock per pick (default 8h)
  clock_started timestamptz,
  updated_at    timestamptz not null default now()
);
insert into public.draft_state (id) values (1) on conflict (id) do nothing;

alter table public.draft_state enable row level security;
drop policy if exists "state readable" on public.draft_state;
create policy "state readable" on public.draft_state for select to authenticated using (true);
-- No client writes: every change goes through the SECURITY DEFINER functions below.

-- ---------- privacy: only the OWNER may read their queue ----------
-- (The draft functions read queues internally as SECURITY DEFINER, so nobody —
--  not even the commissioner — can read someone else's board through the app.)
drop policy if exists "queue read" on public.draft_queue;
create policy "queue read" on public.draft_queue for select to authenticated
  using (manager_id = auth.uid());

-- ---------- picks are written ONLY through the draft functions ----------
drop policy if exists "insert own picks"    on public.picks;
drop policy if exists "admin inserts picks" on public.picks;
drop policy if exists "delete own picks"    on public.picks;
-- "picks readable" select policy stays as-is.

-- ---------- helpers ----------
create or replace function public._count_picks(p_mgr uuid, p_type text)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.picks where manager_id = p_mgr and pick_type = p_type;
$$;

create or replace function public._taken(p_type text, p_id int)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.picks
    where (p_type = 'player' and player_id = p_id)
       or (p_type = 'team'   and team_id   = p_id)
  );
$$;

-- autopick the highest-ranked available item the manager still has room for
create or replace function public._autopick(p_mgr uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  q jsonb; it jsonb; t text; i int; np int; nt int;
begin
  select queue into q from public.draft_queue where manager_id = p_mgr;
  if q is null then return false; end if;
  np := public._count_picks(p_mgr, 'player');
  nt := public._count_picks(p_mgr, 'team');
  for it in select * from jsonb_array_elements(q) loop
    t := it->>'type'; i := (it->>'id')::int;
    if t = 'player' and np < 4 and not public._taken('player', i) then
      insert into public.picks (manager_id, pick_type, player_id) values (p_mgr, 'player', i);
      return true;
    elsif t = 'team' and nt < 3 and not public._taken('team', i) then
      insert into public.picks (manager_id, pick_type, team_id) values (p_mgr, 'team', i);
      return true;
    end if;
  end loop;
  return false;
end $$;

-- ---------- commissioner: build the snake and go live ----------
create or replace function public.start_draft(p_pick_seconds int default 28800)
returns void language plpgsql security definer set search_path = public as $$
declare
  base uuid[]; rev uuid[]; snake uuid[] := '{}'; r int;
begin
  if not public.is_admin() then raise exception 'Only the commissioner can start the draft.'; end if;
  select manager_ids into base from public.draft_order where id = 1;
  if base is null or array_length(base,1) is null then
    raise exception 'Set the draft order first (spin the lottery).';
  end if;
  select array_agg(base[i] order by i desc) into rev from generate_subscripts(base,1) g(i);
  for r in 0..6 loop                          -- 7 rounds = 4 players + 3 teams
    if r % 2 = 0 then snake := snake || base; else snake := snake || rev; end if;
  end loop;
  update public.draft_state
    set status = 'live', pick_order = snake, current_pick = 0,
        pick_seconds = greatest(p_pick_seconds, 60), clock_started = now(), updated_at = now()
    where id = 1;
end $$;

-- ---------- on-the-clock manager makes a pick ----------
create or replace function public.make_pick(p_type text, p_id int)
returns void language plpgsql security definer set search_path = public as $$
declare st public.draft_state; on_clock uuid;
begin
  select * into st from public.draft_state where id = 1 for update;
  if st.status <> 'live' then raise exception 'The draft is not live.'; end if;
  if st.current_pick >= coalesce(array_length(st.pick_order,1),0) then
    raise exception 'The draft is complete.';
  end if;
  on_clock := st.pick_order[st.current_pick + 1];
  if on_clock <> auth.uid() then raise exception 'It is not your turn.'; end if;
  if p_type not in ('player','team') then raise exception 'Invalid pick type.'; end if;
  if public._taken(p_type, p_id) then raise exception 'Just taken — pick another.'; end if;
  if p_type = 'player' and public._count_picks(auth.uid(),'player') >= 4 then raise exception 'You already have 4 players.'; end if;
  if p_type = 'team'   and public._count_picks(auth.uid(),'team')   >= 3 then raise exception 'You already have 3 teams.'; end if;

  if p_type = 'player' then
    insert into public.picks (manager_id, pick_type, player_id) values (auth.uid(),'player',p_id);
  else
    insert into public.picks (manager_id, pick_type, team_id)   values (auth.uid(),'team',p_id);
  end if;

  update public.draft_state
    set current_pick = current_pick + 1, clock_started = now(), updated_at = now()
    where id = 1;
  update public.draft_state set status = 'complete'
    where id = 1 and current_pick >= coalesce(array_length(pick_order,1),0);
end $$;

-- ---------- advance any expired turns via autopick (anyone may call) ----------
create or replace function public.process_draft()
returns void language plpgsql security definer set search_path = public as $$
declare st public.draft_state; on_clock uuid; guard int := 0;
begin
  loop
    guard := guard + 1; if guard > 1000 then exit; end if;
    select * into st from public.draft_state where id = 1 for update;
    if st.status <> 'live' then exit; end if;
    if st.current_pick >= coalesce(array_length(st.pick_order,1),0) then
      update public.draft_state set status='complete', updated_at=now() where id=1; exit;
    end if;
    if now() < st.clock_started + make_interval(secs => st.pick_seconds) then
      exit;  -- current pick still has time on the clock
    end if;
    on_clock := st.pick_order[st.current_pick + 1];
    perform public._autopick(on_clock);  -- skip if their queue can't fill (advance anyway)
    update public.draft_state
      set current_pick = current_pick + 1, clock_started = now(), updated_at = now()
      where id = 1;
  end loop;
end $$;

-- ---------- commissioner: autopick everyone immediately (skip the clock) ----------
create or replace function public.finish_draft()
returns void language plpgsql security definer set search_path = public as $$
declare st public.draft_state; on_clock uuid; guard int := 0;
begin
  if not public.is_admin() then raise exception 'Only the commissioner can do that.'; end if;
  loop
    guard := guard + 1; if guard > 1000 then exit; end if;
    select * into st from public.draft_state where id = 1 for update;
    if st.status <> 'live' then exit; end if;
    if st.current_pick >= coalesce(array_length(st.pick_order,1),0) then
      update public.draft_state set status='complete', updated_at=now() where id=1; exit;
    end if;
    on_clock := st.pick_order[st.current_pick + 1];
    perform public._autopick(on_clock);
    update public.draft_state
      set current_pick = current_pick + 1, clock_started = now(), updated_at = now()
      where id = 1;
  end loop;
end $$;

-- ---------- commissioner: wipe picks and reset to setup ----------
create or replace function public.reset_draft()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the commissioner can do that.'; end if;
  delete from public.picks;
  update public.draft_state
    set status='setup', pick_order='{}', current_pick=0, clock_started=null, updated_at=now()
    where id = 1;
end $$;

grant execute on function public.start_draft(int)    to authenticated;
grant execute on function public.make_pick(text,int) to authenticated;
grant execute on function public.process_draft()     to authenticated;
grant execute on function public.finish_draft()      to authenticated;
grant execute on function public.reset_draft()        to authenticated;

-- live updates for the clock/turn
alter publication supabase_realtime add table public.draft_state;
