"use client";

import { Download, FileSpreadsheet } from "lucide-react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/contexts/org-context";

type RelationName = { name: string } | { name: string }[] | null;

type TransactionExport = {
    id: string;
    date: string;
    due_date: string | null;
    description: string | null;
    amount: number;
    type: string;
    status: string;
    account: RelationName;
    transfer_account: RelationName;
    category: RelationName;
    contact: RelationName;
};

type TransactionTagLink = {
    transaction_id: string;
    tag: RelationName;
};

const TEMPLATE_ROWS = [
    {
        date: "2026-03-05",
        due_date: "",
        description: "Salario empresa",
        amount: "5000.00",
        type: "income",
        status: "cleared",
        account_name: "Conta Principal",
        transfer_account_name: "",
        category_name: "Salario",
        contact_name: "Empresa",
        tags: "fixo|trabalho",
    },
    {
        date: "2026-03-07",
        due_date: "2026-03-10",
        description: "Mercado",
        amount: "-420.50",
        type: "expense",
        status: "pending",
        account_name: "Conta Principal",
        transfer_account_name: "",
        category_name: "Alimentacao",
        contact_name: "",
        tags: "mercado|essencial",
    },
    {
        date: "2026-03-08",
        due_date: "",
        description: "Transferencia para reserva",
        amount: "800.00",
        type: "transfer",
        status: "cleared",
        account_name: "Conta Principal",
        transfer_account_name: "Conta Investimentos",
        category_name: "",
        contact_name: "",
        tags: "reserva",
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
    const { orgId } = useOrg();
    const supabase = createClient();

    const handleDownloadTemplate = () => {
        downloadCsv(TEMPLATE_ROWS, "modelo_lancamentos_moeda_n1.csv");
    };

    const handleExport = async () => {
        try {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) return;

            let resolvedOrgId = orgId;
            if (!resolvedOrgId) {
                const { data: members } = await supabase
                    .from("org_members")
                    .select("org_id")
                    .eq("user_id", user.id)
                    .limit(1);
                resolvedOrgId = members?.[0]?.org_id ?? null;
            }
            if (!resolvedOrgId) return;

            const { data: transactions, error } = await supabase
                .from("transactions")
                .select(`
          id,
          date,
          due_date,
          description,
          amount,
          type,
          status,
          account:accounts!transactions_account_id_fkey(name),
          transfer_account:accounts!transactions_transfer_account_id_fkey(name),
          category:categories(name),
          contact:contacts(name)
        `)
                .eq("org_id", resolvedOrgId)
                .is("deleted_at", null)
                .order("date", { ascending: false });

            if (error) throw error;

            if (!transactions || transactions.length === 0) {
                handleDownloadTemplate();
                alert("Ainda nao existem lancamentos. Baixamos o modelo para voce comecar.");
                return;
            }

            const transactionIds = (transactions as TransactionExport[]).map((transaction) => transaction.id);
            const { data: tagLinks, error: tagLinksError } = await supabase
                .from("transaction_tags")
                .select("transaction_id, tag:tags(name)")
                .in("transaction_id", transactionIds);

            if (tagLinksError) throw tagLinksError;

            const tagsByTransaction = new Map<string, string[]>();
            for (const link of (tagLinks ?? []) as TransactionTagLink[]) {
                const tagName = getRelationName(link.tag);
                if (!tagName) continue;
                const current = tagsByTransaction.get(link.transaction_id) ?? [];
                current.push(tagName);
                tagsByTransaction.set(link.transaction_id, current);
            }

            const rows = (transactions as TransactionExport[]).map((transaction) => {
                const amount = Number(transaction.amount);
                const signedAmount = transaction.type === "expense" ? -Math.abs(amount) : Math.abs(amount);

                return {
                    date: transaction.date,
                    due_date: transaction.due_date ?? "",
                    description: transaction.description ?? "",
                    amount: signedAmount.toFixed(2),
                    type: transaction.type,
                    status: transaction.status,
                    account_name: getRelationName(transaction.account),
                    transfer_account_name: getRelationName(transaction.transfer_account),
                    category_name: getRelationName(transaction.category),
                    contact_name: getRelationName(transaction.contact),
                    tags: (tagsByTransaction.get(transaction.id) ?? []).join("|"),
                };
            });

            downloadCsv(rows, `lancamentos_moeda_n1_${new Date().toISOString().slice(0, 10)}.csv`);
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
