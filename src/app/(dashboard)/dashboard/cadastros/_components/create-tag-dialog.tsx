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

const schema = z.object({
    name: z.string().min(1, "Nome é obrigatório"),
});

export function CreateTagDialog({ open, onOpenChange, onSuccess }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}) {
    const [loading, setLoading] = useState(false);
    const supabase = createClient();

    const form = useForm<z.infer<typeof schema>>({
        resolver: zodResolver(schema),
        defaultValues: { name: "" }
    });

    async function onSubmit(data: z.infer<typeof schema>) {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("No user");

            const { data: members } = await supabase.from("org_members").select("org_id").eq("user_id", user.id).limit(1);
            const orgId = members?.[0]?.org_id;
            if (!orgId) throw new Error("No organization found");

            const { error } = await supabase
                .from("tags")
                .insert({
                    name: data.name,
                    org_id: orgId
                });

            if (error) throw error;

            onSuccess();
            onOpenChange(false);
            form.reset();
        } catch (e) {
            console.error(e);
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
                </DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Nome</Label>
                        <Input {...form.register("name")} placeholder="Ex: Viagem" />
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={loading}>{loading ? "Criando..." : "Criar"}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
