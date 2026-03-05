"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useFinancialData } from "@/hooks/use-financial-data";
import { useOrg } from "@/contexts/org-context";
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
type ParsedStatus = "pending" | "cleared";

type RawCSVRow = Record<string, string | undefined>;

type AccountRow = {
    id: string;
    org_id: string;
    name: string;
};

type CategoryRow = {
    id: string;
    org_id: string;
    name: string;
    type: ParsedType;
    default_bucket_id?: string | null;
};

type ContactRow = {
    id: string;
    org_id: string;
    name: string;
};

type TagRow = {
    id: string;
    org_id: string;
    name: string;
};

interface ParsedCSVRow {
    date: string;
    dueDate: string | null;
    description: string;
    amount: number;
    type: ParsedType;
    status: ParsedStatus;
    accountName: string | null;
    transferAccountName: string | null;
    categoryName: string | null;
    contactName: string | null;
    tags: string[];
}

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

const FIELD_ALIASES = {
    date: ["date", "data"],
    dueDate: ["due_date", "due date", "vencimento", "data_vencimento"],
    description: ["description", "descricao", "historico", "memo"],
    amount: ["amount", "valor", "value"],
    type: ["type", "tipo"],
    status: ["status", "situacao", "status_pagamento"],
    account: ["account", "conta", "account_name", "nome_conta"],
    transferAccount: [
        "transfer_account",
        "transfer_account_name",
        "conta_transferencia",
        "conta_destino",
        "conta_destino_nome",
    ],
    category: ["category", "categoria", "category_name", "nome_categoria"],
    contact: ["contact", "contato", "contact_name", "nome_contato", "favorecido"],
    tags: ["tags", "etiquetas", "labels", "marcadores"],
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
    if (["expense", "despesa", "saida"].includes(normalized)) return "expense";
    if (["transfer", "transferencia"].includes(normalized)) return "transfer";

    return amount < 0 ? "expense" : "income";
}

function parseStatus(rawStatus: string): ParsedStatus {
    const normalized = stripAccents(rawStatus);
    if (["pending", "pendente", "agendado", "a vencer"].includes(normalized)) return "pending";
    if (["cleared", "pago", "recebido", "realizado", "quitado"].includes(normalized)) return "cleared";
    return "cleared";
}

