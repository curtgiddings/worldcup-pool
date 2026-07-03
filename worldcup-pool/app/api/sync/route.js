// app/api/sync/route.js
//
// Phase 1 — player goals + assists  (writes player_stats)
// Phase 2 — team group + knockout   (writes team_progress)
// Group scoring: 1st = 3, 2nd = 2, 3rd-that-advanced = 1.
// Knockout: 2 per win (max 5). Champion: +1.

import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = "https://v3.football.api-sports.io";
const LEAGUE = 1;
const SEASON = 2026;
const FINISHED = new Set(["FT", "AET", "PEN"]);

const norm = (s) =>
  (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const toks = (s) => norm(s).split(" ").filter(Boolean);
function nameMatch(draft, apiName) {
  const a = toks(draft), b = toks(apiName);
  if (!a.length || !b.length) return false;
  const sa = new Set(a), sb = new Set(b);
  if (a.every((t) => sb.has(t)) || b.every((t) => sa.has(t))) return true;
  const la = a[a.length - 1], lb = b[b.length - 1];
  if (la.length < 3 || la !== lb) return false;
  const fa = a[0], fb = b[0];
  return fa === fb || (fa.length === 1 && fb.startsWith(fa)) || (fb.length === 1 && fa.startsWith(fb));
}

const TEAM_ALIAS = {
  "cote d ivoire": "ivory coast",
  "cabo verde": "cape verde",
  "turkiye": "turkey",
  "czechia": "czech republic",
  "korea republic": "south korea",
  "united states": "usa",
  "bosnia and herzegovina": "bosnia",
  "ir iran": "iran",
  "congo dr": "dr congo",
};
const teamCanon = (s) => { const n = norm(s); return TEAM_ALIAS[n] || n; };
function teamNameMatch(poolName, apiName) {
  const A = teamCanon(poolName), B = teamCanon(apiName);
  if (!A || !B) return false;
  if (A === B) return true;
  const a = A.split(" ").filter(Boolean), b = B.split(" ").filter(Boolean);
  const sa = new Set(a), sb = new Set(b);
  return a.every((t) => sb.has(t)) || b.every((t) => sa.has(t));
}

async function api(path) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`API ${path} -> HTTP ${r.status}`);
  const j = await r.json();
  if (j.errors && (Array.isArray(j.errors) ? j.errors.length : Object.keys(j.errors).length))
    throw new Error(`API ${path} -> ${JSON.stringify(j.errors)}`);
  return j.response || [];
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const keyParam = new URL(req.url).searchParams.get("key");
  if (secret && auth !== `Bearer ${secret}` && keyParam !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.API_FOOTBALL_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "missing env vars (API_FOOTBALL_KEY / SUPABASE_SERVICE_ROLE_KEY)" }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  try {
    // ===================== PHASE 1 — players =====================
    const { data: picks } = await supabase.from("picks").select("player_id").not("player_id", "is", null);
    const ids = [...new Set((picks || []).map((p) => p.player_id))];

    const { data: dp } = ids.length
      ? await supabase.from("players").select("id,name,api_player_id,teams(name)").in("id", ids)
      : { data: [] };
    const drafted = (dp || []).map((p) => ({
      id: p.id, name: p.name, api_id: p.api_player_id ?? null, team: p.teams?.name || "",
    }));

    const fixtures = await api(`/fixtures?league=${LEAGUE}&season=${SEASON}`);
    const finishedIds = fixtures
      .filter((f) => FINISHED.has(f.fixture?.status?.short))
      .map((f) => f.fixture.id);

    const tally = new Map();
    const bump = (pl, field) => {
      if (pl?.id == null) return;
      const t = tally.get(pl.id) || { name: pl.name, goals: 0, assists: 0 };
      t[field] += 1; if (!t.name) t.name = pl.name; tally.set(pl.id, t);
    };
    for (let i = 0; i < finishedIds.length; i += 20) {
      const batch = finishedIds.slice(i, i + 20).join("-");
      const detailed = await api(`/fixtures?ids=${batch}`);
      for (const fx of detailed) {
        for (const ev of fx.events || []) {
          if (ev.type !== "Goal") continue;
          if (ev.detail === "Own Goal" || ev.detail === "Missed Penalty") continue;
          bump(ev.player, "goals");
          if (ev.assist?.id != null) bump(ev.assist, "assists");
        }
      }
    }
    const tallyArr = [...tally.entries()].map(([apiId, v]) => ({ apiId, ...v }));

    const rows = [];
    const learn = [];
    const scoring = [];
    const usedApiIds = new Set();
    for (const pl of drafted) {
      let hit = null;
      if (pl.api_id != null) hit = tallyArr.find((t) => t.apiId === pl.api_id);
      if (!hit) hit = tallyArr.find((t) => !usedApiIds.has(t.apiId) && nameMatch(pl.name, t.name));
      const goals = hit?.goals || 0, assists = hit?.assists || 0;
      rows.push({ player_id: pl.id, goals, assists });
      if (hit) {
        usedApiIds.add(hit.apiId);
        if (pl.api_id == null) learn.push({ id: pl.id, api_player_id: hit.apiId });
        if (goals || assists) scoring.push(`${pl.name} -> ${hit.name}: ${goals}G ${assists}A`);
      }
    }
    if (rows.length) {
      const { error } = await supabase.from("player_stats").upsert(rows, { onConflict: "player_id" });
      if (error) return Response.json({ error: error.message }, { status: 500 });
    }
    for (const u of learn) await supabase.from("players").update({ api_player_id: u.api_player_id }).eq("id", u.id);

    const unmatched = tallyArr
      .filter((t) => !usedApiIds.has(t.apiId) && (t.goals || t.assists))
      .sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists))
      .map((t) => `${t.name}: ${t.goals}G ${t.assists}A`);

    // ===================== PHASE 2 — teams =====================
    let teamOut = { teamsSynced: 0, teamsNewlyMapped: 0, groupsFound: 0, teamScoring: [], teamsUnmatched: [] };
    try {
      const { data: tpicks } = await supabase.from("picks").select("team_id").not("team_id", "is", null);
      const tids = [...new Set((tpicks || []).map((p) => p.team_id))];
      if (tids.length) {
        const { data: dt } = await supabase.from("teams").select("id,name,api_team_id").in("id", tids);
        const draftedTeams = (dt || []).map((t) => ({ id: t.id, name: t.name, api_id: t.api_team_id ?? null }));

        const standings = await api(`/standings?league=${LEAGUE}&season=${SEASON}`);
        const groups = standings?.[0]?.league?.standings || [];
        const groupWinners = new Set();
        const apiNameById = new Map();
        const rankById = new Map();
        for (const g of groups) {
          for (const r of g) {
            if (r?.team?.id != null) { apiNameById.set(r.team.id, r.team.name); rankById.set(r.team.id, r.rank); }
            if (r?.rank === 1 && r?.team?.id != null) groupWinners.add(r.team.id);
          }
        }

        const koWins = new Map();
        const reachedKO = new Set();
        let championApiId = null;
        for (const f of fixtures) {
          const rnd = (f.league?.round || "").toLowerCase().trim();
          if (rnd.includes("group")) continue;
          const h = f.teams?.home, a = f.teams?.away;
          if (h?.id != null) { reachedKO.add(h.id); apiNameById.set(h.id, h.name); }
          if (a?.id != null) { reachedKO.add(a.id); apiNameById.set(a.id, a.name); }
          if (!FINISHED.has(f.fixture?.status?.short)) continue;
          const isThird = rnd.includes("3rd place") || rnd.includes("third place") || rnd.includes("play-off");
          const winner = h?.winner ? h : a?.winner ? a : null;
          if (winner?.id != null) {
            if (!isThird) koWins.set(winner.id, (koWins.get(winner.id) || 0) + 1);
            if (rnd === "final") championApiId = winner.id;
          }
        }

        const teamRows = [];
        let teamLearn = 0;
        for (const t of draftedTeams) {
          let apiId = t.api_id;
          if (apiId == null) {
            for (const [aid, aname] of apiNameById) {
              if (teamNameMatch(t.name, aname)) { apiId = aid; break; }
            }
            if (apiId != null) {
              await supabase.from("teams").update({ api_team_id: apiId }).eq("id", t.id);
              teamLearn++;
            }
          }
          if (apiId == null) { teamOut.teamsUnmatched.push(t.name); continue; }

          const won_group = groupWinners.has(apiId);
          const reached_knockout = reachedKO.has(apiId) && !won_group;
          const third_place = reached_knockout && rankById.get(apiId) === 3;
          const elim_wins = Math.min(5, koWins.get(apiId) || 0);
          const champion = championApiId != null && championApiId === apiId;
          teamRows.push({ team_id: t.id, won_group, reached_knockout, third_place, elim_wins, champion });

          const bits = [];
          if (won_group) bits.push("won group");
          else if (third_place) bits.push("advanced (3rd)");
          else if (reached_knockout) bits.push("reached KO");
          if (elim_wins) bits.push(`${elim_wins} KO win${elim_wins > 1 ? "s" : ""}`);
          if (champion) bits.push("champion");
          if (bits.length) teamOut.teamScoring.push(`${t.name}: ${bits.join(" · ")}`);
        }
        if (teamRows.length) {
          const { error: terr } = await supabase.from("team_progress").upsert(teamRows, { onConflict: "team_id" });
          if (terr) throw new Error(terr.message);
        }
        teamOut.teamsSynced = teamRows.length;
        teamOut.teamsNewlyMapped = teamLearn;
        teamOut.groupsFound = groups.length;
      }
    } catch (te) {
      teamOut.teamError = te.message;
    }

    return Response.json({
      ok: true,
      finishedMatches: finishedIds.length,
      draftedSynced: rows.length,
      newlyMappedPlayers: learn.length,
      scoringDraftedPlayers: scoring,
      apiScorersNotMatched: unmatched,
      ...teamOut,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
