"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";

const PICKS_PER_MANAGER = 7; // 4 players + 3 teams

export default function Board() {
  const { loading, user, profile } = useAuth();
  const [picks, setPicks] = useState([]);
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [order, setOrder] = useState([]); // manager_ids in pick order
  const [st, setSt] = useState(null);
  const [view, setView] = useState("feed"); // feed | grid
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const [pk, pl, tm, pf, ord, ds] = await Promise.all([
      supabase.from("picks").select("manager_id,pick_type,player_id,team_id,created_at").order("created_at", { ascending: true }),
      supabase.from("players").select("id,name,position,teams(name)"),
      supabase.from("teams").select("id,name"),
      supabase.from("profiles").select("id,display_name"),
      supabase.from("draft_order").select("manager_ids").eq("id", 1).maybeSingle(),
      supabase.from("draft_state").select("status,pick_order,current_pick").eq("id", 1).maybeSingle(),
    ]);
    setPicks(pk.data || []);
    setPlayers(pl.data || []);
    setTeams(tm.data || []);
    setProfiles(pf.data || []);
    setOrder(ord.data?.manager_ids || []);
    setSt(ds.data || null);
    setReady(true);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel("board-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "picks" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "draft_state" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "draft_order" }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [load]);

  if (loading || !ready) return <div className="wrap muted">Loading...</div>;

  const nameById = Object.fromEntries(profiles.map(p => [p.id, p.display_name]));
  const playerById = Object.fromEntries(players.map(p => [p.id, p]));
  const teamById = Object.fromEntries(teams.map(t => [t.id, t]));

  const N = order.length || profiles.length || 8;

  const assetOf = (pk) => {
    if (pk.pick_type === "player") {
      const pl = playerById[pk.player_id];
      return { name: pl?.name || "Unknown", sub: `${pl?.position || "-"} · ${pl?.teams?.name || "-"}`, type: "player" };
    }
    return { name: teamById[pk.team_id]?.name || "Unknown", sub: "Team", type: "team" };
  };

  const ordered = picks.map((pk, i) => ({
    key: i,
    overall: i + 1,
    round: Math.floor(i / N) + 1,
    inRound: (i % N) + 1,
    manager: nameById[pk.manager_id] || "-",
    asset: assetOf(pk),
    mine: !!(user && pk.manager_id === user.id),
  }));

  const total = N * PICKS_PER_MANAGER;
  const made = picks.length;

  let clockName = null;
  if (st && st.status === "live" && st.pick_order && st.current_pick < st.pick_order.length) {
    clockName = nameById[st.pick_order[st.current_pick]] || "-";
  }

  // grid: columns = draft order, rows = rounds; a manager's i-th pick = round i+1
  const byManager = {};
  picks.forEach(pk => { (byManager[pk.manager_id] = byManager[pk.manager_id] || []).push(pk); });
  const cols = order.length ? order : profiles.map(p => p.id);
  const roundCounts = Object.values(byManager).map(a => a.length);
  const maxRound = Math.max(PICKS_PER_MANAGER, roundCounts.length ? Math.max(...roundCounts) : 0, 1);

  const feed = [...ordered].reverse(); // newest first

  return (
    <div className="wrap">
      <style>{CSS}</style>
      <Nav profile={profile} />
      <div className="b-kicker">DRAFT BOARD · EVERY PICK AS IT HAPPENS</div>
      <h1 className="title" style={{ marginBottom: 16 }}>THE <span className="lime">BOARD</span></h1>

      <div className="b-bar">
        <div className="b-status">
          {st && st.status === "live" && clockName && <>On the clock: <b className="lime">{clockName}</b> · </>}
          {st && st.status === "complete" && <><b className="lime">Draft complete</b> · </>}
          {(!st || st.status === "setup") && <>Draft hasn't started · </>}
          <span className="b-prog">{made} of {total} picks made</span>
        </div>
        <div className="b-toggle">
          <button className={view === "feed" ? "on" : ""} onClick={() => setView("feed")}>Feed</button>
          <button className={view === "grid" ? "on" : ""} onClick={() => setView("grid")}>Grid</button>
        </div>
      </div>

      {made === 0 && <p className="note">No picks yet — they'll appear here live as the draft runs.</p>}

      {made > 0 && view === "feed" && (
        <div className="b-feed">
          {feed.map(p => (
            <div key={p.key} className={"b-card " + p.asset.type + (p.mine ? " mine" : "")}>
              <div className="b-meta">
                PICK {p.overall} · R{p.round}·{p.inRound}
                <span className={"b-tag " + p.asset.type}>{p.asset.type === "player" ? "PLAYER" : "TEAM"}</span>
              </div>
              <div className="b-mgr">{p.manager}{p.mine && <span className="you"> · you</span>}</div>
              <div className="b-asset">
                <span className="b-name">{p.asset.name}</span>
                <span className="b-sub">{p.asset.sub}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {made > 0 && view === "grid" && (
        <div className="b-gridwrap">
          <table className="b-grid">
            <thead>
              <tr>
                <th className="b-rnd"></th>
                {cols.map(mid => <th key={mid}>{nameById[mid] || "-"}</th>)}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxRound }).map((_, r) => (
                <tr key={r}>
                  <td className="b-rnd">R{r + 1}</td>
                  {cols.map(mid => {
                    const pk = (byManager[mid] || [])[r];
                    if (!pk) return <td key={mid} className="b-empty">·</td>;
                    const a = assetOf(pk);
                    return <td key={mid} className={"b-cell " + a.type}>{a.name}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const CSS = `
.b-kicker{font-family:'Space Mono',monospace; font-size:12px; letter-spacing:2px; color:var(--muted); margin-bottom:6px;}
.b-bar{display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:18px; flex-wrap:wrap;}
.b-status{font-family:'Space Mono',monospace; font-size:12.5px; color:var(--muted);}
.b-prog{color:var(--ink);}
.b-toggle{display:inline-flex; border:1px solid var(--line); border-radius:999px; overflow:hidden;}
.b-toggle button{background:transparent; color:var(--muted); border:none; padding:6px 16px;
  font-family:'Space Mono',monospace; font-size:12px; letter-spacing:1px; cursor:pointer;}
.b-toggle button.on{background:var(--lime); color:#0a0a0a; font-weight:700;}

.b-feed{display:flex; flex-direction:column; gap:9px;}
.b-card{position:relative; background:var(--panel); border:1px solid var(--line);
  border-radius:13px; padding:12px 16px 13px 18px;}
.b-card::before{content:''; position:absolute; left:0; top:10px; bottom:10px; width:4px; border-radius:4px;}
.b-card.player::before{background:var(--lime);}
.b-card.team::before{background:var(--coral);}
.b-card.mine{border-color:rgba(255,255,255,.22);}
.b-meta{font-family:'Space Mono',monospace; font-size:10.5px; letter-spacing:1.5px; color:var(--muted);
  display:flex; align-items:center; gap:8px;}
.b-tag{margin-left:auto; padding:2px 7px; border-radius:5px; font-size:9px; letter-spacing:1px;}
.b-tag.player{color:var(--lime); border:1px solid rgba(200,255,77,.40);}
.b-tag.team{color:var(--coral); border:1px solid rgba(255,90,60,.40);}
.b-mgr{font-family:'Anton',sans-serif; font-size:19px; text-transform:uppercase; letter-spacing:.5px; margin-top:5px;}
.you{font-family:'Space Mono',monospace; font-size:11px; color:var(--coral); letter-spacing:1px;}
.b-asset{display:flex; align-items:baseline; gap:9px; margin-top:2px; flex-wrap:wrap;}
.b-name{font-size:15px; color:var(--ink);}
.b-sub{font-family:'Space Mono',monospace; font-size:12px; color:var(--muted);}

.b-gridwrap{overflow-x:auto; -webkit-overflow-scrolling:touch; border:1px solid var(--line); border-radius:13px;}
.b-grid{border-collapse:collapse; min-width:100%; font-size:12px;}
.b-grid th, .b-grid td{padding:9px 11px; text-align:left; white-space:nowrap;
  border-bottom:1px solid var(--line); border-right:1px solid var(--line);}
.b-grid th{font-family:'Space Mono',monospace; font-size:10.5px; letter-spacing:1px; color:var(--muted);
  position:sticky; top:0; background:#0a0a0a;}
.b-grid td.b-rnd, .b-grid th.b-rnd{font-family:'Space Mono',monospace; color:var(--muted);
  position:sticky; left:0; background:#0a0a0a; z-index:1;}
.b-cell.player{color:var(--lime);}
.b-cell.team{color:var(--coral);}
.b-empty{color:var(--muted);}
`;
