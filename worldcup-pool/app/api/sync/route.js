// app/api/sync/route.js
//
// Phase 1 — player goals + assists.
// Pulls finished World Cup 2026 fixtures from API-Football, reads goal events
// (scorer + assist), tallies per drafted player, and upserts into player_stats —
// exactly the table your Score Entry page writes to.
//
// Trigger:  GET /api/sync?key=YOUR_CRON_SECRET    (manual test in a browser)
//           or an hourly cron with header  Authorization: Bearer YOUR_CRON_SECRET
//
// Env vars required (set in Vercel → Settings → Environment Variables):
//   API_FOOTBALL_KEY          – your api-sports key
//   SUPABASE_SERVICE_ROLE_KEY – your Supabase service_role (secret) key
//   CRON_SECRET               – any random string you invent, to lock this endpoint
//   (NEXT_PUBLIC_SUPABASE_URL is already in your env)

import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = "https://v3.football.api-sports.io";
const LEAGUE = 1;
const SEASON = 2026;
const FINISHED = new Set(["FT", "AET", "PEN"]);

// --- name normalisation + fuzzy matching (handles accents + short names) ---
const norm = (s) =>
  (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const toks = (s) => norm(s).split(" ").filter(Boolean);
function nameMatch(draft, apiName) {
  const a = toks(draft), b = toks(apiName);
  if (!a.length || !b.length) return false;
  const sb = new Set(b), sa = new Set(a);
  if (a.every((t) => sb.has(t)) || b.every((t) => sa.has(t))) return true; // token subset either way
  const la = a[a.length - 1], lb = b[b.length - 1];
  return la.length > 2 && la === lb; // last-name fallback
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
  // --- auth ---
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
    // 1) drafted players
    const { data: picks } = await supabase.from("picks").select("player_id").not("player_id", "is", null);
    const ids = [...new Set((picks || []).map((p) => p.player_id))];
    if (!ids.length) return Response.json({ ok: true, note: "no drafted players yet" });

    const { data: dp } = await supabase
      .from("players").select("id,name,api_player_id,teams(name)").in("id", ids);
    const drafted = (dp || []).map((p) => ({
      id: p.id, name: p.name, api_id: p.api_player_id ?? null, team: p.teams?.name || "",
    }));

    // 2) all fixtures -> finished ones
    const fixtures = await api(`/fixtures?league=${LEAGUE}&season=${SEASON}`);
    const finishedIds = fixtures
      .filter((f) => FINISHED.has(f.fixture?.status?.short))
      .map((f) => f.fixture.id);

    // 3) batch event pulls (20 fixtures per call) -> tally goals/assists by api player id
    const tally = new Map(); // apiId -> { name, goals, assists }
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

    // 4) match drafted players -> tally
    const rows = [];
    const learn = [];          // newly discovered api ids to persist
    const scoring = [];        // drafted players with points, for the summary
    const usedApiIds = new Set();
    for (const pl of drafted) {
      let hit = null;
      if (pl.api_id != null) hit = tallyArr.find((t) => t.apiId === pl.api_id);
      if (!hit) hit = tallyArr.find((t) => nameMatch(pl.name, t.name));
      const goals = hit?.goals || 0, assists = hit?.assists || 0;
      rows.push({ player_id: pl.id, goals, assists });
      if (hit) {
        usedApiIds.add(hit.apiId);
        if (pl.api_id == null) learn.push({ id: pl.id, api_player_id: hit.apiId });
        if (goals || assists) scoring.push(`${pl.name} → ${hit.name}: ${goals}G ${assists}A`);
      }
    }

    // 5) write stats (same table/shape as manual Score Entry)
    const { error } = await supabase.from("player_stats").upsert(rows, { onConflict: "player_id" });
    if (error) return Response.json({ error: error.message }, { status: 500 });

    // 6) remember the api ids we matched, so future syncs are ID-based and bulletproof
    for (const u of learn) await supabase.from("players").update({ api_player_id: u.api_player_id }).eq("id", u.id);

    // debug: scorers/assisters the feed has that we did NOT match — scan for any drafted player we missed
    const unmatched = tallyArr
      .filter((t) => !usedApiIds.has(t.apiId) && (t.goals || t.assists))
      .sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists))
      .map((t) => `${t.name}: ${t.goals}G ${t.assists}A`);

    return Response.json({
      ok: true,
      finishedMatches: finishedIds.length,
      draftedSynced: rows.length,
      newlyMappedPlayers: learn.length,
      scoringDraftedPlayers: scoring,
      apiScorersNotMatched: unmatched,   // <- eyeball these for anyone of yours we failed to match
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
