"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/components/ui/use-toast";
import { updateUserProfile } from "@/app/actions/settings";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

const formSchema = z.object({
    name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres."),
});

interface Props {
    initialName: string;
    email: string;
}

export function ProfileSettingsForm({ initialName, email }: Props) {
    const { toast } = useToast();
    const router = useRouter();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: initialName,
        },
    });

    const { isSubmitting } = form.formState;

    async function onSubmit(values: z.infer<typeof formSchema>) {
        const result = await updateUserProfile(values.name);

        if (result.error) {
            toast({
                variant: "destructive",
                title: "Erro ao atualizar",
                description: result.error,
            });
        } else {
            toast({
                title: "Sucesso",
                description: "Seu perfil foi atualizado.",
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
                            <FormLabel>Seu Nome</FormLabel>
                            <FormControl>
                                <Input placeholder="Seu Nome" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="space-y-2">
                    <FormLabel>Email</FormLabel>
                    <Input value={email} disabled className="bg-muted" />
                    <p className="text-xs text-muted-foreground">O email não pode ser alterado.</p>
                </div>

                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar Perfil
                </Button>
            </form>
        </Form>
    );
}
