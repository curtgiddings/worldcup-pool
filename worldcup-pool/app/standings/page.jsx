"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";

export default function Standings() {
  const { loading, profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("manager_scores").select("*");
    const sorted = (data || []).sort((a, b) => b.total - a.total);
    setRows(sorted);
    setReady(true);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("scores-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "player_stats" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_progress" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "picks" }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [load]);

  if (loading || !ready) return <div className="wrap muted">Loading…</div>;
  const leader = rows[0]?.total || 0;

  return (
    <div className="wrap">
      <Nav profile={profile} />
      <div className="kicker">LIVE TABLE</div>
      <h1 className="title">STAND<span className="accent">INGS</span></h1>

      {rows.length === 0 && <p className="note">No managers yet.</p>}
      {rows.map((r, i) => (
        <div className={"board-row " + (i === 0 && leader > 0 ? "gold" : "")} key={r.manager_id}>
          <div className="rank">{i + 1}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{r.display_name}</div>
            <div style={{ marginTop: 4 }}>
              <span className="chip l">{r.player_pts} players</span>
              <span className="chip c">{r.team_pts} teams</span>
            </div>
          </div>
          <div className="total">{r.total}</div>
        </div>
      ))}
    </div>
  );
}
