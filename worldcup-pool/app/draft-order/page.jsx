"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";

const PICKS_PER_MANAGER = 7; // 4 players + 3 teams

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const r = new Uint32Array(1);
    crypto.getRandomValues(r);
    const j = r[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function DraftOrder() {
  const { loading, profile } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [order, setOrder] = useState(null);     // [{id,name}] in pick order
  const [picksMade, setPicksMade] = useState(0);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState("idle");    // idle | spinning
  const [lockedDownTo, setLockedDownTo] = useState(0);
  const [tick, setTick] = useState(0);
  const [snakeOpen, setSnakeOpen] = useState(false);
  const tickRef = useRef(null);
  const spinningRef = useRef(false);

  const load = useCallback(async () => {
    if (spinningRef.current) return; // don't clobber an in-progress reveal
    const [{ data: pf }, { data: ord }, { count }] = await Promise.all([
      supabase.from("profiles").select("id,display_name"),
      supabase.from("draft_order").select("manager_ids").eq("id", 1).maybeSingle(),
      supabase.from("picks").select("id", { count: "exact", head: true }),
    ]);
    setProfiles(pf || []);
    setPicksMade(count || 0);
    if (ord && ord.manager_ids?.length) {
      const byId = Object.fromEntries((pf || []).map(p => [p.id, p.display_name]));
      setOrder(ord.manager_ids.map(id => ({ id, name: byId[id] || "—" })));
      setLockedDownTo(0);
    } else {
      setOrder(null);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel("order-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "draft_order" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "picks" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); clearInterval(tickRef.current); };
  }, [load]);

  function spin() {
    if (profiles.length < 2) return;
    const result = shuffle(profiles.map(p => ({ id: p.id, name: p.display_name })));
    spinningRef.current = true;
    setOrder(result);
    setPhase("spinning");
    setSnakeOpen(false);
    const n = result.length;
    setLockedDownTo(n);
    tickRef.current = setInterval(() => setTick(t => t + 1), 80);
    for (let k = n - 1; k >= 0; k--) {
      setTimeout(() => setLockedDownTo(k), (n - 1 - k) * 850 + 400);
    }
    setTimeout(async () => {
      clearInterval(tickRef.current);
      setPhase("idle");
      setLockedDownTo(0);
      await supabase.from("draft_order").upsert(
        { id: 1, manager_ids: result.map(r => r.id), created_at: new Date().toISOString() },
        { onConflict: "id" }
      );
      spinningRef.current = false;
      load();
    }, (n - 1) * 850 + 400 + 700);
  }

  async function reset() {
    if (!window.confirm("Clear the draft order?")) return;
    await supabase.from("draft_order").delete().eq("id", 1);
    setOrder(null);
    load();
  }

  if (loading || !ready) return <div className="wrap muted">Loading…</div>;
  const isAdmin = !!profile?.is_admin;

  return (
    <div className="wrap">
      <style>{LOCAL_CSS}</style>
      <Nav profile={profile} />
      <div className="kicker">DRAFT LOTTERY</div>
      <h1 className="title">DRAFT <span className="accent">ORDER</span></h1>

      {/* No order yet */}
      {!order && phase === "idle" && (
        <div className="card">
          {isAdmin ? (
            <>
              <p className="note" style={{ marginTop: 0 }}>
                Spin once everyone's signed up. It's a true random shuffle (crypto RNG) and
                reveals last pick → first. The result saves for the whole group.
              </p>
              <p className="note">Managers signed up: <b style={{ color: "var(--ink)" }}>{profiles.length}</b></p>
              <button className="btn" style={{ width: "100%", marginTop: 8 }}
                disabled={profiles.length < 2} onClick={spin}>
                🎲 Spin the order
              </button>
            </>
          ) : (
            <p className="note" style={{ margin: 0 }}>
              Waiting for the commissioner to run the draft lottery.
            </p>
          )}
        </div>
      )}

      {/* Reveal + locked order */}
      {order && (
        <>
          <div className="dl-board">
            {order.map((m, idx) => {
              const locked = idx >= lockedDownTo;
              const flick = order[(tick + idx * 3) % order.length]?.name;
              const first = idx === 0;
              return (
                <div key={m.id}
                  className={"dl-row" + (locked ? " locked" : " rolling") + (locked && first ? " first" : "")}
                  style={{ animationDelay: idx * 0.04 + "s" }}>
                  <div className="dl-pick">#{idx + 1}</div>
                  <div className="dl-name">{locked ? m.name : flick}</div>
                  {locked && first && <div className="dl-badge">1ST</div>}
                </div>
              );
            })}
          </div>

          {phase === "idle" && (
            <>
              <OnClock order={order} picksMade={picksMade} />
              <div className="row" style={{ gap: 8, marginTop: 14 }}>
                <button className="btn ghost" style={{ flex: 1 }} onClick={() => setSnakeOpen(o => !o)}>
                  {snakeOpen ? "Hide snake order" : "Show snake order"}
                </button>
                {isAdmin && (
                  <button className="btn ghost" style={{ flex: 1, borderColor: "var(--coral)", color: "var(--coral)" }}
                    onClick={reset}>Re-spin / clear</button>
                )}
              </div>
              {snakeOpen && <Snake order={order} />}
              {isAdmin && <AutoDraftPanel order={order} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

function buildSnake(order) {
  const seq = [];
  for (let r = 0; r < PICKS_PER_MANAGER; r++) {
    const round = r % 2 === 0 ? order : [...order].reverse();
    round.forEach(m => seq.push(m));
  }
  return seq;
}

function OnClock({ order, picksMade }) {
  const seq = buildSnake(order);
  const total = seq.length;
  if (picksMade >= total) {
    return <div className="card" style={{ marginTop: 14 }}><b className="lime">Draft complete</b> — all {total} picks made.</div>;
  }
  const up = seq[picksMade];
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="note" style={{ margin: 0 }}>
        Pick <b style={{ color: "var(--ink)" }}>{picksMade + 1}</b> of {total}
      </div>
      <div style={{ fontWeight: 800, fontSize: 18, marginTop: 4 }}>
        On the clock: <span className="lime">{up?.name}</span>
      </div>
      <div className="note" style={{ marginTop: 4 }}>By the snake order (advisory — picks aren't locked to it).</div>
    </div>
  );
}

function Snake({ order }) {
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="label" style={{ marginTop: 0 }}>SNAKE ORDER — each pick is your call: player or team (4 + 3 total)</div>
      {Array.from({ length: PICKS_PER_MANAGER }).map((_, r) => {
        const seq = r % 2 === 0 ? order : [...order].reverse();
        return (
          <div className="dl-snake-round" key={r}>
            <div className="dl-round-lbl">ROUND {r + 1}</div>
            <div className="dl-chips">{seq.map((m, i) => <span className="dl-chip" key={i}>{m.name}</span>)}</div>
          </div>
        );
      })}
    </div>
  );
}

function AutoDraftPanel() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [short, setShort] = useState([]);

  async function run() {
    if (!window.confirm(
      "Run the auto-draft now?\n\nThis walks the snake using everyone's saved queues and fills " +
      "every empty roster slot with the best available pick on each list. Any picks already made are kept."
    )) return;

    setBusy(true); setMsg(""); setShort([]);
    try {
      const [{ data: ord }, { data: queues }, { data: picks }, { data: profs }] = await Promise.all([
        supabase.from("draft_order").select("manager_ids").eq("id", 1).maybeSingle(),
        supabase.from("draft_queue").select("manager_id,queue"),
        supabase.from("picks").select("manager_id,pick_type,player_id,team_id"),
        supabase.from("profiles").select("id,display_name"),
      ]);

      const ids = ord?.manager_ids || [];
      if (ids.length === 0) { setMsg("Set the draft order first (spin above)."); setBusy(false); return; }

      const nameById = Object.fromEntries((profs || []).map(p => [p.id, p.display_name]));
      const qById = Object.fromEntries((queues || []).map(q => [q.manager_id, q]));
      const takenP = new Set((picks || []).filter(p => p.player_id).map(p => p.player_id));
      const takenT = new Set((picks || []).filter(p => p.team_id).map(p => p.team_id));
      const cntP = {}, cntT = {};
      (picks || []).forEach(p => {
        if (p.pick_type === "player") cntP[p.manager_id] = (cntP[p.manager_id] || 0) + 1;
        else cntT[p.manager_id] = (cntT[p.manager_id] || 0) + 1;
      });

      const toInsert = [];
      for (let r = 0; r < 7; r++) {            // 4 players + 3 teams = 7 picks per manager
        const seq = r % 2 === 0 ? ids : [...ids].reverse(); // snake
        for (const mid of seq) {
          if ((cntP[mid] || 0) >= 4 && (cntT[mid] || 0) >= 3) continue; // roster full
          const list = Array.isArray(qById[mid]?.queue) ? qById[mid].queue : [];
          const item = list.find(it =>
            it.type === "player"
              ? (cntP[mid] || 0) < 4 && !takenP.has(it.id)
              : (cntT[mid] || 0) < 3 && !takenT.has(it.id)
          );
          if (!item) continue;
          if (item.type === "player") {
            takenP.add(item.id); cntP[mid] = (cntP[mid] || 0) + 1;
            toInsert.push({ manager_id: mid, pick_type: "player", player_id: item.id });
          } else {
            takenT.add(item.id); cntT[mid] = (cntT[mid] || 0) + 1;
            toInsert.push({ manager_id: mid, pick_type: "team", team_id: item.id });
          }
        }
      }

      if (toInsert.length === 0) {
        setMsg("Nothing to assign — rosters are already full, or no queues have been set yet.");
        setBusy(false); return;
      }

      const { error } = await supabase.from("picks").insert(toInsert);
      if (error) { setMsg("Error: " + error.message); setBusy(false); return; }

      const stillShort = ids
        .map(id => ({ name: nameById[id] || "—", p: cntP[id] || 0, t: cntT[id] || 0 }))
        .filter(s => s.p < 4 || s.t < 3);
      setShort(stillShort);
      setMsg(`Auto-draft complete — ${toInsert.length} picks assigned.`);
    } catch (e) {
      setMsg("Error: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="label lime" style={{ marginTop: 0 }}>AUTO-DRAFT</div>
      <p className="note" style={{ marginTop: 0 }}>
        Runs the snake from everyone&apos;s saved queues and fills empty roster slots with the best
        available pick on each list. Picks already made are kept. Safe to run again — it only fills
        what&apos;s missing.
      </p>
      <button className="btn" style={{ width: "100%", marginTop: 4 }} disabled={busy} onClick={run}>
        {busy ? "Drafting…" : "Run auto-draft"}
      </button>
      {msg && <div className="note" style={{ color: "var(--lime)", marginTop: 10 }}>{msg}</div>}
      {short.length > 0 && (
        <div className="note" style={{ marginTop: 8 }}>
          Queue ran out for: {short.map(s => `${s.name} (${s.p}/4 players, ${s.t}/3 teams)`).join(" · ")}.
          They can finish manually on My Draft, or add more to their queue and you can re-run.
        </div>
      )}
    </div>
  );
}

const LOCAL_CSS = `
.dl-board{display:flex; flex-direction:column; gap:9px; margin-top:4px;}
.dl-row{display:flex; align-items:center; gap:14px; background:var(--panel); border:1px solid var(--line);
  border-radius:13px; padding:14px 16px; min-height:56px;}
.dl-row.rolling{border-color:rgba(200,255,77,.25);}
.dl-row.rolling .dl-name{color:var(--muted); filter:blur(.4px);}
.dl-row.locked{opacity:0; animation:dlDrop .5s ease forwards;}
.dl-row.locked.first{background:linear-gradient(100deg, rgba(255,206,92,.16), var(--panel) 60%); border-color:rgba(255,206,92,.55);}
@keyframes dlDrop{from{opacity:0; transform:translateY(-6px);}to{opacity:1; transform:none;}}
.dl-pick{font-family:'Anton',sans-serif; font-size:24px; color:var(--muted); width:42px;}
.dl-row.locked.first .dl-pick{color:var(--gold);}
.dl-name{flex:1; font-size:19px; font-weight:800;}
.dl-badge{font-family:'Space Mono',monospace; font-size:9px; letter-spacing:1px; color:#0a1a0d;
  background:var(--gold); padding:4px 8px; border-radius:6px; font-weight:700;}
.dl-snake-round{padding:9px 0; border-top:1px solid var(--line);}
.dl-round-lbl{font-family:'Space Mono',monospace; font-size:10px; letter-spacing:1px; color:var(--lime); margin-bottom:7px;}
.dl-chips{display:flex; flex-wrap:wrap; gap:6px;}
.dl-chip{background:var(--panel2); border:1px solid var(--line); border-radius:999px; padding:5px 11px; font-size:12px; font-weight:600;}
.dl-snake-round:first-of-type .dl-chip:first-child{border-color:var(--gold); color:var(--gold);}
`;
