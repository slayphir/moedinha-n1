"use client";

import { createClient } from "@/lib/supabase/client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export function SupabaseListener() {
  const router = useRouter();
  const pathname = usePathname();
  const previousUserId = useRef<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      previousUserId.current = data.session?.user?.id ?? null;
      initialized.current = true;
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const currentUserId = session?.user?.id ?? null;

      // Avoid loops if auth events fire before initial session is stable.
      if (!initialized.current) {
        previousUserId.current = currentUserId;
        return;
      }

      // Skip initial session detection - it fires on every page load.
      if (event === "INITIAL_SESSION") {
        previousUserId.current = currentUserId;
        return;
      }

      // Skip token refresh - it doesn't change auth state.
      if (event === "TOKEN_REFRESHED") return;

      // Only refresh if the user actually changed (sign-in or sign-out).
      if (currentUserId !== previousUserId.current) {
        previousUserId.current = currentUserId;
        if (pathname.startsWith("/dashboard")) {
          router.refresh();
        }
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  return null;
}
