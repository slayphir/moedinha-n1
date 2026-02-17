"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/active-org";
import { revalidatePath } from "next/cache";

export interface CreateAccountInput {
    name: string;
    initial_balance: number;
    type: string;
    is_credit_card?: boolean;
    credit_limit?: number;
    closing_day?: number;
    due_day?: number;
    liquidity_type?: string;
}

export interface UpdateAccountInput {
    id: string;
    name: string;
    initial_balance: number;
    type: string;
    is_credit_card?: boolean;
    credit_limit?: number;
    closing_day?: number;
    due_day?: number;
    liquidity_type?: string;
    is_active: boolean;
}

export async function createAccount(input: CreateAccountInput) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Nao autorizado" };

    const orgId = await getActiveOrgIdForUser(supabase, user.id);
    if (!orgId) return { error: "Organizacao nao encontrada" };

    const { data, error } = await supabase
        .from("accounts")
        .insert({
            org_id: orgId,
            name: input.name,
            initial_balance: input.initial_balance,
            type: input.type,
            is_credit_card: input.is_credit_card || false,
            credit_limit: input.credit_limit || 0,
            closing_day: input.closing_day || null,
            due_day: input.due_day || null,
            liquidity_type: input.liquidity_type || "immediate",
            is_active: true,
        })
        .select("id")
        .single();

    if (error) return { error: error.message };

    revalidatePath("/dashboard/cadastros");
    revalidatePath("/dashboard");
    return { id: data.id };
}

export async function updateAccount(input: UpdateAccountInput) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Nao autorizado" };

    const orgId = await getActiveOrgIdForUser(supabase, user.id);
    if (!orgId) return { error: "Organizacao nao encontrada" };

    const { data, error } = await supabase
        .from("accounts")
        .update({
            name: input.name,
            initial_balance: input.initial_balance,
            type: input.type,
            is_credit_card: input.is_credit_card || false,
            credit_limit: input.credit_limit || 0,
            closing_day: input.closing_day || null,
            due_day: input.due_day || null,
            liquidity_type: input.liquidity_type || "immediate",
            is_active: input.is_active,
            updated_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .eq("org_id", orgId)
        .select("id")
        .maybeSingle();

    if (error) return { error: error.message };
    if (!data) return { error: "Conta nao encontrada na organizacao atual" };

    revalidatePath("/dashboard/cadastros");
    revalidatePath("/dashboard");
    return {};
}

export async function deleteAccount(id: string) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Nao autorizado" };

    const orgId = await getActiveOrgIdForUser(supabase, user.id);
    if (!orgId) return { error: "Organizacao nao encontrada" };

    const { data, error } = await supabase
        .from("accounts")
        .delete()
        .eq("id", id)
        .eq("org_id", orgId)
        .select("id")
        .maybeSingle();

    if (error) return { error: error.message };
    if (!data) return { error: "Conta nao encontrada na organizacao atual" };

    revalidatePath("/dashboard/cadastros");
    revalidatePath("/dashboard");
    return {};
}
