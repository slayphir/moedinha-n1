import { createClient } from "@/lib/supabase/server";
import { getRecurringRules, processRecurringRules } from "@/app/actions/recurring";
import { RecurringRulesClient } from "./_components/recurring-rules-client";
import { redirect } from "next/navigation";

export default async function RecurringPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/");

    const { data: members } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1);
    const orgId = members?.[0]?.org_id;
    if (!orgId) redirect("/onboarding");

    // "Lazy Trigger": Check for due transactions every time the user visits this page
    await processRecurringRules(orgId);

    const { data: rules } = await getRecurringRules(orgId);

    return (
        <div className="container py-8">
            <RecurringRulesClient rules={rules || []} />
        </div>
    );
}
