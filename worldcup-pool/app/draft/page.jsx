"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";

export default function Draft() {
  const { loading, user, profile } = useAuth();
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [picks, setPicks] = useState([]);
  const [pSearch, setPSearch] = useState("");
  const [pSel, setPSel] = useState("");
  const [tSel, setTSel] = useState("");
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);

  const loadData = useCallback(async () => {
    const [{ data: t }, { data: pl }, { data: pk }] = await Promise.all([
      supabase.from("teams").select("id,name").order("name"),
      supabase.from("players").select("id,name,team_id,teams(name)").order("name"),
      supabase.from("picks").select("id,manager_id,pick_type,player_id,team_id"),
    ]);
    setTeams(t || []);
    setPlayers(pl || []);
    setPicks(pk || []);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!user) return;
    loadData();
    // live: refetch whenever anyone's picks change
    const ch = supabase
      .channel("picks-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "picks" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, loadData)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user, loadData]);

  if (loading || !ready) return <div className="wrap muted">Loading…</div>;

  const takenPlayerIds = new Set(picks.filter(p => p.player_id).map(p => p.player_id));
  const takenTeamIds = new Set(picks.filter(p => p.team_id).map(p => p.team_id));
  const mine = picks.filter(p => p.manager_id === user.id);
  const myPlayers = mine.filter(p => p.pick_type === "player");
  const myTeams = mine.filter(p => p.pick_type === "team");

  const teamById = Object.fromEntries(teams.map(t => [t.id, t]));
  const playerById = Object.fromEntries(players.map(p => [p.id, p]));

  const availablePlayers = players
    .filter(p => !takenPlayerIds.has(p.id))
    .filter(p => p.name.toLowerCase().includes(pSearch.toLowerCase()));
  const availableTeams = teams.filter(t => !takenTeamIds.has(t.id));

  async function addPlayer() {
    if (!pSel) return;
    setErr("");
    const { error } = await supabase.from("picks").insert({
      manager_id: user.id, pick_type: "player", player_id: Number(pSel),
    });
    if (error) setErr(friendly(error.message));
    else { setPSel(""); setPSearch(""); loadData(); }
  }
  async function addTeam() {
    if (!tSel) return;
    setErr("");
    const { error } = await supabase.from("picks").insert({
      manager_id: user.id, pick_type: "team", team_id: Number(tSel),
    });
    if (error) setErr(friendly(error.message));
    else { setTSel(""); loadData(); }
  }
  async function remove(id) {
    await supabase.from("picks").delete().eq("id", id);
    loadData();
  }

  return (
    <div className="wrap">
      <Nav profile={profile} />
      <div className="kicker">YOUR ROSTER</div>
      <h1 className="title">MY <span className="accent">DRAFT</span></h1>

      {/* PLAYERS */}
      <label className="label lime">PLAYERS — {myPlayers.length}/4</label>
      {myPlayers.map(p => {
        const pl = playerById[p.player_id];
        return (
          <div className="slot" key={p.id}>
            <span>{pl?.name} <span className="muted">· {pl?.teams?.name}</span></span>
            <button className="x" onClick={() => remove(p.id)}>remove ✕</button>
          </div>
        );
      })}
      {myPlayers.length < 4 && (
        <div className="card" style={{ marginTop: 4 }}>
          <input className="input" placeholder="Search players…" value={pSearch}
            onChange={(e) => { setPSearch(e.target.value); setPSel(""); }} />
          <select className="input" style={{ marginTop: 8 }} value={pSel}
            onChange={(e) => setPSel(e.target.value)}>
            <option value="">Select a player…</option>
            {availablePlayers.slice(0, 100).map(p => (
              <option key={p.id} value={p.id}>{p.name} — {p.teams?.name}</option>
            ))}
          </select>
          <button className="btn" style={{ marginTop: 10 }} disabled={!pSel} onClick={addPlayer}>
            Add player
          </button>
        </div>
      )}

      {/* TEAMS */}
      <label className="label coral" style={{ marginTop: 22 }}>TEAMS — {myTeams.length}/3</label>
      {myTeams.map(p => (
        <div className="slot" key={p.id}>
          <span>{teamById[p.team_id]?.name}</span>
          <button className="x" onClick={() => remove(p.id)}>remove ✕</button>
        </div>
      ))}
      {myTeams.length < 3 && (
        <div className="card" style={{ marginTop: 4 }}>
          <select className="input" value={tSel} onChange={(e) => setTSel(e.target.value)}>
            <option value="">Select a team…</option>
            {availableTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className="btn coral" style={{ marginTop: 10 }} disabled={!tSel} onClick={addTeam}>
            Add team
          </button>
        </div>
      )}

      <div className="err">{err}</div>
      <p className="note" style={{ marginTop: 18 }}>
        Draft players and teams in any order you like — up to 4 players and 3 teams. Greyed-out /
        missing names are already drafted by someone else; each player and team can only be on one
        roster. Picks lock in as soon as you add them.
      </p>
    </div>
  );
}

function friendly(m) {
  if (/duplicate key|one_owner/.test(m)) return "Just taken by someone else — pick another.";
  if (/4 players|3 teams/.test(m)) return m;
  return m;
}
