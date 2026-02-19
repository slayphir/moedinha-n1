"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/components/ui/use-toast";
import { updateOrganization } from "@/app/actions/settings";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

const formSchema = z.object({
    name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres."),
    balanceStartMonth: z
        .string()
        .trim()
        .refine((value) => value === "" || /^\d{4}-\d{2}$/.test(value), "Informe um mes valido (AAAA-MM)."),
});

interface Props {
    initialName: string;
    initialBalanceStartDate?: string | null;
    orgId: string;
}

function toMonthInputValue(value?: string | null) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    return value.slice(0, 7);
}

export function OrgSettingsForm({ initialName, initialBalanceStartDate, orgId }: Props) {
    const { toast } = useToast();
    const router = useRouter();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: initialName,
            balanceStartMonth: toMonthInputValue(initialBalanceStartDate),
        },
    });

    const { isSubmitting } = form.formState;

    async function onSubmit(values: z.infer<typeof formSchema>) {
        const normalizedMonth = values.balanceStartMonth.trim();
        const balanceStartDate = normalizedMonth ? `${normalizedMonth}-01` : null;
        const result = await updateOrganization(orgId, values.name, balanceStartDate);

        if (result.error) {
            toast({
                variant: "destructive",
                title: "Erro ao atualizar",
                description: result.error,
            });
        } else {
            toast({
                title: "Sucesso",
                description: "Dados da organizacao atualizados.",
            });
            router.refresh();
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-w-md">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nome da Organizacao</FormLabel>
                            <FormControl>
                                <Input placeholder="Minha Empresa S.A." {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="balanceStartMonth"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Inicio do saldo (mes)</FormLabel>
                            <FormControl>
                                <Input type="month" {...field} />
                            </FormControl>
                            <FormDescription>
                                O card de saldo considera apenas lancamentos quitados a partir deste mes.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar alteracoes
                </Button>
            </form>
        </Form>
    );
}
