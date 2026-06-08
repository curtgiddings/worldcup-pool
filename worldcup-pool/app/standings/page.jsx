"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";

export default function Standings() {
  const { loading, user, profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("manager_scores").select("*");
    setRows((data || []).sort((a, b) => b.total - a.total));
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

  return (
    <div className="wrap">
      <style>{TABLE_CSS}</style>
      <Nav profile={profile} />
      <div className="t-kicker">CURRENT STANDINGS</div>
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
            return (
              <div key={r.manager_id}
                className={"tbl-row" + (leader ? " leader" : "") + (mine && !leader ? " mine" : "")}>
                <div className="c-rank">{i + 1}</div>
                <div className="c-name">
                  {r.display_name}{mine && <span className="you"> · you</span>}
                </div>
                <div className="c-num">{r.player_pts}</div>
                <div className="c-num">{r.team_pts}</div>
                <div className="c-pts">{r.total}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const TABLE_CSS = `
.t-kicker{font-family:'Space Mono',monospace; font-size:12px; letter-spacing:3px; color:var(--muted); margin-bottom:6px;}
.tbl{width:100%;}
.tbl-head, .tbl-row{display:grid; grid-template-columns:46px 1fr 92px 92px 96px; align-items:center;}
.tbl-head{padding:0 16px 12px; border-bottom:1px solid var(--line);}
.tbl-head > div{font-family:'Space Mono',monospace; font-size:11px; letter-spacing:1.5px; color:var(--muted);}
.tbl-row{padding:18px 16px; border-bottom:1px solid var(--line); position:relative;}
.c-rank{font-family:'Space Mono',monospace; color:var(--muted); font-size:15px;}
.c-name{font-family:'Anton',sans-serif; font-size:22px; letter-spacing:.5px; text-transform:uppercase;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
.c-num{text-align:right; font-family:'Space Mono',monospace; color:var(--muted); font-size:15px;}
.c-pts{text-align:right; font-family:'Anton',sans-serif; font-size:27px;}
.tbl-row.leader{background:linear-gradient(90deg, rgba(200,255,77,.10), transparent 72%);}
.tbl-row.leader .c-rank, .tbl-row.leader .c-name{color:var(--lime);}
.tbl-row.leader::before{content:''; position:absolute; left:0; top:8px; bottom:8px; width:4px; background:var(--lime);}
.tbl-row.mine::before{content:''; position:absolute; left:0; top:8px; bottom:8px; width:4px; background:var(--coral);}
.you{font-family:'Space Mono',monospace; font-size:11px; color:var(--coral); letter-spacing:1px;}
@media (max-width:560px){
  .tbl-head, .tbl-row{grid-template-columns:34px 1fr 72px;}
  .c-num{display:none;}
  .c-name{font-size:18px;}
  .c-pts{font-size:23px;}
}
`;
