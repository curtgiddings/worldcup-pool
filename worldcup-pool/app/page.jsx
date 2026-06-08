"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/useAuth";

export default function Home() {
  const router = useRouter();
  const { loading, user } = useAuth(false); // don't force login on the landing

  useEffect(() => {
    if (!loading && user) router.replace("/draft"); // signed-in → straight to the pool
  }, [loading, user, router]);

  if (loading || user) return <div className="wrap muted">Loading…</div>;

  return (
    <div className="lp">
      <style>{LP_CSS}</style>

      <nav className="lp-nav">
        <span className="lp-brand">THE <span>GAFFERS</span></span>
        <Link href="/login" className="lp-enter">ENTER POOL</Link>
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
          <Link href="/login" className="lp-cta">ENTER POOL →</Link>
        </div>

        <div className="lp-foot">thegaffers.com · {new Date().getFullYear()}</div>
      </main>
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
  padding:40px 28px 32px; overflow:hidden;}
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
.lp-foot{position:relative; z-index:1; font-family:'Space Mono',monospace; font-size:11px;
  letter-spacing:1px; color:#5e5e5a; margin-top:30px; text-align:right;}
`;
