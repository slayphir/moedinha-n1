"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { CalendarIcon, Loader2, Plus, Target, Pencil } from "lucide-react";
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
import { createGoal, updateGoal, Goal } from "@/app/actions/goals";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";

const goalSchema = z.object({
    name: z.string().min(3, "Nome muito curto"),
    type: z.enum(["savings", "emergency_fund", "debt", "reduction", "purchase", "piggy_bank"]),
    target_amount: z.coerce.number().min(0.01, "Valor invÃ¡lido"),
    target_date: z.date({ required_error: "Prazo Ã© obrigatÃ³rio" }),
    current_amount: z.coerce.number().default(0),
    strategy: z.enum(["bucket_fraction", "month_leftover", "fixed_amount", "manual"]),
});

type FormValues = z.infer<typeof goalSchema>;

interface Props {
    goal?: Goal;
    trigger?: React.ReactNode;
}

export function GoalWizard({ goal, trigger }: Props) {
    const [open, setOpen] = useState(false);
    const { toast } = useToast();
    const isEditing = !!goal;

    const form = useForm<FormValues>({
        resolver: zodResolver(goalSchema),
        defaultValues: {
            name: "",
            type: "purchase",
            target_amount: 0,
            current_amount: 0,
            strategy: "manual",
        },
    });

    // Reset form when opening or changing goal
    useEffect(() => {
        if (open) {
            if (goal) {
                form.reset({
                    name: goal.name,
                    type: goal.type,
                    target_amount: goal.target_amount || 0,
                    current_amount: goal.current_amount || 0,
                    target_date: goal.target_date ? new Date(goal.target_date) : new Date(),
                    strategy: goal.strategy,
                });
            } else {
                form.reset({
                    name: "",
                    type: "purchase",
                    target_amount: 0,
                    current_amount: 0,
                    strategy: "manual",
                    target_date: undefined,
                });
            }
        }
    }, [open, goal, form]);

    const { isSubmitting } = form.formState;

    async function onSubmit(data: FormValues) {
        const payload = {
            ...data,
            target_date: format(data.target_date, "yyyy-MM-dd"),
        };

        let result;
        if (isEditing && goal) {
            result = await updateGoal({ id: goal.id, ...payload });
        } else {
            result = await createGoal(payload);
        }

        if (result.error) {
            toast({
                variant: "destructive",
                title: isEditing ? "Erro ao atualizar" : "Erro ao criar meta",
                description: result.error,
            });
        } else {
            toast({
                title: isEditing ? "Meta atualizada!" : "Meta criada!",
                description: isEditing ? "As alteraÃ§Ãµes foram salvas." : "Vamos trabalhar para alcanÃ§Ã¡-la.",
            });
            setOpen(false);
            if (!isEditing) form.reset();
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button className="gap-2">
                        <Plus className="h-4 w-4" />
                        Nova Meta
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{isEditing ? "Editar Meta" : "Criar Nova Meta"}</DialogTitle>
                    <DialogDescription>
                        {isEditing ? "Atualize os detalhes do seu objetivo." : "Defina seu objetivo e como planeja alcanÃ§Ã¡-lo."}
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Nome da Meta</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ex: Viagem JapÃ£o, Reserva..." {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="type"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Tipo</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="piggy_bank">Cofrinho</SelectItem>
                                                <SelectItem value="purchase">Compra / Sonho</SelectItem>
                                                <SelectItem value="savings">Investimento</SelectItem>
                                                <SelectItem value="debt">Quitar DÃ­vida</SelectItem>
                                                <SelectItem value="reduction">ReduÃ§Ã£o de Gastos</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="target_amount"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Valor Alvo (R$)</FormLabel>
                                        <FormControl>
                                            <Input type="number" step="0.01" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="current_amount"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>JÃ¡ guardado (R$)</FormLabel>
                                        <FormControl>
                                            <Input type="number" step="0.01" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="target_date"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel>Prazo</FormLabel>
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
                                                    disabled={(date) =>
                                                        date < new Date(1900, 0, 1)
                                                    }
                                                    initialFocus
                                                />
                                            </PopoverContent>
                                        </Popover>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="strategy"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>EstratÃ©gia de Funding</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecione" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="manual">Aportes Manuais</SelectItem>
                                            <SelectItem value="fixed_amount">Valor Fixo Mensal</SelectItem>
                                            <SelectItem value="month_leftover">Sobras do MÃªs</SelectItem>
                                            <SelectItem value="bucket_fraction">Bucket Metas (20%)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <Button type="submit" className="w-full" disabled={isSubmitting}>
                            {isSubmitting ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : isEditing ? (
                                <Pencil className="mr-2 h-4 w-4" />
                            ) : (
                                <Target className="mr-2 h-4 w-4" />
                            )}
                            {isEditing ? "Salvar AlteraÃ§Ãµes" : "Criar Meta"}
                        </Button>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}

