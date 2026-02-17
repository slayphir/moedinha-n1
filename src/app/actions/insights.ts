"use server";

import { createClient } from "@/lib/supabase/server";
import { runInsightsEngine } from "@/lib/insights-engine";
import { revalidatePath } from "next/cache";

export type Insight = {
    id: string;
    type: string;
    title: string;
    message: string;
    severity: "info" | "warn" | "critical";
    status: "active" | "dismissed" | "acted";
    created_at: string;
    metadata: any;
};

export async function getInsights() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from("insights")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error fetching insights:", error);
        return [];
    }

    return data as Insight[];
}

export async function refreshInsights() {
    await runInsightsEngine();
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/metas");
    return { success: true };
}

export async function dismissInsight(id: string) {
    const supabase = await createClient();

    const { error } = await supabase
        .from("insights")
        .update({ status: "dismissed" })
        .eq("id", id);

    if (error) {
        console.error("Error dismissing insight:", error);
        return { error: "Failed to dismiss insight" };
    }

    revalidatePath("/dashboard");
    return { success: true };
}
