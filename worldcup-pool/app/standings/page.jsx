"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";

export default function Standings() {
  const { loading, user, profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [picks, setPicks] = useState([]);
  const [players, setPlayers] = useState([]);
  const [stats, setStats] = useState([]);
  const [teams, setTeams] = useState([]);
  const [prog, setProg] = useState([]);
  const [open, setOpen] = useState(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const [sc, pk, pl, st, tm, pr] = await Promise.all([
      supabase.from("manager_scores").select("*"),
      supabase.from("picks").select("manager_id,pick_type,player_id,team_id"),
      supabase.from("players").select("id,name,teams(name)"),
      supabase.from("player_stats").select("player_id,goals,assists"),
      supabase.from("teams").select("id,name"),
      supabase.from("team_progress").select("team_id,won_group,reached_knockout,elim_wins,champion"),
    ]);
    setRows((sc.data || []).sort((a, b) => b.total - a.total));
    setPicks(pk.data || []);
    setPlayers(pl.data || []);
    setStats(st.data || []);
    setTeams(tm.data || []);
    setProg(pr.data || []);
    setReady(true);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel("scores-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "player_stats" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_progress" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "picks" }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [load]);

  if (loading || !ready) return <div className="wrap muted">Loading…</div>;

  const playerById = Object.fromEntries(players.map(p => [p.id, p]));
  const statById = Object.fromEntries(stats.map(s => [s.player_id, s]));
  const teamById = Object.fromEntries(teams.map(t => [t.id, t]));
  const progById = Object.fromEntries(prog.map(tp => [tp.team_id, tp]));

  const teamPts = (tp) => tp
    ? (tp.won_group ? 3 : 0)
      + (tp.reached_knockout && !tp.won_group ? 2 : 0)
      + (tp.elim_wins || 0) * 2
      + (tp.champion ? 1 : 0)
    : 0;

  const teamLabel = (tp) => {
    if (!tp) return "No result yet";
    const parts = [];
    if (tp.won_group) parts.push("Won group");
    else if (tp.reached_knockout) parts.push("Reached knockouts");
    if (tp.elim_wins) parts.push(`${tp.elim_wins} KO round${tp.elim_wins > 1 ? "s" : ""} won`);
    if (tp.champion) parts.push("Champions");
    return parts.length ? parts.join(" · ") : "No result yet";
  };

  const rosterFor = (managerId) => {
    const mine = picks.filter(p => p.manager_id === managerId);
    const ps = mine.filter(p => p.pick_type === "player").map(p => {
      const pl = playerById[p.player_id];
      const s = statById[p.player_id] || { goals: 0, assists: 0 };
      return {
        id: p.player_id, name: pl?.name || "Unknown", country: pl?.teams?.name || "—",
        goals: s.goals || 0, assists: s.assists || 0, pts: (s.goals || 0) * 3 + (s.assists || 0),
      };
    }).sort((a, b) => b.pts - a.pts);
    const ts = mine.filter(p => p.pick_type === "team").map(p => {
      const tp = progById[p.team_id];
      return { id: p.team_id, name: teamById[p.team_id]?.name || "Unknown", label: teamLabel(tp), pts: teamPts(tp) };
    }).sort((a, b) => b.pts - a.pts);
    return { players: ps, teams: ts };
  };

  const toggle = (id) => setOpen(open === id ? null : id);

  return (
    <div className="wrap">
      <style>{TABLE_CSS}</style>
      <Nav profile={profile} />
      <div className="t-kicker">CURRENT STANDINGS · TAP A GAFFER FOR THEIR ROSTER</div>
      <h1 className="title" style={{ marginBottom: 30 }}>THE <span className="lime">TABLE</span></h1>

      {rows.length === 0 && <p className="note">No gaffers have signed up yet.</p>}

      {rows.length > 0 && (
        <div className="tbl">
          <div className="tbl-head">
            <div className="c-rank">#</div>
            <div className="c-name">GAFFER</div>
            <div className="c-num">PLAYERS</div>
            <div className="c-num">TEAMS</div>
            <div className="c-pts">PTS</div>
          </div>
          {rows.map((r, i) => {
            const leader = i === 0;
            const mine = user && r.manager_id === user.id;
            const isOpen = open === r.manager_id;
            const ros = isOpen ? rosterFor(r.manager_id) : null;
            return (
              <div key={r.manager_id}>
                <div
                  className={"tbl-row" + (leader ? " leader" : "") + (mine && !leader ? " mine" : "") + (isOpen ? " open" : "")}
                  role="button" tabIndex={0} aria-expanded={isOpen}
                  onClick={() => toggle(r.manager_id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(r.manager_id); } }}
                >
                  <div className="c-rank">{i + 1}</div>
                  <div className="c-name">
                    {r.display_name}{mine && <span className="you"> · you</span>}
                    <span className="caret">{isOpen ? "▾" : "▸"}</span>
                  </div>
                  <div className="c-num">{r.player_pts}</div>
                  <div className="c-num">{r.team_pts}</div>
                  <div className="c-pts">{r.total}</div>
                </div>

                {isOpen && (
                  <div className="tbl-detail">
                    <div className="det-col">
                      <div className="det-h lime">PLAYERS · {r.player_pts} PTS</div>
                      {ros.players.length === 0 && <div className="det-empty">No players drafted.</div>}
                      {ros.players.map(p => (
                        <div className="det-row" key={"p" + p.id}>
                          <div className="det-left">
                            <div className="det-name">{p.name}</div>
                            <div className="det-sub">{p.country} · {p.goals}G {p.assists}A</div>
                          </div>
                          <div className="det-pts">{p.pts}</div>
                        </div>
                      ))}
                    </div>
                    <div className="det-col">
                      <div className="det-h coral">TEAMS · {r.team_pts} PTS</div>
                      {ros.teams.length === 0 && <div className="det-empty">No teams drafted.</div>}
                      {ros.teams.map(t => (
                        <div className="det-row" key={"t" + t.id}>
                          <div className="det-left">
                            <div className="det-name">{t.name}</div>
                            <div className="det-sub">{t.label}</div>
                          </div>
                          <div className="det-pts">{t.pts}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const TABLE_CSS = `
.t-kicker{font-family:'Space Mono',monospace; font-size:12px; letter-spacing:2px; color:var(--muted); margin-bottom:6px;}
.tbl{width:100%;}
.tbl-head, .tbl-row{display:grid; grid-template-columns:46px 1fr 92px 92px 96px; align-items:center;}
.tbl-head{padding:0 16px 12px; border-bottom:1px solid var(--line);}
.tbl-head > div{font-family:'Space Mono',monospace; font-size:11px; letter-spacing:1.5px; color:var(--muted);}
.tbl-row{padding:18px 16px; border-bottom:1px solid var(--line); position:relative; cursor:pointer; user-select:none;}
.tbl-row:hover{background:rgba(255,255,255,.03);}
.tbl-row.open{background:rgba(255,255,255,.04);}
.c-rank{font-family:'Space Mono',monospace; color:var(--muted); font-size:15px;}
.c-name{font-family:'Anton',sans-serif; font-size:22px; letter-spacing:.5px; text-transform:uppercase;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
.caret{font-family:'Space Mono',monospace; color:var(--muted); font-size:13px; margin-left:9px; vertical-align:2px;}
.c-num{text-align:right; font-family:'Space Mono',monospace; color:var(--muted); font-size:15px;}
.c-pts{text-align:right; font-family:'Anton',sans-serif; font-size:27px;}
.tbl-row.leader{background:linear-gradient(90deg, rgba(200,255,77,.10), transparent 72%);}
.tbl-row.leader .c-rank, .tbl-row.leader .c-name{color:var(--lime);}
.tbl-row.leader::before{content:''; position:absolute; left:0; top:8px; bottom:8px; width:4px; background:var(--lime);}
.tbl-row.mine::before{content:''; position:absolute; left:0; top:8px; bottom:8px; width:4px; background:var(--coral);}
.you{font-family:'Space Mono',monospace; font-size:11px; color:var(--coral); letter-spacing:1px;}

.tbl-detail{border-bottom:1px solid var(--line); padding:8px 16px 22px;
  display:grid; grid-template-columns:1fr 1fr; gap:30px;}
.det-h{font-family:'Space Mono',monospace; font-size:11px; letter-spacing:1.5px; margin:12px 0 4px;}
.det-h.lime{color:var(--lime);}
.det-h.coral{color:var(--coral);}
.det-row{display:flex; justify-content:space-between; align-items:baseline; gap:12px;
  padding:9px 0; border-top:1px solid rgba(255,255,255,.06);}
.det-left{min-width:0;}
.det-name{font-size:15px; color:var(--ink);}
.det-sub{color:var(--muted); font-size:12.5px; margin-top:2px; font-family:'Space Mono',monospace;}
.det-pts{font-family:'Anton',sans-serif; font-size:19px; flex:none;}
.det-empty{color:var(--muted); font-size:13px; padding:9px 0;}

@media (max-width:560px){
  .tbl-head, .tbl-row{grid-template-columns:34px 1fr 72px;}
  .c-num{display:none;}
  .c-name{font-size:18px;}
  .c-pts{font-size:23px;}
  .tbl-detail{grid-template-columns:1fr; gap:6px;}
}
