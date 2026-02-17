"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Send } from "lucide-react";
import { TelegramConfigInput, updateTelegramConfig, testTelegramIntegration } from "@/app/actions/notifications";

const formSchema = z.object({
    chat_id: z.string().min(1, "Chat ID é obrigatório"),
    is_active: z.boolean().default(true),
    daily_summary: z.boolean().default(true),
    bill_reminder: z.boolean().default(true),
});

interface TelegramSettingsFormProps {
    initialConfig?: TelegramConfigInput | null;
}

export function TelegramSettingsForm({ initialConfig }: TelegramSettingsFormProps) {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    const [isTesting, setIsTesting] = useState(false);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            chat_id: initialConfig?.chat_id || "",
            is_active: initialConfig?.is_active ?? true,
            daily_summary: initialConfig?.preferences?.daily_summary ?? true,
            bill_reminder: initialConfig?.preferences?.bill_reminder ?? true,
        },
    });

    const chat_id = form.watch("chat_id");

    function onSubmit(values: z.infer<typeof formSchema>) {
        startTransition(async () => {
            const config: TelegramConfigInput = {
                chat_id: values.chat_id,
                is_active: values.is_active,
                preferences: {
                    daily_summary: values.daily_summary,
                    bill_reminder: values.bill_reminder,
                },
            };

            const result = await updateTelegramConfig(config);

            if (result?.error) {
                toast({
                    variant: "destructive",
                    title: "Erro ao salvar",
                    description: result.error,
                });
            } else {
                toast({
                    title: "Configurações salvas",
                    description: "Notificações do Telegram atualizadas.",
                });
            }
        });
    }

    async function handleTest() {
        if (!chat_id) {
            toast({ variant: "destructive", title: "Informe o Chat ID" });
            return;
        }
        setIsTesting(true);
        const result = await testTelegramIntegration(chat_id);
        setIsTesting(false);

        if (result?.error) {
            toast({
                variant: "destructive",
                title: "Teste Falhou",
                description: result.error,
            });
        } else {
            toast({
                title: "Teste Enviado!",
                description: "Verifique seu Telegram.",
            });
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Send className="w-5 h-5 text-sky-500" />
                    Notificações Telegram
                </CardTitle>
                <CardDescription>
                    Receba resumos diários e alertas de contas a pagar diretamente no seu Telegram.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="bg-muted p-4 rounded-md mb-6 text-sm space-y-2">
                    <p className="font-semibold">Como configurar:</p>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                        <li>Abra o bot <span className="font-mono text-foreground">@MoedinhaBot</span> (ou o bot configurado) no Telegram.</li>
                        <li>Clique em <strong>Começar</strong> ou envie <span className="font-mono text-foreground">/start</span>.</li>
                        <li>O bot irá responder com seu <strong>Chat ID</strong>. Copie e cole abaixo.</li>
                    </ol>
                </div>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <div className="flex flex-col sm:flex-row gap-4 items-end">
                            <FormField
                                control={form.control}
                                name="chat_id"
                                render={({ field }) => (
                                    <FormItem className="flex-1">
                                        <FormLabel>Seu Chat ID</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Ex: 123456789" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={handleTest}
                                disabled={isTesting || !chat_id}
                            >
                                {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Testar Envio"}
                            </Button>
                        </div>

                        <div className="space-y-4">
                            <FormField
                                control={form.control}
                                name="is_active"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                        <div className="space-y-0.5">
                                            <FormLabel className="text-base">Ativar Notificações</FormLabel>
                                            <FormDescription>
                                                Habilita o envio de mensagens para este chat.
                                            </FormDescription>
                                        </div>
                                        <FormControl>
                                            <Switch
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />

                            {form.watch("is_active") && (
                                <>
                                    <FormField
                                        control={form.control}
                                        name="daily_summary"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                                <div className="space-y-0.5">
                                                    <FormLabel className="text-base">Resumo Diário</FormLabel>
                                                    <FormDescription>
                                                        Saldo atual e previsão para o fim do mês (todo dia às 08:00).
                                                    </FormDescription>
                                                </div>
                                                <FormControl>
                                                    <Switch
                                                        checked={field.value}
                                                        onCheckedChange={field.onChange}
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="bill_reminder"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                                <div className="space-y-0.5">
                                                    <FormLabel className="text-base">Lembrete de Contas</FormLabel>
                                                    <FormDescription>
                                                        Avisa sobre contas vencendo hoje ou amanhã.
                                                    </FormDescription>
                                                </div>
                                                <FormControl>
                                                    <Switch
                                                        checked={field.value}
                                                        onCheckedChange={field.onChange}
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </>
                            )}
                        </div>

                        <Button type="submit" disabled={isPending}>
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Salvar Configurações
                        </Button>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
