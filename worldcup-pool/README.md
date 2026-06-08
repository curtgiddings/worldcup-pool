# World Cup 2026 Pool

A login-gated fantasy pool. Each manager drafts **4 players + 3 teams**. A player or
team can only be on **one** roster — enforced by the database, not just the UI. The
commissioner enters goals/assists and team progress; standings update live.

**Scoring**
- Players: 3 / goal, 1 / assist
- Teams: +3 win group · +2 reach knockout (R32) · +2 per elimination win · +1 champion

---

## 1. Create the database

1. Make a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run, in order:
   - `supabase/schema.sql`
   - `supabase/seed_teams.sql`
   - `supabase/seed_players.sql`
3. **Turn on Realtime** so the draft + standings update live: Supabase
   **Database → Publications → `supabase_realtime`**, and add the tables
   `picks`, `players`, `player_stats`, `team_progress`, `draft_order`.

## 2. Auth settings

Email + password is on by default. For a friends pool you probably want instant
access, so under **Authentication → Sign In / Providers → Email**, turn **off
"Confirm email."** Then sign-up logs people straight in. Leave it on if you'd
rather verify addresses (people will click a link before they can log in).

## 3. Run it

```bash
cp .env.local.example .env.local   # paste your Project URL + anon key
npm install
npm run dev
```

Open http://localhost:3000.

## 4. Make yourself commissioner

After you sign up, run this in the SQL editor (only the commissioner sees Score Entry):

```sql
update public.profiles set is_admin = true where display_name = 'Curt';
```

## 5. Deploy (optional)

Push to GitHub → import to [Vercel](https://vercel.com) → add the two
`NEXT_PUBLIC_…` env vars → deploy. Share the URL with your 8 friends.

---

## The player pool (and adding more)

`seed_players.sql` ships ~150 **projected scorers and creators** — the attackers
who actually get drafted in a goals/assists pool — built from the 2026 top-scorer
markets plus each contender's established starters. Since only 32 players get
drafted (8 × 4), that's plenty of headroom with no dead weight.

Add anyone who's missing in one line:

```sql
insert into public.players (name, team_id, position)
select 'Player Name', id, 'FW' from public.teams where name = 'Brazil';
```

If you'd rather load **every** team's full 26-man squad, import a CSV instead of
typing names (keeps spelling exact):

1. CSV columns: `team_name,name,position` (from ESPN / FIFA / Wikipedia).
2. Import it into a staging table via the Table Editor's **Import data from CSV**:

   ```sql
   create table players_import (team_name text, name text, position text);
   ```

3. Move the rows into `players`, mapping team name → id:

   ```sql
   insert into public.players (name, team_id, position)
   select i.name, t.id, i.position
   from players_import i
   join public.teams t on t.name = i.team_name
   on conflict do nothing;

   drop table players_import;
   ```
