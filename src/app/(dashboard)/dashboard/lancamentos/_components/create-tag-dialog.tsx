"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { useFinancialData } from "@/hooks/use-financial-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

const schema = z.object({
    name: z.string().min(1, "Nome é obrigatório"),
});

type FormValues = z.infer<typeof schema>;

export function CreateTagDialog({
    open,
    onOpenChange,
    onSuccess,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: (id: string) => void;
}) {
    const [loading, setLoading] = useState(false);
    const { refetch } = useFinancialData();
    const supabase = createClient();

    const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
        resolver: zodResolver(schema),
    });

    async function onSubmit(data: FormValues) {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Usuário não autenticado");

            // Get org_id (assuming first org for now)
            const { data: members } = await supabase.from("org_members").select("org_id").eq("user_id", user.id).limit(1);
            const orgId = members?.[0]?.org_id;

            if (!orgId) throw new Error("Organização não encontrada");

            const { data: tag, error } = await supabase
                .from("tags")
                .insert({
                    org_id: orgId,
                    name: data.name,
                })
                .select()
                .single();

            if (error) throw error;

            refetch();
            reset();
            onOpenChange(false);
            if (onSuccess && tag) onSuccess(tag.id);
        } catch (error) {
            console.error(error);
            alert("Erro ao criar tag");
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Nova Tag</DialogTitle>
                    <DialogDescription>
                        Crie uma tag para organizar suas transações.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Nome</Label>
                        <Input placeholder="Ex: Viagem, Reforma, Importante" {...register("name")} />
                        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                    </div>

                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? "Criando..." : "Criar Tag"}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
