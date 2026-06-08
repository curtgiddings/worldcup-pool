"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";

export default function Queue() {
  const { loading, user, profile } = useAuth();
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [queue, setQueue] = useState([]); // [{ type: 'player'|'team', id }]
  const [search, setSearch] = useState("");
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [pl, tm, q] = await Promise.all([
      supabase.from("players").select("id,name,teams(name)").order("name"),
      supabase.from("teams").select("id,name").order("name"),
      supabase.from("draft_queue").select("queue").eq("manager_id", user.id).maybeSingle(),
    ]);
    setPlayers(pl.data || []);
    setTeams(tm.data || []);
    setQueue(Array.isArray(q.data?.queue) ? q.data.queue : []);
    setReady(true);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const persist = useCallback(async (next) => {
    if (!user) return;
    await supabase.from("draft_queue").upsert(
      { manager_id: user.id, queue: next, updated_at: new Date().toISOString() },
      { onConflict: "manager_id" }
    );
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  }, [user]);

  if (loading || !ready) return <div className="wrap muted">Loading…</div>;

  const playerById = Object.fromEntries(players.map(p => [p.id, p]));
  const teamById = Object.fromEntries(teams.map(t => [t.id, t]));
  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const inQueue = (type, id) => queue.some(it => it.type === type && it.id === id);
  const setQ = (next) => { setQueue(next); persist(next); };
  const add = (type, id) => { if (!inQueue(type, id)) setQ([...queue, { type, id }]); setSearch(""); };
  const removeAt = (i) => setQ(queue.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= queue.length) return;
    const next = [...queue];
    [next[i], next[j]] = [next[j], next[i]];
    setQ(next);
  };

  const nPlayers = queue.filter(it => it.type === "player").length;
  const nTeams = queue.filter(it => it.type === "team").length;

  const q = norm(search);
  const results = q
    ? [
        ...players
          .filter(p => !inQueue("player", p.id) && (norm(p.name).includes(q) || norm(p.teams?.name).includes(q)))
          .map(p => ({ type: "player", id: p.id, label: p.name, sub: p.teams?.name })),
        ...teams
          .filter(t => !inQueue("team", t.id) && norm(t.name).includes(q))
          .map(t => ({ type: "team", id: t.id, label: t.name, sub: null })),
      ].slice(0, 40)
    : [];

  return (
    <div className="wrap">
      <style>{Q_CSS}</style>
      <Nav profile={profile} />
      <div className="q-kicker">AUTO-DRAFT BOARD {saved && <span className="q-saved">· saved ✓</span>}</div>
      <h1 className="title">MY <span className="lime">QUEUE</span></h1>
      <p className="note" style={{ marginTop: 2 }}>
        One ranked list, best first — mix players and teams in any order you like. When it&apos;s your
        pick and you&apos;re away, the draft takes the highest pick still available that you have room
        for. Saves automatically.
      </p>

      <div className="qcounts">
        <span className={nPlayers >= 4 ? "ok" : ""}>Players ranked: <b>{nPlayers}</b><span className="muted"> / need 4</span></span>
        <span className={nTeams >= 3 ? "ok" : ""}>Teams ranked: <b>{nTeams}</b><span className="muted"> / need 3</span></span>
      </div>

      <div className="card" style={{ marginTop: 10 }}>
        <input className="input" placeholder="Search players, teams or country to add…" value={search}
          autoComplete="off" onChange={(e) => setSearch(e.target.value)} />
        {search && (
          <div className="qresults">
            {results.length === 0 && <div className="qempty">No matches.</div>}
            {results.map(r => (
              <button key={r.type + r.id} type="button" className="qresult" onClick={() => add(r.type, r.id)}>
                <span>
                  <span className={"tag " + r.type}>{r.type === "player" ? "PLAYER" : "TEAM"}</span>
                  {r.label}{r.sub && <span className="muted"> · {r.sub}</span>}
                </span>
                <span className="qadd">+ add</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {queue.length === 0 ? (
        <div className="qhint">Nothing ranked yet — search above to add your first pick.</div>
      ) : (
        <div className="qlist">
          {queue.map((it, i) => {
            const isP = it.type === "player";
            const label = isP ? (playerById[it.id]?.name || "Unknown") : (teamById[it.id]?.name || "Unknown");
            const sub = isP ? playerById[it.id]?.teams?.name : null;
            return (
              <div className="qrow" key={it.type + it.id}>
                <div className="qrank">{i + 1}</div>
                <div className="qname">
                  <span className={"tag " + it.type}>{isP ? "PLAYER" : "TEAM"}</span>
                  {label}{sub && <span className="muted"> · {sub}</span>}
                </div>
                <div className="qctrls">
                  <button className="qbtn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">▲</button>
                  <button className="qbtn" onClick={() => move(i, +1)} disabled={i === queue.length - 1} aria-label="Move down">▼</button>
                  <button className="qbtn qx" onClick={() => removeAt(i)} aria-label="Remove">✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="note" style={{ marginTop: 18 }}>
        Tip: rank well past your 4 + 3 (say 10–12 picks) so you&apos;re covered when others grab your
        top choices. If you fill up on one type, the draft skips to the next pick you can still use.
      </p>
    </div>
  );
}

const Q_CSS = `
.q-kicker{font-family:'Space Mono',monospace; font-size:12px; letter-spacing:2px; color:var(--muted); margin-bottom:6px;}
.q-saved{color:var(--lime); letter-spacing:1px;}
.qcounts{display:flex; gap:20px; flex-wrap:wrap; font-size:14px; margin-top:4px;}
.qcounts .ok b{color:var(--lime);}
.tag{font-family:'Space Mono',monospace; font-size:10px; letter-spacing:1px; padding:2px 6px;
  border-radius:5px; margin-right:8px; vertical-align:1px;}
.tag.player{color:var(--lime); border:1px solid rgba(200,255,77,.4);}
.tag.team{color:var(--coral); border:1px solid rgba(255,90,60,.4);}
.qresults{margin-top:8px; border:1px solid var(--line); border-radius:10px; overflow:hidden auto; max-height:280px;}
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
.qrank{font-family:'Anton',sans-serif; font-size:20px; color:var(--muted); text-align:center;}
.qname{font-size:15px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.qctrls{display:flex; gap:6px; flex:none;}
.qbtn{width:34px; height:34px; border:1px solid var(--line); background:transparent; color:var(--ink);
  border-radius:8px; cursor:pointer; font-size:13px; line-height:1;}
.qbtn:hover{background:rgba(255,255,255,.06);}
.qbtn:disabled{opacity:.3; cursor:default;}
.qbtn.qx{color:var(--coral); border-color:rgba(255,90,60,.35);}
`;
