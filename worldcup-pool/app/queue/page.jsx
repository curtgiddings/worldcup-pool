"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function QueueRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/draft"); }, [router]);
  return <div className="wrap muted">Redirecting to My Draft…</div>;
}
