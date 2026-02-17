"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useFinancialData } from "@/hooks/use-financial-data";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ParsedType = "income" | "expense" | "transfer";

type RawCSVRow = Record<string, string | undefined>;

interface ParsedCSVRow {
    date: string;
    description: string;
    amount: number;
    type: ParsedType;
    categoryName: string | null;
}

const TEMPLATE_ROWS = [
    {
        date: "2026-02-01",
        description: "Salario",
        amount: "5000.00",
        type: "income",
        category: "Salario",
    },
    {
        date: "2026-02-05",
        description: "Mercado",
        amount: "-420.50",
        type: "expense",
        category: "Alimentacao",
    },
];

const FIELD_ALIASES = {
    date: ["date", "data"],
    description: ["description", "descricao", "descrição", "historico", "histórico"],
    amount: ["amount", "valor", "value"],
    type: ["type", "tipo"],
    category: ["category", "categoria"],
};

function stripAccents(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function getFieldValue(row: RawCSVRow, aliases: string[]): string {
    const keys = Object.keys(row);
    for (const key of keys) {
        const normalized = stripAccents(key);
        if (aliases.some((alias) => stripAccents(alias) === normalized)) {
            return (row[key] ?? "").trim();
        }
    }
    return "";
}

function parseCsvAmount(rawAmount: string): number | null {
    const cleaned = rawAmount.replace(/\s/g, "").replace(/R\$/gi, "").replace(/[^0-9,.-]/g, "");
    if (!cleaned) return null;

    let normalized = cleaned;
    const commaCount = (normalized.match(/,/g) ?? []).length;
    const dotCount = (normalized.match(/\./g) ?? []).length;

    if (commaCount > 0 && dotCount > 0) {
        const lastComma = normalized.lastIndexOf(",");
        const lastDot = normalized.lastIndexOf(".");
        if (lastComma > lastDot) {
            normalized = normalized.replace(/\./g, "").replace(",", ".");
        } else {
            normalized = normalized.replace(/,/g, "");
        }
    } else if (commaCount > 0) {
        normalized = normalized.replace(",", ".");
    }

    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
}

function parseCsvDate(rawDate: string): string | null {
    const value = rawDate.trim();
    if (!value) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
        const [day, month, year] = value.split("/");
        return `${year}-${month}-${day}`;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
}

function parseType(rawType: string, amount: number): ParsedType {
    const normalized = stripAccents(rawType);

    if (["income", "receita", "entrada"].includes(normalized)) return "income";
    if (["expense", "despesa", "saida", "saída"].includes(normalized)) return "expense";
    if (["transfer", "transferencia", "transferência"].includes(normalized)) return "transfer";

    return amount < 0 ? "expense" : "income";
}

function downloadTemplate() {
    const csv = Papa.unparse(TEMPLATE_ROWS);
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "modelo_importacao_moeda_n1.csv";
    anchor.click();
    URL.revokeObjectURL(url);
}

export function CSVImporter({ onSuccess }: { onSuccess?: () => void }) {
    const [open, setOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<ParsedCSVRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [defaultAccountId, setDefaultAccountId] = useState("");
    const { accounts, categories, refetch } = useFinancialData();
    const supabase = createClient();

    const categoriesByName = useMemo(() => {
        const map = new Map<string, { id: string; type: string }>();
        for (const category of categories) {
            map.set(stripAccents(category.name), { id: category.id, type: category.type });
        }
        return map;
    }, [categories]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        if (!selectedFile) return;
        setFile(selectedFile);
        parseFile(selectedFile);
    };

    const parseFile = (selectedFile: File) => {
        Papa.parse<RawCSVRow>(selectedFile, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const parsedRows: ParsedCSVRow[] = [];

                for (const row of results.data) {
                    const rawDate = getFieldValue(row, FIELD_ALIASES.date);
                    const rawDescription = getFieldValue(row, FIELD_ALIASES.description);
                    const rawAmount = getFieldValue(row, FIELD_ALIASES.amount);
                    const rawType = getFieldValue(row, FIELD_ALIASES.type);
                    const rawCategory = getFieldValue(row, FIELD_ALIASES.category);

                    const amount = parseCsvAmount(rawAmount);
                    const date = parseCsvDate(rawDate);
                    if (amount === null || !date) continue;

                    const type = parseType(rawType, amount);

                    parsedRows.push({
                        date,
                        description: rawDescription || "Importado via CSV",
                        amount: Math.abs(amount),
                        type,
                        categoryName: rawCategory || null,
                    });
                }

                setPreview(parsedRows);
            },
            error: (error) => {
                console.error("CSV parse error:", error);
                alert("Nao foi possivel ler o CSV.");
            },
        });
    };

    const processImport = async () => {
        if (!defaultAccountId) {
            alert("Selecione uma conta destino.");
            return;
        }
        if (preview.length === 0) {
            alert("Nenhuma linha valida encontrada no arquivo.");
            return;
        }

        setLoading(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Usuario nao autenticado");

            const selectedAccount = accounts.find((account) => account.id === defaultAccountId);
            if (!selectedAccount) throw new Error("Conta invalida");

            let successCount = 0;
            let errorCount = 0;

            for (const row of preview) {
                try {
                    const categoryKey = row.categoryName ? stripAccents(row.categoryName) : "";
                    const maybeCategory = categoryKey ? categoriesByName.get(categoryKey) : undefined;
                    const categoryId =
                        maybeCategory && (maybeCategory.type === row.type || row.type === "transfer")
                            ? maybeCategory.id
                            : null;

                    const { error } = await supabase.from("transactions").insert({
                        org_id: selectedAccount.org_id,
                        description: row.description,
                        amount: row.amount,
                        type: row.type,
                        category_id: categoryId,
                        account_id: defaultAccountId,
                        date: row.date,
                        status: "cleared",
                        created_by: user.id,
                    });

                    if (error) throw error;
                    successCount += 1;
                } catch (rowError) {
                    console.error("CSV import row error:", rowError);
                    errorCount += 1;
                }
            }

            alert(`Importacao concluida.\nSucesso: ${successCount}\nErros: ${errorCount}`);
            setOpen(false);
            setFile(null);
            setPreview([]);
            onSuccess?.();
            refetch();
        } catch (error) {
            console.error("CSV import error:", error);
            alert("Erro critico durante a importacao.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                    <Upload className="h-4 w-4" />
                    Importar CSV
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[640px]">
                <DialogHeader>
                    <DialogTitle>Importar transacoes</DialogTitle>
                    <DialogDescription className="flex flex-wrap items-center gap-2">
                        Use o modelo padrao para evitar falhas de coluna e formato.
                        <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={downloadTemplate}>
                            Baixar modelo CSV
                        </Button>
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">Conta destino</Label>
                        <Select value={defaultAccountId} onValueChange={setDefaultAccountId}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="Selecione a conta" />
                            </SelectTrigger>
                            <SelectContent>
                                {accounts.map((account) => (
                                    <SelectItem key={account.id} value={account.id}>
                                        {account.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">Arquivo CSV</Label>
                        <div className="col-span-3">
                            <input
                                type="file"
                                accept=".csv"
                                onChange={handleFileChange}
                                className="block w-full text-sm text-slate-500 file:mr-4 file:rounded-full file:border-0 file:bg-emerald-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-emerald-700 hover:file:bg-emerald-200"
                            />
                        </div>
                    </div>

                    {preview.length > 0 && (
                        <div className="max-h-[220px] overflow-auto rounded-md border bg-muted/50 p-2 text-xs">
                            <p className="mb-2 font-bold">{preview.length} registros validos encontrados.</p>
                            {preview.slice(0, 5).map((row, index) => (
                                <div key={`${row.date}-${row.description}-${index}`} className="grid grid-cols-4 gap-2 border-b py-1 last:border-0">
                                    <span>{row.date}</span>
                                    <span className="truncate">{row.description}</span>
                                    <span>{row.type}</span>
                                    <span>{row.amount.toFixed(2)}</span>
                                </div>
                            ))}
                            {preview.length > 5 && (
                                <p className="mt-2 text-center italic">... e mais {preview.length - 5}</p>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button onClick={processImport} disabled={!file || !defaultAccountId || loading}>
                        {loading ? "Processando..." : "Confirmar importacao"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

