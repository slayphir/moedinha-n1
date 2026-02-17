"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { CalendarIcon, Loader2, Plus, Repeat, Wallet } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { createRecurringRule, updateRecurringRule, CreateRecurringRuleInput } from "@/app/actions/recurring"; // Need to create these
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { useFinancialData } from "@/hooks/use-financial-data";
import { RecurringRule } from "@/lib/types/database";

const ruleSchema = z.object({
    description: z.string().min(3, "Descrição muito curta"),
    amount: z.coerce.number().min(0.01, "Valor inválido"),
    account_id: z.string().min(1, "Conta obrigatória"),
    category_id: z.string().optional(),
    frequency: z.enum(["weekly", "monthly", "yearly"]),
    start_date: z.date({ required_error: "Início é obrigatório" }),
});

type FormValues = z.infer<typeof ruleSchema>;

interface Props {
    rule?: RecurringRule;
    trigger?: React.ReactNode;
    onSuccess?: () => void;
}

export function RecurringRuleDialog({ rule, trigger, onSuccess }: Props) {
    const [open, setOpen] = useState(false);
    const { toast } = useToast();
    const { accounts, categories } = useFinancialData();
    const isEditing = !!rule;

    const form = useForm<FormValues>({
        resolver: zodResolver(ruleSchema),
        defaultValues: {
            description: "",
            amount: 0,
            frequency: "monthly",
            account_id: "",
        },
    });

    useEffect(() => {
        if (open) {
            if (rule) {
                form.reset({
                    description: rule.description,
                    amount: rule.amount,
                    account_id: rule.account_id,
                    category_id: rule.category_id || undefined,
                    frequency: rule.frequency,
                    start_date: new Date(rule.start_date),
                });
            } else {
                form.reset({
                    description: "",
                    amount: 0,
                    frequency: "monthly",
                    account_id: accounts[0]?.id || "",
                    start_date: new Date(),
                });
            }
        }
    }, [open, rule, form, accounts]);

    const { isSubmitting } = form.formState;

    async function onSubmit(data: FormValues) {
        const payload: CreateRecurringRuleInput = {
            ...data,
            start_date: format(data.start_date, "yyyy-MM-dd"),
            category_id: data.category_id || undefined,
        };

        let result;
        if (isEditing && rule) {
            result = await updateRecurringRule(rule.id, payload);
        } else {
            result = await createRecurringRule(payload);
        }

        if (result.error) {
            toast({
                variant: "destructive",
                title: isEditing ? "Erro ao atualizar" : "Erro ao criar",
                description: result.error,
            });
        } else {
            toast({
                title: isEditing ? "Assinatura atualizada!" : "Assinatura criada!",
                description: isEditing ? "As alterações foram salvas." : "Acompanharemos este gasto recorrente.",
            });
            setOpen(false);
            if (!isEditing) form.reset();
            onSuccess?.();
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button className="gap-2">
                        <Plus className="h-4 w-4" />
                        Nova Assinatura
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{isEditing ? "Editar Assinatura" : "Nova Assinatura"}</DialogTitle>
                    <DialogDescription>
                        {isEditing ? "Atualize os detalhes da recorrência." : "Cadastre uma conta fixa ou assinatura."}
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Descrição</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ex: Netflix, Aluguel, Academia..." {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="amount"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Valor (R$)</FormLabel>
                                        <FormControl>
                                            <Input type="number" step="0.01" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="frequency"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Frequência</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="weekly">Semanal</SelectItem>
                                                <SelectItem value="monthly">Mensal</SelectItem>
                                                <SelectItem value="yearly">Anual</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="account_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Conta</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {accounts.map(acc => (
                                                    <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="category_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Categoria</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Opcional" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {categories.filter(c => c.type === 'expense').map(cat => (
                                                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="start_date"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>Próximo Vencimento / Início</FormLabel>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <FormControl>
                                                <Button
                                                    variant={"outline"}
                                                    className={cn(
                                                        "w-full pl-3 text-left font-normal",
                                                        !field.value && "text-muted-foreground"
                                                    )}
                                                >
                                                    {field.value ? (
                                                        format(field.value, "PPP", { locale: ptBR })
                                                    ) : (
                                                        <span>Escolha uma data</span>
                                                    )}
                                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                </Button>
                                            </FormControl>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar
                                                mode="single"
                                                selected={field.value}
                                                onSelect={field.onChange}
                                                initialFocus
                                            />
                                        </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <Button type="submit" className="w-full" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Repeat className="mr-2 h-4 w-4" />}
                            {isEditing ? "Salvar Alterações" : "Criar Assinatura"}
                        </Button>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
