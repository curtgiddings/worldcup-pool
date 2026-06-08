"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";

export default function Queue() {
  const { loading, user, profile } = useAuth();
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [playerQ, setPlayerQ] = useState([]);
  const [teamQ, setTeamQ] = useState([]);
  const [pSearch, setPSearch] = useState("");
  const [tSearch, setTSearch] = useState("");
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [pl, tm, q] = await Promise.all([
      supabase.from("players").select("id,name,teams(name)").order("name"),
      supabase.from("teams").select("id,name").order("name"),
      supabase.from("draft_queue").select("player_ids,team_ids").eq("manager_id", user.id).maybeSingle(),
    ]);
    setPlayers(pl.data || []);
    setTeams(tm.data || []);
    setPlayerQ(q.data?.player_ids || []);
    setTeamQ(q.data?.team_ids || []);
    setReady(true);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const persist = useCallback(async (pq, tq) => {
    if (!user) return;
    await supabase.from("draft_queue").upsert(
      { manager_id: user.id, player_ids: pq, team_ids: tq, updated_at: new Date().toISOString() },
      { onConflict: "manager_id" }
    );
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  }, [user]);

  if (loading || !ready) return <div className="wrap muted">Loading…</div>;

  const playerById = Object.fromEntries(players.map(p => [p.id, p]));
  const teamById = Object.fromEntries(teams.map(t => [t.id, t]));
  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const setP = (next) => { setPlayerQ(next); persist(next, teamQ); };
  const setT = (next) => { setTeamQ(next); persist(playerQ, next); };
  const addPlayer = (id) => { if (!playerQ.includes(id)) setP([...playerQ, id]); setPSearch(""); };
  const addTeam = (id) => { if (!teamQ.includes(id)) setT([...teamQ, id]); setTSearch(""); };
  const move = (arr, setter, i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    setter(next);
  };

  const pq = norm(pSearch);
  const playerResults = players
    .filter(p => !playerQ.includes(p.id))
    .filter(p => pq && (norm(p.name).includes(pq) || norm(p.teams?.name).includes(pq)))
    .slice(0, 40);
  const tq = norm(tSearch);
  const teamResults = teams
    .filter(t => !teamQ.includes(t.id))
    .filter(t => tq && norm(t.name).includes(tq))
    .slice(0, 40);

  return (
    <div className="wrap">
      <style>{Q_CSS}</style>
      <Nav profile={profile} />
      <div className="q-kicker">AUTO-DRAFT BOARD {saved && <span className="q-saved">· saved ✓</span>}</div>
      <h1 className="title">MY <span className="lime">QUEUE</span></h1>
      <p className="note" style={{ marginTop: 2 }}>
        Rank as many as you like, best first. If we can&apos;t all draft live, the system fills your
        roster with the highest available pick on your list, in snake order. Saves automatically.
      </p>

      <label className="label lime" style={{ marginTop: 18 }}>PLAYER QUEUE — {playerQ.length} ranked · need 4</label>
      <div className="card" style={{ marginTop: 4 }}>
        <input className="input" placeholder="Search players or country to add…" value={pSearch}
          autoComplete="off" onChange={(e) => setPSearch(e.target.value)} />
        {pSearch && (
          <div className="qresults">
            {playerResults.length === 0 && <div className="qempty">No matches.</div>}
            {playerResults.map(p => (
              <button key={p.id} type="button" className="qresult" onClick={() => addPlayer(p.id)}>
                <span>{p.name} <span className="muted">· {p.teams?.name}</span></span>
                <span className="qadd">+ add</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <QueueList
        ids={playerQ}
        render={(id) => <>{playerById[id]?.name || "Unknown"} <span className="muted">· {playerById[id]?.teams?.name}</span></>}
        onUp={(i) => move(playerQ, setP, i, -1)}
        onDown={(i) => move(playerQ, setP, i, +1)}
        onRemove={(id) => setP(playerQ.filter(x => x !== id))}
        needed={4}
      />

      <label className="label coral" style={{ marginTop: 26 }}>TEAM QUEUE — {teamQ.length} ranked · need 3</label>
      <div className="card" style={{ marginTop: 4 }}>
        <input className="input" placeholder="Search teams to add…" value={tSearch}
          autoComplete="off" onChange={(e) => setTSearch(e.target.value)} />
        {tSearch && (
          <div className="qresults">
            {teamResults.length === 0 && <div className="qempty">No matches.</div>}
            {teamResults.map(t => (
              <button key={t.id} type="button" className="qresult" onClick={() => addTeam(t.id)}>
                <span>{t.name}</span><span className="qadd">+ add</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <QueueList
        ids={teamQ}
        render={(id) => <>{teamById[id]?.name || "Unknown"}</>}
        onUp={(i) => move(teamQ, setT, i, -1)}
        onDown={(i) => move(teamQ, setT, i, +1)}
        onRemove={(id) => setT(teamQ.filter(x => x !== id))}
        needed={3}
      />

      <p className="note" style={{ marginTop: 18 }}>
        Tip: rank more than you need (8–12 players, 5–6 teams) so you&apos;re covered when your top
        choices get snapped up by other gaffers. Highlighted rows are roughly who you&apos;d land if
        everyone were available.
      </p>
    </div>
  );
}

function QueueList({ ids, render, onUp, onDown, onRemove, needed }) {
  if (ids.length === 0) {
    return <div className="qhint">Nothing ranked yet — search above to add your first pick.</div>;
  }
  return (
    <div className="qlist">
      {ids.map((id, i) => (
        <div className={"qrow" + (i < needed ? " inrange" : "")} key={id}>
          <div className="qrank">{i + 1}</div>
          <div className="qname">{render(id)}</div>
          <div className="qctrls">
            <button className="qbtn" onClick={() => onUp(i)} disabled={i === 0} aria-label="Move up">▲</button>
            <button className="qbtn" onClick={() => onDown(i)} disabled={i === ids.length - 1} aria-label="Move down">▼</button>
            <button className="qbtn qx" onClick={() => onRemove(id)} aria-label="Remove">✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}

const Q_CSS = `
.q-kicker{font-family:'Space Mono',monospace; font-size:12px; letter-spacing:2px; color:var(--muted); margin-bottom:6px;}
.q-saved{color:var(--lime); letter-spacing:1px;}
.qresults{margin-top:8px; border:1px solid var(--line); border-radius:10px; overflow:hidden auto; max-height:260px;}
.qresult{display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%;
  text-align:left; background:transparent; border:0; border-bottom:1px solid var(--line);
  padding:10px 13px; cursor:pointer; color:var(--ink); font-size:15px; font-family:inherit;}
.qresult:last-child{border-bottom:0;}
.qresult:hover{background:rgba(255,255,255,.05);}
.qadd{font-family:'Space Mono',monospace; font-size:11px; letter-spacing:1px; color:var(--lime); flex:none;}
.qempty{padding:11px 13px; color:var(--muted); font-size:13px;}
.qhint{color:var(--muted); font-size:13px; padding:12px 2px;}
.qlist{margin-top:8px; display:flex; flex-direction:column; gap:7px;}
.qrow{display:grid; grid-template-columns:34px 1fr auto; align-items:center; gap:12px;
  background:var(--panel); border:1px solid var(--line); border-radius:11px; padding:11px 13px;}
.qrow.inrange{border-color:rgba(200,255,77,.4); box-shadow:inset 3px 0 0 var(--lime);}
.qrank{font-family:'Anton',sans-serif; font-size:20px; color:var(--muted); text-align:center;}
.qrow.inrange .qrank{color:var(--lime);}
.qname{font-size:15px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.qctrls{display:flex; gap:6px; flex:none;}
.qbtn{width:34px; height:34px; border:1px solid var(--line); background:transparent; color:var(--ink);
  border-radius:8px; cursor:pointer; font-size:13px; line-height:1;}
.qbtn:hover{background:rgba(255,255,255,.06);}
.qbtn:disabled{opacity:.3; cursor:default;}
.qbtn.qx{color:var(--coral); border-color:rgba(255,90,60,.35);}
`;
