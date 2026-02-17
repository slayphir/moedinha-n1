"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/active-org";
import { revalidatePath } from "next/cache";

type ReserveAccount = {
    id: string;
    name: string;
    type: string;
    initial_balance: number | string | null;
    liquidity_type?: string | null;
};

type EmergencyGoalRow = {
    id: string;
    org_id: string;
    name: string;
    target_amount: number | string | null;
    current_amount: number | string | null;
    strategy: string | null;
    updated_at?: string | null;
    created_at?: string | null;
};

const DEFAULT_EMERGENCY_GOAL_NAME = "Reserva de Emergencia";

export type ReserveMetrics = {
    totalAccumulated: number;
    targetAmount: number;
    progressPercentage: number;
    monthsCovered: number;
    liquidityBreakdown: Record<string, number>;
    accounts: ReserveAccount[];
    goalId?: string;
};

function emptyMetrics(): ReserveMetrics {
    return {
        totalAccumulated: 0,
        targetAmount: 0,
        progressPercentage: 0,
        monthsCovered: 0,
        liquidityBreakdown: {},
        accounts: [],
    };
}

export async function getEmergencyMetrics(): Promise<ReserveMetrics> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        throw new Error("Unauthorized");
    }

    const orgId = await getActiveOrgIdForUser(supabase, user.id);
    if (!orgId) return emptyMetrics();

    const { data: existingGoals, error: existingGoalError } = await supabase
        .from("goals")
        .select("id, org_id, name, target_amount, current_amount, strategy, updated_at, created_at")
        .eq("org_id", orgId)
        .eq("type", "emergency_fund")
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false });

    if (existingGoalError) {
        console.error("Error fetching emergency goal:", existingGoalError);
    }

    const emergencyGoals = (existingGoals ?? []) as EmergencyGoalRow[];
    if (emergencyGoals.length > 1) {
        console.warn(
            `Found ${emergencyGoals.length} emergency goals for org ${orgId}; using the most recent one in read path.`
        );
    }
    const goal = emergencyGoals[0] ?? null;

    const { data: accounts } = await supabase
        .from("accounts")
        .select("id, name, type, initial_balance, liquidity_type")
        .eq("org_id", orgId)
        .in("type", ["savings", "investment"])
        .eq("is_active", true);

    const reserveAccounts = (accounts ?? []) as ReserveAccount[];

    // TODO: this should use real current balances (initial + transaction history).
    const totalAccumulated = reserveAccounts.reduce((sum, account) => sum + Number(account.initial_balance ?? 0), 0);

    const targetAmount = Number(goal?.target_amount ?? 0);
    const progressPercentage = targetAmount > 0 ? (totalAccumulated / targetAmount) * 100 : 0;

    // Heuristic: reserve target represents around 6 months of expenses.
    const estimatedMonthlyExpense = targetAmount / 6;
    const monthsCovered = estimatedMonthlyExpense > 0 ? totalAccumulated / estimatedMonthlyExpense : 0;

    const liquidityBreakdown: Record<string, number> = {};
    reserveAccounts.forEach((account) => {
        const type = account.liquidity_type ?? "immediate";
        liquidityBreakdown[type] = (liquidityBreakdown[type] ?? 0) + Number(account.initial_balance ?? 0);
    });

    return {
        totalAccumulated,
        targetAmount,
        progressPercentage,
        monthsCovered,
        liquidityBreakdown,
        accounts: reserveAccounts,
        goalId: goal?.id,
    };
}

export async function updateEmergencyGoalTarget(input: { goalId?: string; targetAmount: number }) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return { error: "Unauthorized" };
    }

    if (!Number.isFinite(input.targetAmount) || input.targetAmount <= 0) {
        return { error: "Target amount must be greater than zero." };
    }

    const orgId = await getActiveOrgIdForUser(supabase, user.id);
    if (!orgId) {
        return { error: "Organization not found" };
    }

    const updateExistingGoal = async (goalId: string) => {
        const { data, error } = await supabase
            .from("goals")
            .update({
                target_amount: input.targetAmount,
                updated_at: new Date().toISOString(),
            })
            .eq("id", goalId)
            .eq("org_id", orgId)
            .eq("type", "emergency_fund")
            .select("id")
            .maybeSingle();

        if (error) {
            console.error("Error updating emergency goal:", error);
            if (error.code === "42501") {
                return { error: "You do not have permission to edit this goal." };
            }
            return { error: "Failed to update emergency goal" };
        }

        return { updated: Boolean(data) };
    };

    if (input.goalId) {
        const fromProvidedId = await updateExistingGoal(input.goalId);
        if ("error" in fromProvidedId) return fromProvidedId;
        if (fromProvidedId.updated) {
            revalidatePath("/dashboard/metas");
            revalidatePath("/dashboard");
            return { success: true };
        }
    }

    const { data: existingGoal, error: lookupError } = await supabase
        .from("goals")
        .select("id")
        .eq("org_id", orgId)
        .eq("type", "emergency_fund")
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (lookupError) {
        console.error("Error finding emergency goal:", lookupError);
        return { error: "Failed to update emergency goal" };
    }

    if (existingGoal?.id) {
        const fromLookup = await updateExistingGoal(existingGoal.id);
        if ("error" in fromLookup) return fromLookup;
        if (fromLookup.updated) {
            revalidatePath("/dashboard/metas");
            revalidatePath("/dashboard");
            return { success: true };
        }
    }

    const { error: insertError } = await supabase.from("goals").insert({
        org_id: orgId,
        name: DEFAULT_EMERGENCY_GOAL_NAME,
        type: "emergency_fund",
        target_amount: input.targetAmount,
        current_amount: 0,
        strategy: "manual",
    });

    if (insertError) {
        if (insertError.code === "23505") {
            const { data: racedGoal } = await supabase
                .from("goals")
                .select("id")
                .eq("org_id", orgId)
                .eq("type", "emergency_fund")
                .limit(1)
                .maybeSingle();

            if (racedGoal?.id) {
                const racedUpdate = await updateExistingGoal(racedGoal.id);
                if ("error" in racedUpdate) return racedUpdate;
                if (racedUpdate.updated) {
                    revalidatePath("/dashboard/metas");
                    revalidatePath("/dashboard");
                    return { success: true };
                }
            }
        }

        console.error("Error creating emergency goal:", insertError);
        if (insertError.code === "42501") {
            return { error: "You do not have permission to edit this goal." };
        }
        return { error: "Failed to update emergency goal" };
    }

    revalidatePath("/dashboard/metas");
    revalidatePath("/dashboard");
    return { success: true };
}
