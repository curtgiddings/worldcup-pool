"use client";
import Link from "next/link";
import { useAuth } from "../lib/useAuth";

export default function Home() {
  const { loading, user } = useAuth(false); // don't force login on the landing

  if (loading) return <div className="wrap muted">Loading…</div>;

  const enterHref = user ? "/draft" : "/login";
  const ctaLabel = user ? "GO TO MY DRAFT →" : "ENTER POOL →";

  return (
    <div className="lp">
      <style>{LP_CSS}</style>

      <nav className="lp-nav">
        <span className="lp-brand">THE <span>GAFFERS</span></span>
        <Link href={enterHref} className="lp-enter">{user ? "MY DRAFT" : "ENTER POOL"}</Link>
      </nav>

      <main className="lp-hero">
        {/* faint tactical pitch */}
        <svg className="lp-pitch" viewBox="0 0 1200 750" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2">
            <rect x="40" y="40" width="1120" height="670" />
            <line x1="600" y1="40" x2="600" y2="710" />
            <circle cx="600" cy="375" r="95" />
            <rect x="40" y="215" width="150" height="320" />
            <rect x="40" y="295" width="60" height="160" />
            <rect x="1010" y="215" width="150" height="320" />
            <rect x="1100" y="295" width="60" height="160" />
          </g>
          <g fill="rgba(255,255,255,0.06)">
            <circle cx="600" cy="375" r="5" />
            <circle cx="150" cy="375" r="5" />
            <circle cx="1050" cy="375" r="5" />
          </g>
        </svg>

        <div className="lp-content">
          <div className="lp-kicker">WORLD CUP 2026 · CAN · MEX · USA</div>
          <h1 className="lp-title">THE GAFFERS</h1>
          <p className="lp-tag">
            Draft <b>4 players</b> + <b>3 teams</b>. Goals, assists, and how far your teams go
            all bank points. Last gaffer standing wins.
          </p>
          <Link href={enterHref} className="lp-cta">{ctaLabel}</Link>
        </div>
      </main>

      <section className="rules" id="how-it-works">
        <div className="rules-inner">
          <div className="rules-left">
            <div className="lp-kicker">HOW IT WORKS</div>
            <h2 className="rules-h">PICK YOUR SQUAD.<br />OUTSCORE THE GROUP.</h2>
            <p className="rules-p">
              Draft <b>4 players</b> and <b>3 teams</b> before the tournament kicks off — every
              pick is exclusive, so once a name&apos;s gone, it&apos;s gone. One roster, no trades, no waiver wire.
            </p>
           <p className="rules-p">
              Draft <b>4 players</b> and <b>3 teams</b> before the tournament kicks off — every
              pick is exclusive, so once a name&apos;s gone, it&apos;s gone. Draft in any order;
              whether you prioritise players or teams is entirely up to you.
            </p>
            <p className="rules-p">
              Players bank <b>3 points a goal</b> and <b>1 an assist</b>. Teams earn
              <b> 3 for winning their group</b>, <b>2 for reaching the knockouts</b>,
              <b> 2 for every elimination round they win</b>, and <b>1 more for lifting the trophy</b>.
              Highest total when the final whistle blows in New Jersey on <b>July 19</b> is the
              gaffer of the tournament.
            </p>
            <Link href={enterHref} className="lp-cta" style={{ marginTop: 8 }}>{ctaLabel}</Link>
          </div>

          <div className="rules-stats">
            <Stat label="your squad" sub="players + teams" value="4 + 3" />
            <Stat label="player points" sub="per goal · assist" value="3 · 1" />
            <Stat label="teams in play" sub="across 12 groups" value="48" />
            <Stat label="kicks off" sub="final Jul 19" value="JUN 11" lime />
          </div>
        </div>
      </section>

      <footer className="lp-foot">thegaffers.com · {new Date().getFullYear()}</footer>
    </div>
  );
}

