"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";

export default function Draft() {
  const { loading, user, profile } = useAuth();
  const [st, setSt] = useState(null);
  const [picks, setPicks] = useState([]);
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [queue, setQueue] = useState([]);
  const [autoDraft, setAutoDraft] = useState(false);
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(Date.now());
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const procRef = useRef(0);

  const load = useCallback(async () => {
    if (!user) return;
    const [s, pk, pl, tm, pf, q] = await Promise.all([
      supabase.from("draft_state").select("*").eq("id", 1).maybeSingle(),
      supabase.from("picks").select("manager_id,pick_type,player_id,team_id"),
      supabase.from("players").select("id,name,teams(name)").order("name"),
      supabase.from("teams").select("id,name").order("name"),
      supabase.from("profiles").select("id,display_name"),
      supabase.from("draft_queue").select("queue,auto_draft").eq("manager_id", user.id).maybeSingle(),
    ]);
    setSt(s.data || null);
    setPicks(pk.data || []);
    setPlayers(pl.data || []);
    setTeams(tm.data || []);
    setProfiles(pf.data || []);
    setQueue(Array.isArray(q.data?.queue) ? q.data.queue : []);
    setAutoDraft(!!q.data?.auto_draft);
    setReady(true);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    load();
    const ch = supabase.channel("draft-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "draft_state" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "picks" }, load)
      .subscribe();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { supabase.removeChannel(ch); clearInterval(tick); };
  }, [user, load]);

  // nudge the engine to autopick expired turns (any client can; throttled)
  useEffect(() => {
    if (st?.status !== "live") return;
    const t = Date.now();
    if (t - procRef.current > 15000) {
      procRef.current = t;
      supabase.rpc("process_draft").then(() => load());
    }
  }, [st, now, load]);

  if (loading || !ready) return <div className="wrap muted">Loading…</div>;

  const playerById = Object.fromEntries(players.map(p => [p.id, p]));
  const teamById = Object.fromEntries(teams.map(t => [t.id, t]));
  const nameById = Object.fromEntries(profiles.map(p => [p.id, p.display_name]));
  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const takenP = new Set(picks.filter(p => p.player_id).map(p => p.player_id));
  const takenT = new Set(picks.filter(p => p.team_id).map(p => p.team_id));
  const mine = picks.filter(p => p.manager_id === user.id);
  const myPlayers = mine.filter(p => p.pick_type === "player");
  const myTeams = mine.filter(p => p.pick_type === "team");
  const needP = 4 - myPlayers.length;
  const needT = 3 - myTeams.length;

  const order = st?.pick_order || [];
  const cur = st?.current_pick ?? 0;
  const total = order.length;
  const live = st?.status === "live";
  const complete = st?.status === "complete";
  const onClockId = live && cur < total ? order[cur] : null;
  const myTurn = onClockId === user.id;
  const deadline = st?.clock_started ? new Date(st.clock_started).getTime() + (st.pick_seconds * 1000) : null;
  const remaining = deadline ? Math.max(0, deadline - now) : null;

  function fmt(ms) {
    if (ms == null) return "";
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  }

  // my best available queued pick with room
  const draftable = queue
    .map((it, i) => ({ ...it, i }))
    .filter(it => it.type === "player"
      ? (needP > 0 && !takenP.has(it.id))
      : (needT > 0 && !takenT.has(it.id)));
  const topPick = draftable[0] || null;
  const labelFor = (it) => it.type === "player"
    ? (playerById[it.id]?.name || "player")
    : (teamById[it.id]?.name || "team");

  async function pick(type, id) {
    setErr(""); setBusy(true);
    const { error } = await supabase.rpc("make_pick", { p_type: type, p_id: id });
    if (error) setErr(error.message);
    await load();
    setBusy(false);
  }

  // ----- queue editing -----
  const inQueue = (type, id) => queue.some(it => it.type === type && it.id === id);
  const persist = async (next) => {
    setQueue(next);
    await supabase.from("draft_queue").upsert(
      { manager_id: user.id, queue: next, updated_at: new Date().toISOString() },
      { onConflict: "manager_id" }
    );
  };
  const addQ = (type, id) => { if (!inQueue(type, id)) persist([...queue, { type, id }]); setSearch(""); };
  const removeQ = (i) => persist(queue.filter((_, idx) => idx !== i));
  const setAuto = async (next) => {
    setAutoDraft(next);
    await supabase.from("draft_queue").upsert(
      { manager_id: user.id, auto_draft: next, updated_at: new Date().toISOString() },
      { onConflict: "manager_id" }
    );
  };
  const moveQ = (i, dir) => {
    const j = i + dir; if (j < 0 || j >= queue.length) return;
    const n = [...queue]; [n[i], n[j]] = [n[j], n[i]]; persist(n);
  };

  const nq = norm(search);
  const results = nq ? [
    ...players.filter(p => !inQueue("player", p.id) && (norm(p.name).includes(nq) || norm(p.teams?.name).includes(nq)))
      .map(p => ({ type: "player", id: p.id, label: p.name, sub: p.teams?.name })),
    ...teams.filter(t => !inQueue("team", t.id) && norm(t.name).includes(nq))
      .map(t => ({ type: "team", id: t.id, label: t.name, sub: null })),
  ].slice(0, 40) : [];

  return (
    <div className="wrap">
      <style>{CSS}</style>
      <Nav profile={profile} />
      <div className="kicker">YOUR ROSTER</div>
      <h1 className="title">MY <span className="accent">DRAFT</span></h1>

      {/* ROSTER */}
      <div className="label lime">PLAYERS — {myPlayers.length}/4</div>
      {myPlayers.length === 0 && <div className="ros-empty">No players yet.</div>}
      {myPlayers.map(p => (
        <div className="slot" key={p.player_id}>
          <span>{playerById[p.player_id]?.name} <span className="muted">· {playerById[p.player_id]?.teams?.name}</span></span>
        </div>
      ))}
      <div className="label coral" style={{ marginTop: 16 }}>TEAMS — {myTeams.length}/3</div>
      {myTeams.length === 0 && <div className="ros-empty">No teams yet.</div>}
      {myTeams.map(p => (
        <div className="slot" key={p.team_id}><span>{teamById[p.team_id]?.name}</span></div>
      ))}

      {/* STATUS / ON THE CLOCK */}
      {st && st.status === "setup" && (
        <div className="card oc" style={{ marginTop: 18 }}>
          <div className="oc-h">The draft hasn&apos;t started yet</div>
          <p className="note" style={{ margin: 0 }}>
            Build your queue below so you&apos;re ready — when it&apos;s your turn you&apos;ll get to pick, and if
            you&apos;re away your queue picks for you.
          </p>
        </div>
      )}

      {complete && (
        <div className="card oc done" style={{ marginTop: 18 }}>
          <div className="oc-h">Draft complete — that&apos;s your squad. 🟢</div>
        </div>
      )}

      {live && (
        <div className={"card oc" + (myTurn ? " mine" : "")} style={{ marginTop: 18 }}>
          {myTurn ? (
            <>
              <div className="oc-h lime">You&apos;re on the clock · {fmt(remaining)} left</div>
              <p className="note" style={{ marginTop: 2 }}>
                Pick {cur + 1} of {total}. Still need {needP} player{needP !== 1 ? "s" : ""} and {needT} team{needT !== 1 ? "s" : ""}.
              </p>
              {topPick ? (
                <button className="btn" style={{ width: "100%", marginTop: 8 }} disabled={busy}
                  onClick={() => pick(topPick.type, topPick.id)}>
                  {busy ? "…" : `Draft my top pick — ${labelFor(topPick)}`}
                </button>
              ) : (
                <p className="note" style={{ marginTop: 8 }}>
                  Nothing draftable in your queue right now — add a pick below, then draft it.
                </p>
              )}
              <p className="note" style={{ marginTop: 8 }}>…or tap “Draft” on any queued pick below.</p>
              {err && <div className="err">{err}</div>}
            </>
          ) : (
            <>
              <div className="oc-h">On the clock: <span className="lime">{nameById[onClockId] || "—"}</span></div>
              <p className="note" style={{ margin: "2px 0 0" }}>Pick {cur + 1} of {total} · {fmt(remaining)} left on their clock</p>
            </>
          )}
        </div>
      )}

      {/* AUTO-DRAFT TOGGLE */}
      {st && st.status !== "complete" && (
        <div className="card auto-row" style={{ marginTop: 14 }}>
          <div className="auto-txt">
            <div className="auto-h">Auto-draft{autoDraft && <span className="auto-on">ON</span>}</div>
            <p className="note" style={{ margin: "3px 0 0" }}>
              {autoDraft
                ? "On — your top available queue pick is taken the instant it's your turn. You don't need to be here, so keep your queue deep."
                : "Off — your turn waits for you until the clock runs out, then your queue picks for you."}
            </p>
          </div>
          <button type="button" role="switch" aria-checked={autoDraft}
            className={"toggle" + (autoDraft ? " on" : "")} onClick={() => setAuto(!autoDraft)}>
            <span className="knob" />
          </button>
        </div>
      )}

      {/* QUEUE */}
      <div className="label" style={{ marginTop: 22 }}>MY QUEUE — your ranked board (auto-picks for you if you miss a turn)</div>
      <div className="card" style={{ marginTop: 4 }}>
        <input className="input" placeholder="Search players, teams or country to add…" value={search}
          autoComplete="off" onChange={(e) => setSearch(e.target.value)} />
        {search && (
          <div className="qresults">
            {results.length === 0 && <div className="qempty">No matches.</div>}
            {results.map(r => (
              <button key={r.type + r.id} type="button" className="qresult" onClick={() => addQ(r.type, r.id)}>
                <span><span className={"tag " + r.type}>{r.type === "player" ? "PLAYER" : "TEAM"}</span>{r.label}{r.sub && <span className="muted"> · {r.sub}</span>}</span>
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
            const taken = isP ? takenP.has(it.id) : takenT.has(it.id);
            const canDraft = myTurn && !taken && (isP ? needP > 0 : needT > 0);
            return (
              <div className={"qrow" + (taken ? " taken" : "")} key={it.type + it.id}>
                <div className="qrank">{i + 1}</div>
                <div className="qname">
                  <span className={"tag " + it.type}>{isP ? "PLAYER" : "TEAM"}</span>{label}
                  {sub && <span className="muted"> · {sub}</span>}
                  {taken && <span className="muted"> · taken</span>}
                </div>
                <div className="qctrls">
                  {canDraft && <button className="qbtn draft" onClick={() => pick(it.type, it.id)} disabled={busy}>Draft</button>}
                  <button className="qbtn" onClick={() => moveQ(i, -1)} disabled={i === 0} aria-label="Move up">▲</button>
                  <button className="qbtn" onClick={() => moveQ(i, +1)} disabled={i === queue.length - 1} aria-label="Move down">▼</button>
                  <button className="qbtn qx" onClick={() => removeQ(i)} aria-label="Remove">✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="note" style={{ marginTop: 18 }}>
        Rank well past 4 + 3 so you&apos;re covered when your top picks get taken. Your queue is private —
        only you can see it.
      </p>
    </div>
  );
}

const CSS = `
.ros-empty{color:var(--muted); font-size:14px; padding:4px 2px 8px;}
.slot{display:flex; align-items:center; justify-content:space-between;
  background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin-top:6px; font-size:15px;}
.oc{border:1px solid var(--line);}
.oc.mine{border-color:rgba(200,255,77,.5); background:linear-gradient(100deg, rgba(200,255,77,.08), transparent 70%);}
.oc.done{border-color:rgba(200,255,77,.4);}
.oc-h{font-family:'Anton',sans-serif; font-size:20px; text-transform:uppercase; letter-spacing:.5px;}
.tag{font-family:'Space Mono',monospace; font-size:10px; letter-spacing:1px; padding:2px 6px; border-radius:5px; margin-right:8px; vertical-align:1px;}
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
.qrow.taken{opacity:.5;}
.qrank{font-family:'Anton',sans-serif; font-size:20px; color:var(--muted); text-align:center;}
.qname{font-size:15px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.qctrls{display:flex; gap:6px; flex:none;}
.qbtn{height:34px; min-width:34px; padding:0 8px; border:1px solid var(--line); background:transparent; color:var(--ink);
  border-radius:8px; cursor:pointer; font-size:13px; line-height:1;}
.qbtn:hover{background:rgba(255,255,255,.06);}
.qbtn:disabled{opacity:.3; cursor:default;}
.qbtn.qx{color:var(--coral); border-color:rgba(255,90,60,.35);}
.qbtn.draft{color:#0a0a0a; background:var(--lime); border-color:var(--lime); font-weight:700;}
.auto-row{display:flex; align-items:center; justify-content:space-between; gap:14px;}
.auto-txt{min-width:0;}
.auto-h{font-family:'Anton',sans-serif; font-size:18px; text-transform:uppercase; letter-spacing:.5px;}
.auto-on{font-family:'Space Mono',monospace; font-size:10px; letter-spacing:1px; color:#0a0a0a;
  background:var(--lime); padding:2px 6px; border-radius:5px; margin-left:8px; vertical-align:2px;}
.toggle{flex:none; width:52px; height:30px; border-radius:999px; border:1px solid var(--line);
  background:var(--panel); position:relative; cursor:pointer; transition:background .15s, border-color .15s;}
.toggle .knob{position:absolute; top:3px; left:3px; width:22px; height:22px; border-radius:50%;
  background:var(--muted); transition:left .15s, background .15s;}
.toggle.on{background:rgba(200,255,77,.18); border-color:var(--lime);}
.toggle.on .knob{left:25px; background:var(--lime);}
`;
