"use client";

import { useEffect, useState } from "react";
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
});

export function EditTagDialog({
    open,
    onOpenChange,
    tag
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tag: { id: string; name: string } | null;
}) {
    const [loading, setLoading] = useState(false);
    const supabase = createClient();
    const { refetch } = useFinancialData();

    const form = useForm<z.infer<typeof schema>>({
        resolver: zodResolver(schema),
        defaultValues: { name: "" }
    });

    useEffect(() => {
        if (tag) {
            form.reset({ name: tag.name });
        }
    }, [tag, form]);

    async function onSubmit(data: z.infer<typeof schema>) {
        if (!tag) return;
        setLoading(true);
        try {
            const { error } = await supabase
                .from("tags")
                .update({ name: data.name })
                .eq("id", tag.id);

            if (error) throw error;

            await refetch();
            onOpenChange(false);
        } catch (e) {
            console.error(e);
            alert("Erro ao atualizar tag");
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Editar Tag</DialogTitle>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Nome</Label>
                        <Input {...form.register("name")} />
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