function parseTags(rawTags: string): string[] {
    const value = rawTags.trim();
    if (!value) return [];
    return Array.from(
        new Set(
            value
                .split(/[|;,]/)
                .map((item) => item.trim())
                .filter(Boolean)
        )
    );
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
    const { orgId } = useOrg();
    const [open, setOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<ParsedCSVRow[]>([]);
    const [skippedRows, setSkippedRows] = useState(0);
    const [loading, setLoading] = useState(false);
    const [defaultAccountId, setDefaultAccountId] = useState("");
    const [defaultCategoryId, setDefaultCategoryId] = useState("");
    const [defaultTagsText, setDefaultTagsText] = useState("");
    const { accounts, categories, contacts, tags, refetch } = useFinancialData();
    const supabase = createClient();

    const scopedAccounts = useMemo(() => {
        const source = accounts as AccountRow[];
        return source.filter((account) => !orgId || account.org_id === orgId);
    }, [accounts, orgId]);

    const scopedCategories = useMemo(() => {
        const source = categories as CategoryRow[];
        return source.filter((category) => !orgId || category.org_id === orgId);
    }, [categories, orgId]);

    const scopedContacts = useMemo(() => {
        const source = contacts as ContactRow[];
        return source.filter((contact) => !orgId || contact.org_id === orgId);
    }, [contacts, orgId]);

    const scopedTags = useMemo(() => {
        const source = tags as TagRow[];
        return source.filter((tag) => !orgId || tag.org_id === orgId);
    }, [tags, orgId]);

    const accountsByName = useMemo(() => {
        const map = new Map<string, AccountRow>();
        for (const account of scopedAccounts) {
            const key = stripAccents(account.name);
            if (!map.has(key)) map.set(key, account);
        }
        return map;
    }, [scopedAccounts]);

    const categoriesByName = useMemo(() => {
        const map = new Map<string, { id: string; type: string; default_bucket_id?: string | null }>();
        for (const category of scopedCategories) {
            const key = stripAccents(category.name);
            const typedKey = `${category.type}:${key}`;
            if (!map.has(typedKey)) {
                map.set(typedKey, {
                    id: category.id,
                    type: category.type,
                    default_bucket_id: category.default_bucket_id ?? null,
                });
            }
            const genericKey = `all:${key}`;
            if (!map.has(genericKey)) {
                map.set(genericKey, {
                    id: category.id,
                    type: category.type,
                    default_bucket_id: category.default_bucket_id ?? null,
                });
            }
        }
        return map;
    }, [scopedCategories]);

    const resolveCategory = (rowType: ParsedType, categoryName: string | null) => {
        if (!categoryName || rowType === "transfer") return null;
        const key = stripAccents(categoryName);
        const typed = categoriesByName.get(`${rowType}:${key}`);
        if (typed) return typed;
        return categoriesByName.get(`all:${key}`) ?? null;
    };

    const contactsByName = useMemo(() => {
        const map = new Map<string, ContactRow>();
        for (const contact of scopedContacts) {
            const key = stripAccents(contact.name);
            if (!map.has(key)) map.set(key, contact);
        }
        return map;
    }, [scopedContacts]);

    const existingTagsByName = useMemo(() => {
        const map = new Map<string, TagRow>();
        for (const tag of scopedTags) {
            const key = stripAccents(tag.name);
            if (!map.has(key)) map.set(key, tag);
        }
        return map;
    }, [scopedTags]);

    const requiresFallbackAccount = preview.some((row) => !row.accountName);
    const hasRowsWithoutCategory = preview.some(
        (row) => row.type !== "transfer" && !row.categoryName
    );
    const hasRowsWithoutTags = preview.some((row) => row.tags.length === 0);

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
                let skipped = 0;

                for (const row of results.data) {
                    const rawDate = getFieldValue(row, FIELD_ALIASES.date);
                    const rawDueDate = getFieldValue(row, FIELD_ALIASES.dueDate);
                    const rawDescription = getFieldValue(row, FIELD_ALIASES.description);
                    const rawAmount = getFieldValue(row, FIELD_ALIASES.amount);
                    const rawType = getFieldValue(row, FIELD_ALIASES.type);
                    const rawStatus = getFieldValue(row, FIELD_ALIASES.status);
                    const rawAccount = getFieldValue(row, FIELD_ALIASES.account);
                    const rawTransferAccount = getFieldValue(row, FIELD_ALIASES.transferAccount);
                    const rawCategory = getFieldValue(row, FIELD_ALIASES.category);
                    const rawContact = getFieldValue(row, FIELD_ALIASES.contact);
                    const rawTags = getFieldValue(row, FIELD_ALIASES.tags);

                    const amount = parseCsvAmount(rawAmount);
                    const date = parseCsvDate(rawDate);
                    if (amount === null || !date) {
                        skipped += 1;
                        continue;
                    }

                    const type = parseType(rawType, amount);
                    const dueDate = parseCsvDate(rawDueDate);
                    const status = parseStatus(rawStatus);

                    parsedRows.push({
                        date,
                        dueDate,
                        description: rawDescription || "Importado via CSV",
                        amount: Math.abs(amount),
                        type,
                        status,
                        accountName: rawAccount || null,
                        transferAccountName: rawTransferAccount || null,
                        categoryName: rawCategory || null,
                        contactName: rawContact || null,
                        tags: parseTags(rawTags),
                    });
                }

                setPreview(parsedRows);
                setSkippedRows(skipped);
            },
            error: (error) => {
                console.error("CSV parse error:", error);
                alert("Nao foi possivel ler o CSV.");
            },
        });
    };

    const processImport = async () => {
        if (requiresFallbackAccount && !defaultAccountId) {
            alert("Selecione uma conta padrao para linhas sem conta definida.");
            return;
        }
        if (preview.length === 0) {
            alert("Nenhuma linha valida encontrada no arquivo.");
            return;
        }

        setLoading(true);

        try {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) throw new Error("Usuario nao autenticado");

            const selectedAccount = defaultAccountId
                ? scopedAccounts.find((account) => account.id === defaultAccountId)
                : null;
            if (requiresFallbackAccount && !selectedAccount) throw new Error("Conta padrao invalida");

            const mutableTagsByName = new Map(existingTagsByName);

            const ensureTagId = async (orgIdValue: string, tagName: string) => {
                const normalized = stripAccents(tagName);
                const existing = mutableTagsByName.get(normalized);
                if (existing) return existing.id;

                const { data: insertedTag, error: insertTagError } = await supabase
                    .from("tags")
                    .insert({ org_id: orgIdValue, name: tagName })
                    .select("id, name, org_id")
                    .single();

                if (insertTagError) {
                    const { data: existingTag, error: existingTagError } = await supabase
                        .from("tags")
                        .select("id, name, org_id")
                        .eq("org_id", orgIdValue)
                        .eq("name", tagName)
                        .maybeSingle();

                    if (existingTagError || !existingTag) throw insertTagError;

                    mutableTagsByName.set(normalized, existingTag as TagRow);
                    return existingTag.id;
                }

                mutableTagsByName.set(normalized, insertedTag as TagRow);
                return insertedTag.id;
            };

            let successCount = 0;
            let errorCount = 0;

            for (const row of preview) {
                try {
                    const sourceAccount = row.accountName
                        ? accountsByName.get(stripAccents(row.accountName))
                        : selectedAccount;
                    if (!sourceAccount) {
                        throw new Error(`Conta nao encontrada para a linha: ${row.description}`);
                    }

                    let transferAccountId: string | null = null;
                    if (row.type === "transfer") {
                        const transferAccountName = row.transferAccountName?.trim();
                        if (!transferAccountName) {
                            throw new Error("Transferencias exigem conta de destino.");
                        }
                        const transferAccount = accountsByName.get(stripAccents(transferAccountName));
                        if (!transferAccount) {
                            throw new Error(`Conta destino nao encontrada: ${transferAccountName}`);
                        }
                        if (transferAccount.id === sourceAccount.id) {
                            throw new Error("Conta de origem e destino nao podem ser iguais.");
                        }
                        transferAccountId = transferAccount.id;
                    }

                    const maybeCategory = resolveCategory(row.type, row.categoryName);
                    if (row.categoryName && !maybeCategory && row.type !== "transfer") {
                        throw new Error(`Categoria nao encontrada: ${row.categoryName}`);
                    }
                    let categoryId: string | null = row.type === "transfer" ? null : maybeCategory?.id ?? null;
                    let bucketId: string | null =
                        row.type !== "transfer" && categoryId ? maybeCategory?.default_bucket_id ?? null : null;
                    if (row.type !== "transfer" && !categoryId && defaultCategoryId) {
                        const defaultCat = scopedCategories.find((c) => c.id === defaultCategoryId);
                        if (defaultCat) {
                            categoryId = defaultCat.id;
                            bucketId = defaultCat.default_bucket_id ?? null;
                        }
                    }
                    const contactId = row.contactName
                        ? contactsByName.get(stripAccents(row.contactName))?.id ?? null
                        : null;
                    const tagsToApply =
                        row.tags.length > 0 ? row.tags : parseTags(defaultTagsText);

                    const { data: insertedTx, error } = await supabase
                        .from("transactions")
                        .insert({
                            org_id: sourceAccount.org_id,
                            description: row.description,
                            amount: row.amount,
                            type: row.type,
                            status: row.status,
                            category_id: categoryId,
                            bucket_id: bucketId,
                            account_id: sourceAccount.id,
                            transfer_account_id: transferAccountId,
                            contact_id: contactId,
                            date: row.date,
                            due_date: row.type === "expense" ? row.dueDate : null,
                            created_by: user.id,
                        })
                        .select("id")
                        .single();

                    if (error) throw error;

                    if (insertedTx?.id && tagsToApply.length > 0) {
                        const uniqueTagIds = Array.from(
                            new Set(
                                await Promise.all(
                                    tagsToApply.map((tagName) => ensureTagId(sourceAccount.org_id, tagName))
                                )
                            )
                        );
                        if (uniqueTagIds.length > 0) {
                            const { error: tagsError } = await supabase.from("transaction_tags").insert(
                                uniqueTagIds.map((tagId) => ({
                                    transaction_id: insertedTx.id,
                                    tag_id: tagId,
                                }))
                            );
                            if (tagsError) throw tagsError;
                        }
                    }

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
            setSkippedRows(0);
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

                <p className="text-xs text-muted-foreground -mt-2">
                    Se sua planilha nao tiver colunas de conta/cartao, categoria ou tags, defina os padroes abaixo.
                    Conta pode ser conta corrente ou cartao; linhas sem conta usarao a &quot;Conta padrao&quot;.
                </p>

                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">Conta padrao</Label>
                        <Select value={defaultAccountId} onValueChange={setDefaultAccountId}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="Para linhas sem conta/cartao na planilha" />
                            </SelectTrigger>
                            <SelectContent>
                                {scopedAccounts.map((account) => (
                                    <SelectItem key={account.id} value={account.id}>
                                        {account.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">Categoria padrao</Label>
                        <Select value={defaultCategoryId} onValueChange={setDefaultCategoryId}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="Opcional: para linhas sem categoria" />
                            </SelectTrigger>
                            <SelectContent>
                                {scopedCategories.map((cat) => (
                                    <SelectItem key={cat.id} value={cat.id}>
                                        {cat.name} ({cat.type})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">Tags padrao</Label>
                        <div className="col-span-3">
                            <input
                                type="text"
                                value={defaultTagsText}
                                onChange={(e) => setDefaultTagsText(e.target.value)}
                                placeholder="Ex: importado, 2026 (separadas por virgula ou |)"
                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            />
                        </div>
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
                            {skippedRows > 0 && (
                                <p className="mb-2 text-amber-700">
                                    {skippedRows} linha(s) ignorada(s) por data/valor invalido.
                                </p>
                            )}
                            {requiresFallbackAccount && (
                                <p className="mb-2 text-muted-foreground">
                                    Algumas linhas nao possuem conta. Elas usarao a conta padrao.
                                </p>
                            )}
                            {hasRowsWithoutCategory && (
                                <p className="mb-2 text-muted-foreground">
                                    Algumas linhas sem categoria: use &quot;Categoria padrao&quot; acima ou deixe em branco.
                                </p>
                            )}
                            {hasRowsWithoutTags && (
                                <p className="mb-2 text-muted-foreground">
                                    Algumas linhas sem tags: use &quot;Tags padrao&quot; acima ou deixe em branco.
                                </p>
                            )}
                            {preview.slice(0, 5).map((row, index) => (
                                <div key={`${row.date}-${row.description}-${index}`} className="grid grid-cols-5 gap-2 border-b py-1 last:border-0">
                                    <span>{row.date}</span>
                                    <span className="truncate">{row.description}</span>
                                    <span>{row.type}</span>
                                    <span>{row.amount.toFixed(2)}</span>
                                    <span className="truncate">{row.accountName ?? "(conta padrao)"}</span>
                                </div>
                            ))}
                            {preview.length > 5 && (
                                <p className="mt-2 text-center italic">... e mais {preview.length - 5}</p>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        onClick={processImport}
                        disabled={!file || loading || (requiresFallbackAccount && !defaultAccountId)}
                    >
                        {loading ? "Processando..." : "Confirmar importacao"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
