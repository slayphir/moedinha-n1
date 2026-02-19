import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getInvoiceData, getAvailableInvoices } from "@/app/actions/invoices";
import { InvoiceView } from "@/app/(dashboard)/dashboard/faturas/_components/invoice-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface CreditCardInvoicePageProps {
    params: {
        id: string;
    };
    searchParams: {
        month?: string;
        year?: string;
    };
}

export default async function CreditCardInvoicePage({ params, searchParams }: CreditCardInvoicePageProps) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/");

    // Verify ownership
    const { data: account } = await supabase
        .from("accounts")
        .select("id, org_id")
        .eq("id", params.id)
        .single();

    if (!account) {
        redirect("/dashboard/faturas");
    }

    const { data: members } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .eq("org_id", account.org_id)
        .single();

    if (!members) {
        redirect("/dashboard");
    }

    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    let selectedMonth = currentMonth;
    let selectedYear = currentYear;

    if (searchParams.month && searchParams.month.includes("-")) {
        const [y, m] = searchParams.month.split("-");
        selectedYear = parseInt(y);
        selectedMonth = parseInt(m) - 1; // 0-indexed
    } else {
        if (searchParams.month) selectedMonth = parseInt(searchParams.month);
        if (searchParams.year) selectedYear = parseInt(searchParams.year);
    }

    const invoiceData = await getInvoiceData(params.id, selectedYear, selectedMonth);
    const availableInvoices = await getAvailableInvoices(params.id);

    if (!invoiceData || 'error' in invoiceData) {
        return <div>{invoiceData?.error || "Erro ao carregar fatura."}</div>;
    }

    // Server action to handle navigation (just redirects with new params)
    async function handleMonthChange(year: number, month: number) {
        "use server";
        redirect(`/dashboard/cartoes/${params.id}?year=${year}&month=${month}`);
    }

    return (
        <div className="container mx-auto py-6 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="font-display text-2xl font-bold">Detalhes da Fatura</h1>
            </div>

            <InvoiceView
                data={invoiceData.data!}
                availableInvoices={availableInvoices}
                onMonthChange={handleMonthChange}
            />
        </div>
    );
}
