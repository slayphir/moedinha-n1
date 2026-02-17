import { createClient } from "@/lib/supabase/server";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export async function getActiveOrgIdForUser(
  supabase: ServerSupabase,
  userId: string
): Promise<string | null> {
  const { data: member, error } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error resolving active organization:", error);
    return null;
  }

  return member?.org_id ?? null;
}

export async function getAuthenticatedOrgContext(supabase: ServerSupabase): Promise<{
  userId: string;
  orgId: string;
} | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const orgId = await getActiveOrgIdForUser(supabase, user.id);
  if (!orgId) return null;

  return { userId: user.id, orgId };
}
