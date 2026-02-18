"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createAccount } from "@/app/actions/accounts";
import { useToast } from "@/components/ui/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DialogDescription } from "@radix-ui/react-dialog";

const schema = z.object({
    name: z.string().min(1, "Nome é obrigatório"),
    initialBalance: z.coerce.number().default(0),
    type: z.string().default("checking"),
    isCreditCard: z.boolean().default(false),
    creditLimit: z.coerce.number().optional(),
    closingDay: z.coerce.number().min(1).max(31).optional(),
    dueDay: z.coerce.number().min(1).max(31).optional(),
});

export function CreateAccountDialog({
    open,
    onOpenChange,
    onSuccess,
    defaultType,
    defaultOpen,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
    defaultType?: string;
    defaultOpen?: boolean;
}) {
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    // If defaultOpen is provided, we might need to sync it with parent state or just let the parent control 'open'.
    // In this component, 'open' is controlled by parent. 'defaultOpen' is less useful unless we have internal state.
    // The previous implementation had 'open' as prop. We keep it that way.
    // However, if we want to auto-open, the parent responsible for passing 'open=true'.
    // We will just leave standard init.

    const form = useForm<z.infer<typeof schema>>({
        resolver: zodResolver(schema),
        defaultValues: {
            name: "",
            initialBalance: 0,
            type: defaultType || "checking",
            isCreditCard: defaultType === "credit_card"
        }
    });

    const isCreditCard = form.watch("isCreditCard");
    const accountType = form.watch("type");

    // Auto-check "isCreditCard" if type is "credit_card" (if user selects explicitly)
    // Or we handle logic below.

    async function onSubmit(data: z.infer<typeof schema>) {
        setLoading(true);

        const result = await createAccount({
            name: data.name,
            initial_balance: data.initialBalance,
            type: data.type,
            is_credit_card: data.isCreditCard,
            credit_limit: data.creditLimit,
            closing_day: data.closingDay,
            due_day: data.dueDay
        });

        if (result.error) {
            toast({ variant: "destructive", title: "Erro", description: result.error });
        } else {
            toast({ title: "Conta criada!" });
            onSuccess();
            onOpenChange(false);
            form.reset();
        }
        setLoading(false);
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Nova Conta / Cartão</DialogTitle>
                    <DialogDescription>
                        Preencha os dados da sua nova conta ou cartão de crédito.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Nome</Label>
                        <Input {...form.register("name")} placeholder="Ex: Nubank" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Saldo Inicial</Label>
                            <CurrencyInput
                                value={form.watch("initialBalance") || 0}
                                onChange={(val) => form.setValue("initialBalance", Number(val))}
                                placeholder="R$ 0,00"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Tipo</Label>
                            <Select
                                value={form.watch("type")}
                                onValueChange={(val) => {
                                    form.setValue("type", val);
                                    if (val === "credit_card") form.setValue("isCreditCard", true);
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="checking">Corrente</SelectItem>
                                    <SelectItem value="savings">Poupança</SelectItem>
                                    <SelectItem value="investment">Investimento</SelectItem>
                                    <SelectItem value="cash">Dinheiro</SelectItem>
                                    <SelectItem value="credit_card">Cartão de Crédito</SelectItem>
                                    <SelectItem value="other">Outro</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id="isCreditCard"
                            checked={form.watch("isCreditCard")}
                            onCheckedChange={(c) => form.setValue("isCreditCard", !!c)}
                        />
                        <Label htmlFor="isCreditCard">É um Cartão de Crédito?</Label>
                    </div>

                    {isCreditCard && (
                        <div className="space-y-4 rounded-md border p-3 bg-muted/20">
                            <div className="space-y-2">
                                <Label>Limite do Cartão</Label>
                                <CurrencyInput
                                    value={form.watch("creditLimit") || 0}
                                    onChange={(val) => form.setValue("creditLimit", Number(val))}
                                    placeholder="R$ 0,00"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Dia Fechamento</Label>
                                    <Input type="number" min="1" max="31" {...form.register("closingDay")} placeholder="Ex: 5" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Dia Vencimento</Label>
                                    <Input type="number" min="1" max="31" {...form.register("dueDay")} placeholder="Ex: 12" />
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="submit" disabled={loading}>{loading ? "Criando..." : "Criar"}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