function Stat({ label, sub, value, lime }) {
  return (
    <div className="stat">
      <div className="stat-l">{label}<small>{sub}</small></div>
      <div className={"stat-v" + (lime ? " lime" : "")}>{value}</div>
    </div>
  );
}

const LP_CSS = `
.lp{min-height:100vh; display:flex; flex-direction:column;}
.lp-nav{display:flex; align-items:center; justify-content:space-between;
  padding:20px 28px; position:relative; z-index:2;}
.lp-brand{font-family:'Anton',sans-serif; font-size:22px; letter-spacing:.5px; text-transform:uppercase;}
.lp-brand span{color:var(--lime);}
.lp-enter{font-family:'Archivo',sans-serif; font-weight:800; font-size:13px; letter-spacing:.5px;
  border:1.5px solid var(--lime); color:var(--lime); padding:10px 20px; border-radius:999px;
  text-transform:uppercase; transition:.15s;}
.lp-enter:hover{background:var(--lime); color:#0a0a0a;}

.lp-hero{flex:1; position:relative; display:flex; flex-direction:column; justify-content:flex-end;
  padding:40px 28px 32px; overflow:hidden; min-height:calc(100vh - 76px);}
.lp-pitch{position:absolute; inset:0; width:100%; height:100%; z-index:0;}
.lp-content{position:relative; z-index:1; max-width:900px;}
.lp-kicker{font-family:'Space Mono',monospace; font-size:12px; letter-spacing:3px;
  color:var(--muted); margin-bottom:14px;}
.lp-title{font-family:'Anton',sans-serif; font-weight:400; text-transform:uppercase;
  color:var(--lime); line-height:.86; margin:0; font-size:clamp(64px,17vw,200px);}
.lp-tag{font-size:clamp(15px,2.2vw,20px); color:#d6d6d2; max-width:560px;
  line-height:1.5; margin:22px 0 26px;}
.lp-tag b{color:var(--ink);}
.lp-cta{display:inline-block; font-family:'Archivo',sans-serif; font-weight:800;
  font-size:16px; letter-spacing:.5px; text-transform:uppercase; background:var(--lime);
  color:#0a0a0a; padding:15px 30px; border-radius:999px; transition:.15s;}
.lp-cta:hover{transform:translateY(-1px); box-shadow:0 8px 30px rgba(200,255,77,.25);}
.lp-foot{font-family:'Space Mono',monospace; font-size:11px; letter-spacing:1px;
  color:#5e5e5a; padding:28px; text-align:right; border-top:1px solid var(--line);}

.rules{border-top:1px solid var(--line); padding:84px 28px;}
.rules-inner{max-width:1080px; margin:0 auto; display:grid;
  grid-template-columns:1.15fr 1fr; gap:64px; align-items:start;}
.rules-left .lp-kicker{margin-bottom:16px;}
.rules-h{font-family:'Anton',sans-serif; font-weight:400; text-transform:uppercase;
  font-size:clamp(34px,4.6vw,60px); line-height:.94; margin:0 0 24px;}
.rules-p{font-size:16px; line-height:1.65; color:#cfcfca; max-width:520px; margin:0 0 18px;}
.rules-p b{color:var(--ink); font-weight:600;}
.rules-stats{display:flex; flex-direction:column;}
.stat{display:flex; align-items:flex-end; justify-content:space-between; gap:18px;
  padding:22px 0; border-top:1px solid var(--line);}
.stat:last-child{border-bottom:1px solid var(--line);}
.stat-l{font-family:'Space Mono',monospace; font-size:13px; color:#cfcfca;}
.stat-l small{display:block; font-size:11px; color:#6d6d68; margin-top:5px; letter-spacing:.5px;}
.stat-v{font-family:'Anton',sans-serif; font-size:clamp(36px,4vw,52px); line-height:1; white-space:nowrap;}
.stat-v.lime{color:var(--lime);}
@media (max-width:760px){
  .rules{padding:56px 22px;}
  .rules-inner{grid-template-columns:1fr; gap:36px;}
}
`;
