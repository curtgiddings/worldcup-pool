"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      router.replace(user ? "/draft" : "/login");
    });
  }, [router]);
  return <div className="wrap muted">Loading…</div>;
}
