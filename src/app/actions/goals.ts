"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/active-org";
import { revalidatePath } from "next/cache";

export type GoalType = "savings" | "emergency_fund" | "debt" | "reduction" | "purchase" | "piggy_bank";
export type GoalStatus = "active" | "completed" | "paused" | "cancelled";
export type FundingStrategy = "bucket_fraction" | "month_leftover" | "fixed_amount" | "manual";

export type Goal = {
    id: string;
    org_id: string;
    name: string;
    type: GoalType;
    target_amount: number | null;
    target_date: string | null;
    current_amount: number;
    reduction_category_id: string | null;
    reduction_target_pct: number | null;
    baseline_amount: number | null;
    strategy: FundingStrategy;
    linked_bucket_id: string | null;
    status: GoalStatus;
    created_at: string;
};

export type CreateGoalInput = {
    name: string;
    type: GoalType;
    target_amount?: number;
    target_date?: string;
    current_amount?: number;
    reduction_category_id?: string;
    reduction_target_pct?: number;
    baseline_amount?: number;
    strategy?: FundingStrategy;
    linked_bucket_id?: string;
};

export type UpdateGoalInput = Partial<CreateGoalInput> & {
    id: string;
    status?: GoalStatus;
};

export async function getGoals() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const orgId = await getActiveOrgIdForUser(supabase, user.id);
    if (!orgId) return [];

    const { data, error } = await supabase
        .from("goals")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error fetching goals:", error);
        return [];
    }

    const rows = (data ?? []) as Goal[];

    // Keep only one emergency fund goal in the UI as a safety guard against legacy duplicates.
    let emergencyIncluded = false;
    const normalized = rows.filter((goal) => {
        if (goal.type !== "emergency_fund") return true;
        if (emergencyIncluded) return false;
        emergencyIncluded = true;
        return true;
    });

    return normalized;
}

export async function createGoal(input: CreateGoalInput) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    if (input.type === "emergency_fund") {
        return { error: "Emergency fund goal is managed in the Reserve tab." };
    }

    const orgId = await getActiveOrgIdForUser(supabase, user.id);
    if (!orgId) return { error: "Organization not found" };

    const { data, error } = await supabase
        .from("goals")
        .insert([{ ...input, org_id: orgId }])
        .select()
        .single();

    if (error) {
        console.error("Error creating goal:", error);
        if (error.code === "42501") {
            return { error: "You do not have permission to create goals in this organization." };
        }
        return { error: "Failed to create goal" };
    }

    revalidatePath("/dashboard/metas");
    return { data };
}

export async function updateGoal(input: UpdateGoalInput) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    const orgId = await getActiveOrgIdForUser(supabase, user.id);
    if (!orgId) return { error: "Organization not found" };

    const { id, ...updates } = input;

    const { data, error } = await supabase
        .from("goals")
        .update(updates)
        .eq("id", id)
        .eq("org_id", orgId)
        .select("id")
        .maybeSingle();

    if (error) {
        console.error("Error updating goal:", error);
        if (error.code === "42501") {
            return { error: "You do not have permission to edit this goal." };
        }
        return { error: "Failed to update goal" };
    }

    if (!data) {
        return { error: "Goal not found in current organization." };
    }

    revalidatePath("/dashboard/metas");
    return { success: true };
}

export async function deleteGoal(id: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    const orgId = await getActiveOrgIdForUser(supabase, user.id);
    if (!orgId) return { error: "Organization not found" };

    const { data, error } = await supabase
        .from("goals")
        .delete()
        .eq("id", id)
        .eq("org_id", orgId)
        .select("id")
        .maybeSingle();

    if (error) {
        console.error("Error deleting goal:", error);
        if (error.code === "42501") {
            return { error: "You do not have permission to delete this goal." };
        }
        return { error: "Failed to delete goal" };
    }

    if (!data) {
        return { error: "Goal not found in current organization." };
    }

    revalidatePath("/dashboard/metas");
    return { success: true };
}
