"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateOrganization(orgId: string, name: string) {
    const supabase = await createClient();

    // Check permissions (assuming any member can edit for now, or just admin)
    // For simplicity in this MVP, we allow any member of the org to update it.

    const { error } = await supabase
        .from("orgs")
        .update({ name, updated_at: new Date().toISOString() })
        .eq("id", orgId);

    if (error) return { error: error.message };

    revalidatePath("/dashboard");
    return {};
}

export async function updateUserProfile(name: string) {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return { error: "User not found" };

    // Update Supabase Auth Metadata (easiest way for display name if no profiles table)
    const { error } = await supabase.auth.updateUser({
        data: { full_name: name }
    });

    if (error) return { error: error.message };

    revalidatePath("/dashboard");
    return {};
}
