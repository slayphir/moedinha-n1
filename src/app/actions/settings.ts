"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateOrganization(orgId: string, name: string, balanceStartDate?: string | null) {
    const supabase = await createClient();

    const payload: {
        name: string;
        updated_at: string;
        balance_start_date?: string | null;
    } = {
        name,
        updated_at: new Date().toISOString(),
    };

    if (balanceStartDate !== undefined) {
        payload.balance_start_date = balanceStartDate;
    }

    const { error } = await supabase
        .from("orgs")
        .update(payload)
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
