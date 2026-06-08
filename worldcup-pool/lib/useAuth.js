"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./supabase";

// Returns { loading, user, profile }. Redirects to /login if not signed in.
export function useAuth(requireLogin = true) {
  const router = useRouter();
  const [state, setState] = useState({ loading: true, user: null, profile: null });

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (requireLogin) router.replace("/login");
        if (active) setState({ loading: false, user: null, profile: null });
        return;
      }
      const { data: profile } = await supabase
        .from("profiles").select("*").eq("id", user.id).single();
      if (active) setState({ loading: false, user, profile });
    }
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session && requireLogin) router.replace("/login");
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [router, requireLogin]);

  return state;
}
