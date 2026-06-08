"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import GafferMark from "./GafferMark";

export default function Nav({ profile }) {
  const path = usePathname();
  const router = useRouter();
  const links = [
    ["/draft", "My Draft"],
    ["/draft-order", "Order"],
    ["/standings", "Standings"],
  ];
  if (profile?.is_admin) links.push(["/admin", "Score Entry"]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <>
      <style>{`
        .nav .brand{display:inline-flex; align-items:center;}
        .nav .brand-mark{height:1.05em; width:auto; color:var(--lime); margin-right:.42em;}
        @media (max-width:480px){ .nav .brand-mark{display:none;} }
      `}</style>
      <nav className="nav">
        <Link href="/" className="brand"><GafferMark className="brand-mark" />THE <span>GAFFERS</span></Link>
        {links.map(([href, label]) => (
          <Link key={href} href={href} className={path === href ? "active" : ""}>
            {label}
          </Link>
        ))}
        <span className="spacer" />
        <span className="who">{profile?.display_name}</span>
        <button className="btn ghost" style={{ padding: "6px 12px", fontSize: 13 }} onClick={logout}>
          Log out
        </button>
      </nav>
    </>
  );
}
