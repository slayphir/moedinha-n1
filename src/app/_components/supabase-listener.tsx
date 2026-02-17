"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export function SupabaseListener() {
  const router = useRouter();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Skip initial session detection — it fires on every page load
      if (event === "INITIAL_SESSION") {
        previousUserId.current = session?.user?.id ?? null;
        return;
      }

      // Skip token refresh — it doesn't change auth state
      if (event === "TOKEN_REFRESHED") return;

      const currentUserId = session?.user?.id ?? null;

      // Only refresh if the user actually changed (sign-in or sign-out)
      if (currentUserId !== previousUserId.current) {
        previousUserId.current = currentUserId;
        router.refresh();
      }
    });
    return () => subscription.unsubscribe();
  }, [router]);
  return null;
}
