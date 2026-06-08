"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";

export default function Admin() {
  const { loading, profile } = useAuth();
  const [players, setPlayers] = useState([]); // drafted players w/ stats
  const [teams, setTeams] = useState([]);     // drafted teams w/ progress
  const [allTeams, setAllTeams] = useState([]); // every team, for the add-player form
  const [nf, setNf] = useState({ name: "", team_id: "", position: "FW" });
  const [addMsg, setAddMsg] = useState("");
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const [{ data: picks }, { data: at }] = await Promise.all([
      supabase.from("picks").select("pick_type,player_id,team_id"),
      supabase.from("teams").select("id,name").order("name"),
    ]);
    setAllTeams(at || []);
    const playerIds = [...new Set((picks || []).filter(p => p.player_id).map(p => p.player_id))];
    const teamIds = [...new Set((picks || []).filter(p => p.team_id).map(p => p.team_id))];

    let pl = [], tm = [];
    if (playerIds.length) {
      const [{ data: pd }, { data: ps }] = await Promise.all([
        supabase.from("players").select("id,name,teams(name)").in("id", playerIds),
        supabase.from("player_stats").select("*").in("player_id", playerIds),
      ]);
      const statMap = Object.fromEntries((ps || []).map(s => [s.player_id, s]));
      pl = (pd || []).map(p => ({
        ...p,
        goals: statMap[p.id]?.goals || 0,
        assists: statMap[p.id]?.assists || 0,
      })).sort((a, b) => a.name.localeCompare(b.name));
    }
    if (teamIds.length) {
      const [{ data: td }, { data: tp }] = await Promise.all([
        supabase.from("teams").select("id,name").in("id", teamIds),
        supabase.from("team_progress").select("*").in("team_id", teamIds),
      ]);
      const progMap = Object.fromEntries((tp || []).map(p => [p.team_id, p]));
      tm = (td || []).map(t => ({
        ...t,
        won_group: progMap[t.id]?.won_group || false,
        reached_knockout: progMap[t.id]?.reached_knockout || false,
        elim_wins: progMap[t.id]?.elim_wins || 0,
        champion: progMap[t.id]?.champion || false,
      })).sort((a, b) => a.name.localeCompare(b.name));
    }
    setPlayers(pl); setTeams(tm); setReady(true);
  }, []);

  useEffect(() => { if (profile?.is_admin) load(); }, [profile, load]);

  if (loading) return <div className="wrap muted">Loading…</div>;
  if (!profile?.is_admin)
    return (
      <div className="wrap">
        <Nav profile={profile} />
        <p className="note">Only the commissioner can enter scores.</p>
      </div>
    );
  if (!ready) return <div className="wrap muted">Loading…</div>;

  async function savePlayer(p, patch) {
    const next = { player_id: p.id, goals: p.goals, assists: p.assists, ...patch };
    setPlayers(ps => ps.map(x => x.id === p.id ? { ...x, ...patch } : x));
    await supabase.from("player_stats").upsert(next, { onConflict: "player_id" });
  }
  async function saveTeam(t, patch) {
    const next = {
      team_id: t.id, won_group: t.won_group, reached_knockout: t.reached_knockout,
      elim_wins: t.elim_wins, champion: t.champion, ...patch,
    };
    setTeams(ts => ts.map(x => x.id === t.id ? { ...x, ...patch } : x));
    await supabase.from("team_progress").upsert(next, { onConflict: "team_id" });
  }

  async function addNewPlayer() {
    setAddMsg("");
    const name = nf.name.trim();
    if (name.length < 2 || !nf.team_id) { setAddMsg("Enter a name and pick a team."); return; }
    const { error } = await supabase.from("players").insert({
      name, team_id: Number(nf.team_id), position: nf.position,
    });
    if (error) {
      setAddMsg(/duplicate|unique/.test(error.message) ? "That player is already in the list." : error.message);
    } else {
      const teamName = allTeams.find(t => t.id === Number(nf.team_id))?.name || "";
      setAddMsg(`Added ${name} (${teamName}) — now draftable for everyone.`);
      setNf({ name: "", team_id: "", position: "FW" });
    }
  }

  return (
    <div className="wrap">
      <Nav profile={profile} />
      <div className="kicker">COMMISSIONER</div>
      <h1 className="title">SCORE <span className="accent">ENTRY</span></h1>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Add a missing player</div>
        <p className="note" style={{ marginBottom: 10 }}>
          Only you can do this — keeps spelling clean. Once added, it appears in everyone's draft list.
        </p>
        <input className="input" placeholder="Player name (spell it carefully)"
          value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} />
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <select className="input" value={nf.team_id} onChange={(e) => setNf({ ...nf, team_id: e.target.value })}>
            <option value="">Team…</option>
            {allTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className="input" style={{ maxWidth: 110 }} value={nf.position}
            onChange={(e) => setNf({ ...nf, position: e.target.value })}>
            <option value="FW">FW</option><option value="MF">MF</option>
            <option value="DF">DF</option><option value="GK">GK</option>
          </select>
        </div>
        <button className="btn" style={{ marginTop: 10 }} onClick={addNewPlayer}>Add player</button>
        {addMsg && <div className="note" style={{ marginTop: 10, color: "var(--lime)" }}>{addMsg}</div>}
      </div>

      <label className="label lime">PLAYERS · 3 / goal · 1 / assist</label>
      {players.length === 0 && <p className="note">No players drafted yet.</p>}
      {players.map(p => (
        <div className="stat-row" key={p.id}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
            <div className="muted" style={{ fontSize: 11 }}>{p.teams?.name}</div>
          </div>
          <Stepper label="G" value={p.goals}
            onMinus={() => savePlayer(p, { goals: Math.max(0, p.goals - 1) })}
            onPlus={() => savePlayer(p, { goals: p.goals + 1 })} />
          <Stepper label="A" value={p.assists}
            onMinus={() => savePlayer(p, { assists: Math.max(0, p.assists - 1) })}
            onPlus={() => savePlayer(p, { assists: p.assists + 1 })} />
        </div>
      ))}

      <label className="label coral" style={{ marginTop: 22 }}>TEAMS</label>
      {teams.length === 0 && <p className="note">No teams drafted yet.</p>}
      {teams.map(t => (
        <div className="card" style={{ marginBottom: 9, padding: 14 }} key={t.id}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>{t.name}</div>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            <Toggle on={t.won_group} onClick={() => saveTeam(t, { won_group: !t.won_group })}>Won group +3</Toggle>
            <Toggle on={t.reached_knockout} onClick={() => saveTeam(t, { reached_knockout: !t.reached_knockout })}>Reached R32 +2</Toggle>
            <Toggle on={t.champion} onClick={() => saveTeam(t, { champion: !t.champion })}>Champion +1</Toggle>
            <div className="toggle" style={{ gap: 10 }}>
              <span>Elim wins +2</span>
              <Stepper value={t.elim_wins}
                onMinus={() => saveTeam(t, { elim_wins: Math.max(0, t.elim_wins - 1) })}
                onPlus={() => saveTeam(t, { elim_wins: Math.min(5, t.elim_wins + 1) })} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Stepper({ label, value, onMinus, onPlus }) {
  return (
    <div className="stepper">
      {label && <span className="muted mono" style={{ fontSize: 10, width: 12 }}>{label}</span>}
      <button onClick={onMinus}>−</button>
      <span className="v">{value}</span>
      <button onClick={onPlus}>+</button>
    </div>
  );
}
function Toggle({ on, onClick, children }) {
  return (
    <button className={"toggle " + (on ? "on" : "")} onClick={onClick}>
      <span className="dot" />{children}
    </button>
  );
}
