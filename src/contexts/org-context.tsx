"use client";

import React, { createContext, useContext, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Org } from "@/lib/types/database";

type OrgContextValue = {
  org: Org | null;
  orgId: string | null;
  setOrgId: (id: string | null) => void;
  refetch: () => Promise<void>;
};

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({
  children,
  initialOrg,
  initialOrgId,
}: {
  children: React.ReactNode;
  initialOrg: Org | null;
  initialOrgId: string | null;
}) {
  const [org, setOrg] = React.useState<Org | null>(initialOrg);
  const [orgId, setOrgIdState] = React.useState<string | null>(initialOrgId);
  const supabase = createClient();

  const refetch = useCallback(async () => {
    if (!orgId) {
      setOrg(null);
      return;
    }
    const { data } = await supabase
      .from("orgs")
      .select("*")
      .eq("id", orgId)
      .single();
    setOrg(data as Org | null);
  }, [orgId, supabase]);

  const setOrgId = useCallback(
    (id: string | null) => {
      setOrgIdState(id);
      if (!id) {
        setOrg(null);
        return;
      }
      supabase
        .from("orgs")
        .select("*")
        .eq("id", id)
        .single()
        .then(({ data }) => setOrg(data as Org | null));
    },
    [supabase]
  );

  const value = useMemo(
    () => ({ org, orgId, setOrgId, refetch }),
    [org, orgId, setOrgId, refetch]
  );

  return (
    <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used within OrgProvider");
  return ctx;
}
