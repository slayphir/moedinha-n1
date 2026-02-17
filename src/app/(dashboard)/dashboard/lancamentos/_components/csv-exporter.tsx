"use client";

import { Download, FileSpreadsheet } from "lucide-react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type RelationName = { name: string } | { name: string }[] | null;

type TransactionExport = {
    date: string;
    description: string | null;
    amount: number;
    type: string;
    status: string;
    account: RelationName;
    category: RelationName;
};

const TEMPLATE_ROWS = [
    {
        date: "2026-02-01",
        description: "Salario",
        amount: "5000.00",
        type: "income",
        status: "cleared",
        account_name: "Conta Principal",
        category_name: "Salario",
    },
    {
        date: "2026-02-05",
        description: "Mercado",
        amount: "-420.50",
        type: "expense",
        status: "cleared",
        account_name: "Conta Principal",
        category_name: "Alimentacao",
    },
];

function getRelationName(value: RelationName): string {
    if (Array.isArray(value)) return value[0]?.name ?? "";
    return value?.name ?? "";
}

function downloadCsv(rows: Record<string, string | number>[], filename: string) {
    const csv = Papa.unparse(rows);
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export function CSVExporter() {
    const supabase = createClient();

    const handleDownloadTemplate = () => {
        downloadCsv(TEMPLATE_ROWS, "modelo_lancamentos_moeda_n1.csv");
    };

    const handleExport = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: members } = await supabase.from("org_members").select("org_id").eq("user_id", user.id).limit(1);
            const orgId = members?.[0]?.org_id;
            if (!orgId) return;

            const { data: transactions, error } = await supabase
                .from("transactions")
                .select(`
          date,
          description,
          amount,
          type,
          status,
          account:accounts(name),
          category:categories(name)
        `)
                .eq("org_id", orgId)
                .is("deleted_at", null)
                .order("date", { ascending: false });

            if (error) throw error;

            if (!transactions || transactions.length === 0) {
                handleDownloadTemplate();
                alert("Ainda nao existem lancamentos. Baixamos o modelo para voce comecar.");
                return;
            }

            const rows = (transactions as TransactionExport[]).map((transaction) => ({
                date: transaction.date,
                description: transaction.description ?? "",
                amount: Number(transaction.amount).toFixed(2),
                type: transaction.type,
                status: transaction.status,
                account_name: getRelationName(transaction.account),
                category_name: getRelationName(transaction.category),
            }));

            downloadCsv(
                rows,
                `lancamentos_moeda_n1_${new Date().toISOString().slice(0, 10)}.csv`
            );
        } catch (error) {
            console.error("Export error:", error);
            alert("Erro ao exportar dados");
        }
    };

    return (
        <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={handleDownloadTemplate}>
                <FileSpreadsheet className="h-4 w-4" />
                Modelo
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleExport}>
                <Download className="h-4 w-4" />
                Exportar
            </Button>
        </div>
    );
}
