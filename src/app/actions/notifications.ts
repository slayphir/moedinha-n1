"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/active-org";
import { revalidatePath } from "next/cache";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export async function getTelegramConfig() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "NÃ£o autorizado" };

    const orgId = await getActiveOrgIdForUser(supabase, user.id);
    if (!orgId) return { error: "OrganizaÃ§Ã£o nÃ£o encontrada" };

    const { data: org, error } = await supabase
        .from("orgs")
        .select("telegram_config")
        .eq("id", orgId)
        .single();

    if (error) return { error: error.message };

    return { config: org.telegram_config };
}

export type TelegramConfigInput = {
    chat_id: string;
    is_active: boolean;
    preferences: {
        daily_summary: boolean;
        bill_reminder: boolean;
    };
};

export async function updateTelegramConfig(config: TelegramConfigInput) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "NÃ£o autorizado" };

    const orgId = await getActiveOrgIdForUser(supabase, user.id);
    if (!orgId) return { error: "OrganizaÃ§Ã£o nÃ£o encontrada" };

    const { error } = await supabase
        .from("orgs")
        .update({ telegram_config: config, updated_at: new Date().toISOString() })
        .eq("id", orgId);

    if (error) return { error: error.message };

    revalidatePath("/dashboard/configuracoes");
    return { success: true };
}

export async function testTelegramIntegration(chatId: string) {
    if (!TELEGRAM_BOT_TOKEN) return { error: "Token do Bot nÃ£o configurado no servidor (.env)" };

    try {
        const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: "ðŸ”” *Moedinha*: Teste de IntegraÃ§Ã£o!\n\nSe vocÃª recebeu esta mensagem, seu Chat ID estÃ¡ correto.",
                parse_mode: "Markdown"
            })
        });

        const data = await res.json();
        if (!data.ok) {
            return { error: `Erro do Telegram: ${data.description}` };
        }

        return { success: true };
    } catch (error) {
        return { error: "Falha ao conectar com API do Telegram" };
    }
}

// Internal helper for Cron Jobs
export async function sendTelegramMessage(chatId: string, text: string) {
    if (!TELEGRAM_BOT_TOKEN) return false;

    try {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: "Markdown"
            })
        });
        return true;
    } catch (e) {
        console.error("Telegram Send Error", e);
        return false;
    }
}


