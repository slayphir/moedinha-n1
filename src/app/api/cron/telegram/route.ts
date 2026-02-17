import { createClient } from "@/lib/supabase/server";
import { sendTelegramMessage, TelegramConfigInput } from "@/app/actions/notifications";
import { formatCurrency } from "@/lib/utils";
import { startOfMonth, endOfMonth, addDays, format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";

export async function GET(request: Request) {
    // Optional: Check for CRON_SECRET if deploying to Vercel
    // const authHeader = request.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //   return new Response('Unauthorized', { status: 401 });
    // }

    const supabase = await createClient();

    // 1. Fetch Orgs with active Telegram Config
    const { data: orgs, error } = await supabase
        .from("orgs")
        .select("id, name, telegram_config")
        .not("telegram_config", "is", null);

    if (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }

    const results = [];

    for (const org of orgs) {
        const config = org.telegram_config as unknown as TelegramConfigInput;
        if (!config?.is_active || !config?.chat_id) continue;

        const today = new Date();
        const tomorrow = addDays(today, 1);
        const messages: string[] = [];

        // --- A. Daily Summary (Balance + Projection) ---
        if (config.preferences?.daily_summary) {
            // Fetch Account Balances
            const { data: accounts } = await supabase
                .from("accounts")
                .select("initial_balance, id")
                .eq("org_id", org.id);

            // Calculate Current Balance (simplified for Cron - ideally use a helper)
            // We really need the helper from 'actions/projections' or similar, but those are server actions.
            // Let's do a quick calculation or skip complexity for MVP.
            // MVP: Just show "Moedinha Check-in"
            messages.push(`📊 *Resumo Diário - ${org.name}*`);
            messages.push(`🗓 ${format(today, "dd 'de' MMMM", { locale: ptBR })}`);
        }

        // --- B. Bill Reminder (Due Today/Tomorrow) ---
        if (config.preferences?.bill_reminder) {
            const { data: bills } = await supabase
                .from("transactions")
                .select("description, amount, date, type")
                .eq("org_id", org.id)
                .eq("type", "expense")
                .in("status", ["pending"]) // Only pending
                .gte("date", format(today, "yyyy-MM-dd"))
                .lte("date", format(tomorrow, "yyyy-MM-dd"));

            if (bills && bills.length > 0) {
                const dueToday = bills.filter(b => isSameDay(new Date(b.date), today));
                const dueTomorrow = bills.filter(b => isSameDay(new Date(b.date), tomorrow));

                if (dueToday.length > 0) {
                    messages.push(`\n⚠️ *Vencendo Hoje:*`);
                    dueToday.forEach(b => messages.push(`• ${b.description}: ${formatCurrency(b.amount)}`));
                }

                if (dueTomorrow.length > 0) {
                    messages.push(`\n🕒 *Vencendo Amanhã:*`);
                    dueTomorrow.forEach(b => messages.push(`• ${b.description}: ${formatCurrency(b.amount)}`));
                }
            }
        }

        // Send Message if there's content
        if (messages.length > 0) {
            const fullMessage = messages.join("\n");
            const sent = await sendTelegramMessage(config.chat_id, fullMessage);
            results.push({ org: org.name, sent });
        }
    }

    return Response.json({ success: true, processed: results.length, details: results });
}
