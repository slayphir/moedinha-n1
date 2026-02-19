
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing env vars");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const targetAmount = 5.55;

    // Find transactions with amount 5.55 or -5.55
    const { data: transactions, error } = await supabase
        .from("transactions")
        .select("id, description, amount, date")
        .or(`amount.eq.${targetAmount},amount.eq.${-targetAmount}`)
        .is("deleted_at", null);

    if (error) {
        console.error("Error fetching transactions:", error);
        return;
    }

    if (!transactions || transactions.length === 0) {
        console.log(`No transactions found with amount ${targetAmount} or ${-targetAmount}`);
        return;
    }

    console.log(`Found ${transactions.length} transactions:`);
    transactions.forEach(t => console.log(`- [${t.id}] ${t.date} ${t.description}: ${t.amount}`));

    // Delete them
    const ids = transactions.map(t => t.id);
    const { error: deleteError } = await supabase
        .from("transactions")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", ids);

    if (deleteError) {
        console.error("Error deleting transactions:", deleteError);
    } else {
        console.log(`Successfully soft-deleted ${ids.length} transactions.`);
    }
}

main();
