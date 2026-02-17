"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useFinancialData } from "@/hooks/use-financial-data";

const schema = z.object({
    name: z.string().min(1, "Nome é obrigatório"),
    initialBalance: z.coerce.number().default(0),
});

export function CreateAccountDialog({ open, onOpenChange, onSuccess }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (id: string) => void;
}) {
    const [loading, setLoading] = useState(false);
    const supabase = createClient();
    const { refetch } = useFinancialData();

    const form = useForm<z.infer<typeof schema>>({
        resolver: zodResolver(schema),
        defaultValues: { name: "", initialBalance: 0 }
    });

    async function onSubmit(data: z.infer<typeof schema>) {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("No user");

            const { data: members } = await supabase.from("org_members").select("org_id").eq("user_id", user.id).limit(1);
            const orgId = members?.[0]?.org_id;

            if (!orgId) throw new Error("No organization found");

            const { data: newAcc, error } = await supabase
                .from("accounts")
                .insert({
                    name: data.name,
                    initial_balance: data.initialBalance,
                    org_id: orgId
                })
                .select("id")
                .single();

            if (error) throw error;

            await refetch();
            onSuccess(newAcc.id);
            onOpenChange(false);
            form.reset();
        } catch (e) {
            console.error(e);
            alert("Erro ao criar conta");
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Nova Conta</DialogTitle>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Nome</Label>
                        <Input {...form.register("name")} placeholder="Ex: Banco Nu" />
                    </div>
                    <div className="space-y-2">
                        <Label>Saldo Inicial</Label>
                        <Input type="number" step="0.01" {...form.register("initialBalance")} />
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={loading}>{loading ? "Criando..." : "Criar"}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
