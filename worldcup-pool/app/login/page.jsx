"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState("signup"); // 'signup' | 'login'
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(""); setMsg(""); setBusy(true);
    try {
      if (mode === "signup") {
        if (name.trim().length < 2) throw new Error("Enter your name.");
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: pw,
          options: { data: { display_name: name.trim() } },
        });
        if (error) throw error;
        if (data.session) router.replace("/draft");
        else setMsg("Account created. Check your email to confirm, then log in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(), password: pw,
        });
        if (error) throw error;
        router.replace("/draft");
      }
    } catch (e) {
      setErr(e.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <style>{`
        .login-page{min-height:100vh; display:flex; flex-direction:column;
          align-items:center; justify-content:center; padding:32px 16px;}
        .login-inner{width:100%; max-width:380px;}
        .login-lockup{text-align:center; margin-bottom:22px;}
        .login-lockup .title{font-size:clamp(44px,10vw,60px); line-height:.9; margin:8px 0 0;}
        .login-card{padding:20px;}
        .login-card .label:first-of-type{margin-top:4px;}
      `}</style>
      <div className="login-inner">
        <div className="login-lockup">
          <div className="kicker">WORLD CUP 2026 · CAN · MEX · USA</div>
          <h1 className="title">THE <span className="lime">GAFFERS</span></h1>
          <p className="note" style={{ marginTop: 10 }}>
            Draft 4 players + 3 teams. Goals, assists, and how far your teams go all bank points.
          </p>
        </div>

        <div className="card login-card">
        <div className="row" style={{ marginBottom: 16, gap: 6 }}>
          <button
            className={"btn " + (mode === "signup" ? "" : "ghost")}
            style={{ flex: 1 }}
            onClick={() => setMode("signup")}
          >
            Sign up
          </button>
          <button
            className={"btn " + (mode === "login" ? "" : "ghost")}
            style={{ flex: 1 }}
            onClick={() => setMode("login")}
          >
            Log in
          </button>
        </div>

        {mode === "signup" && (
          <>
            <label className="label">DISPLAY NAME</label>
            <input className="input" value={name} placeholder="e.g. Curt"
              onChange={(e) => setName(e.target.value)} />
          </>
        )}
        <label className="label">EMAIL</label>
        <input className="input" type="email" value={email} placeholder="you@email.com"
          onChange={(e) => setEmail(e.target.value)} />
        <label className="label">PASSWORD</label>
        <input className="input" type="password" value={pw} placeholder="••••••••"
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()} />

        <button className="btn" style={{ width: "100%", marginTop: 18 }} disabled={busy} onClick={submit}>
          {busy ? "…" : mode === "signup" ? "Create account" : "Log in"}
        </button>

        <div className="err">{err}</div>
        {msg && <div className="note" style={{ color: "var(--lime)" }}>{msg}</div>}
      </div>
      </div>
    </div>
  );
}
