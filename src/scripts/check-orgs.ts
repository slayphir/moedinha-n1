import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const orgId = "4699b36b-59e1-4f7d-a914-d1bd7142d36f";

    // All transactions for this org (including deleted)
    const { data: allTx } = await supabase
        .from("transactions")
        .select("id, description, amount, date, status, deleted_at, account_id")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

    const results = {
        totalInDb: allTx?.length || 0,
        active: allTx?.filter(t => !t.deleted_at) || [],
        deleted: allTx?.filter(t => t.deleted_at) || [],
    };

    fs.writeFileSync("src/scripts/tx_debug.json", JSON.stringify(results, null, 2), "utf-8");
    console.log("Done -> tx_debug.json");
}

main();
