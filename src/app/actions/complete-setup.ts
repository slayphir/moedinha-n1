"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/active-org";
import { revalidatePath } from "next/cache";

export async function completeSetup(orgId: string) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Nao autorizado" };

    const activeOrgId = await getActiveOrgIdForUser(supabase, user.id);
    if (!activeOrgId) return { error: "Organizacao nao encontrada" };
    if (activeOrgId !== orgId) return { error: "Organizacao invalida" };

    const { error } = await supabase
        .from("orgs")
        .update({ setup_completed: true, updated_at: new Date().toISOString() })
        .eq("id", activeOrgId);

    if (error) return { error: error.message };

    revalidatePath("/dashboard");
    return {};
}

export async function createCategory(input: {
    name: string;
    type: "income" | "expense";
}) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Nao autorizado" };

    const orgId = await getActiveOrgIdForUser(supabase, user.id);
    if (!orgId) return { error: "Organizacao nao encontrada" };

    const { data, error } = await supabase
        .from("categories")
        .insert({ org_id: orgId, name: input.name, type: input.type })
        .select("id, name, type")
        .single();

    if (error) return { error: error.message };

    revalidatePath("/dashboard/cadastros");
    return { data };
}

export async function deleteCategory(id: string) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Nao autorizado" };

    const orgId = await getActiveOrgIdForUser(supabase, user.id);
    if (!orgId) return { error: "Organizacao nao encontrada" };

    const { data, error } = await supabase
        .from("categories")
        .delete()
        .eq("id", id)
        .eq("org_id", orgId)
        .select("id")
        .maybeSingle();

    if (error) return { error: error.message };
    if (!data) return { error: "Categoria nao encontrada na organizacao atual" };

    revalidatePath("/dashboard/cadastros");
    return {};
}

export async function getSetupData() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const orgId = await getActiveOrgIdForUser(supabase, user.id);
    if (!orgId) return null;

    const [accounts, categories] = await Promise.all([
        supabase
            .from("accounts")
            .select("id, name, type, is_credit_card")
            .eq("org_id", orgId)
            .eq("is_active", true),
        supabase
            .from("categories")
            .select("id, name, type")
            .eq("org_id", orgId)
            .order("name"),
    ]);

    return {
        orgId,
        accounts: accounts.data ?? [],
        categories: categories.data ?? [],
    };
}
