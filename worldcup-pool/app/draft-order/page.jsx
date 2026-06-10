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
  const [autoSet, setAutoSet] = useState(() => new Set()); // manager_ids on auto-draft
  const [picksMade, setPicksMade] = useState(0);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState("idle");    // idle | spinning
  const [lockedDownTo, setLockedDownTo] = useState(0);
  const [tick, setTick] = useState(0);
  const [snakeOpen, setSnakeOpen] = useState(false);
  const [spinLabel, setSpinLabel] = useState("");
  const tickRef = useRef(null);
  const spinningRef = useRef(false);

  const load = useCallback(async () => {
    if (spinningRef.current) return; // don't clobber an in-progress reveal
    const [{ data: pf }, { data: ord }, { count }, { data: flags }] = await Promise.all([
      supabase.from("profiles").select("id,display_name"),
      supabase.from("draft_order").select("manager_ids").eq("id", 1).maybeSingle(),
      supabase.from("picks").select("id", { count: "exact", head: true }),
      supabase.rpc("auto_draft_flags"),
    ]);
    setProfiles(pf || []);
    setPicksMade(count || 0);
    setAutoSet(new Set((flags || []).filter(f => f.auto_draft).map(f => f.manager_id)));
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

  function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function ceremony() {
    if (profiles.length < 1 || spinningRef.current) return;
    const base = profiles.map((p) => ({ id: p.id, name: p.display_name }));
    const n = base.length;
    const STEP = 600; // ms between row reveals
    spinningRef.current = true;
    setSnakeOpen(false);
    setPhase("spinning");
    setOrder(base);        // show the board immediately (rolling)
    setLockedDownTo(n);
    tickRef.current = setInterval(() => setTick((t) => t + 1), 80);

    let final = base;
    for (let round = 1; round <= 3; round++) {
      const isFinal = round === 3;
      setSpinLabel(isFinal ? "FINAL SPIN" : `SPIN ${round} OF 3`);
      final = shuffle(base);
      setOrder(final);
      setLockedDownTo(n);  // scramble back to rolling
      await wait(isFinal ? 1100 : 700);
      for (let k = n - 1; k >= 0; k--) {
        setTimeout(() => setLockedDownTo(k), (n - 1 - k) * STEP + 200);
      }
      await wait((n - 1) * STEP + 200 + (isFinal ? 1200 : 1000));
    }

    clearInterval(tickRef.current);
    setSpinLabel("");
    setPhase("idle");
    setLockedDownTo(0);
    await supabase.from("draft_order").upsert(
      { id: 1, manager_ids: final.map((r) => r.id), created_at: new Date().toISOString() },
      { onConflict: "id" }
    );
    spinningRef.current = false;
    load();
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
                Spin once everyone&apos;s signed up. It spins <b style={{ color: "var(--ink)" }}>three times</b> for
                show — only the third, final spin counts. True random shuffle (crypto RNG), revealed last
                pick → first. The result saves for the whole group.
              </p>
              <p className="note">Managers signed up: <b style={{ color: "var(--ink)" }}>{profiles.length}</b></p>
              <button className="btn" style={{ width: "100%", marginTop: 8 }}
                disabled={profiles.length < 1} onClick={ceremony}>
                🎲 Spin the order — best of 3
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
          {phase === "spinning" && spinLabel && <div className="dl-ceremony">{spinLabel}</div>}
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
                  {locked && autoSet.has(m.id) && <div className="dl-auto">AUTO</div>}
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
              {isAdmin && <DraftControl autoCount={autoSet.size} totalManagers={profiles.length} />}
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
      <div className="note" style={{ marginTop: 4 }}>Snake order. The live clock and picking happen on My Draft.</div>
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

function DraftControl({ autoCount = 0, totalManagers = 0 }) {
  const [st, setStt] = useState(null);
  const [profs, setProfs] = useState([]);
  const [secs, setSecs] = useState(28800);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const [{ data: s }, { data: p }] = await Promise.all([
      supabase.from("draft_state").select("*").eq("id", 1).maybeSingle(),
      supabase.from("profiles").select("id,display_name"),
    ]);
    setStt(s || null); setProfs(p || []);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel("dc-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "draft_state" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const nameById = Object.fromEntries(profs.map(p => [p.id, p.display_name]));
  const order = st?.pick_order || [];
  const cur = st?.current_pick ?? 0;
  const status = st?.status || "setup";

  async function call(fn, args) {
    setBusy(true); setMsg("");
    const { error } = await supabase.rpc(fn, args || {});
    if (error) setMsg("Error: " + error.message);
    await load(); setBusy(false);
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="label lime" style={{ marginTop: 0 }}>DRAFT CONTROL</div>

      {status === "setup" && (
        <>
          <p className="note" style={{ marginTop: 0 }}>
            Starts the clocked snake draft. Each manager picks in turn; when their clock runs out, their
            queue auto-picks and it rolls on. Pick how long each person gets per turn:
          </p>
          <p className="note" style={{ marginTop: 0 }}>
            <b style={{ color: "var(--ink)" }}>{autoCount}</b> of {totalManagers} {autoCount === 1 ? "manager has" : "managers have"} auto-draft on
            {autoCount > 0 ? " — their turns resolve instantly." : "."}
          </p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {[[60, "1m"], [300, "5m"], [1800, "30m"], [3600, "1h"], [28800, "8h"], [86400, "24h"]].map(([v, l]) => (
              <button key={v} className={"btn ghost" + (secs === v ? " on" : "")} style={{ flex: "1 0 60px" }}
                onClick={() => setSecs(v)}>{l}</button>
            ))}
          </div>
          <button className="btn" style={{ width: "100%", marginTop: 10 }} disabled={busy}
            onClick={() => call("start_draft", { p_pick_seconds: secs })}>
            {busy ? "…" : "▶ Start the draft"}
          </button>
        </>
      )}

      {status === "live" && (
        <>
          <p className="note" style={{ marginTop: 0 }}>
            <b className="lime">Live</b> · Pick {cur + 1} of {order.length} · On the clock:{" "}
            <b style={{ color: "var(--ink)" }}>{nameById[order[cur]] || "—"}</b>
          </p>
          <button className="btn ghost" style={{ width: "100%", marginBottom: 8 }} disabled={busy}
            onClick={() => { if (window.confirm(`Autopick ${nameById[order[cur]] || "this manager"}'s top queue pick now and move on? Use this to unstick a no-show.`)) call("skip_current"); }}>
            ⏭ Skip this pick (autopick from their queue)
          </button>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost" style={{ flex: 1 }} disabled={busy}
              onClick={() => { if (window.confirm("Autopick every remaining pick now and finish the draft?")) call("finish_draft"); }}>
              Finish now (autopick rest)
            </button>
            <button className="btn ghost" style={{ flex: 1, borderColor: "var(--coral)", color: "var(--coral)" }} disabled={busy}
              onClick={() => { if (window.confirm("Reset the WHOLE draft? This deletes every pick made.")) call("reset_draft"); }}>
              Reset draft
            </button>
          </div>
        </>
      )}

      {status === "complete" && (
        <>
          <p className="note" style={{ marginTop: 0 }}><b className="lime">Draft complete.</b> Standings are live.</p>
          <button className="btn ghost" style={{ width: "100%", borderColor: "var(--coral)", color: "var(--coral)" }} disabled={busy}
            onClick={() => { if (window.confirm("Reset the WHOLE draft? This deletes every pick made.")) call("reset_draft"); }}>
            Reset draft
          </button>
        </>
      )}

      {msg && <div className="note" style={{ color: "var(--coral)", marginTop: 10 }}>{msg}</div>}
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
.dl-auto{font-family:'Space Mono',monospace; font-size:9px; letter-spacing:1px; color:var(--lime);
  border:1px solid rgba(200,255,77,.45); padding:4px 7px; border-radius:6px; font-weight:700;}
.dl-snake-round{padding:9px 0; border-top:1px solid var(--line);}
.dl-round-lbl{font-family:'Space Mono',monospace; font-size:10px; letter-spacing:1px; color:var(--lime); margin-bottom:7px;}
.dl-chips{display:flex; flex-wrap:wrap; gap:6px;}
.dl-chip{background:var(--panel2); border:1px solid var(--line); border-radius:999px; padding:5px 11px; font-size:12px; font-weight:600;}
.dl-snake-round:first-of-type .dl-chip:first-child{border-color:var(--gold); color:var(--gold);}
.btn.ghost.on{border-color:var(--lime); color:var(--lime);}
.dl-ceremony{font-family:'Anton',sans-serif; font-size:clamp(22px,5vw,34px); letter-spacing:1.5px;
  color:var(--lime); text-transform:uppercase; text-align:center; margin:2px 0 12px;
  animation:dlPulse .8s ease-in-out infinite alternate;}
@keyframes dlPulse{from{opacity:.5;}to{opacity:1;}}
`;
