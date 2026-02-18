"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFinancialData } from "@/hooks/use-financial-data";

const schema = z.object({
    name: z.string().min(1, "Nome é obrigatório"),
    type: z.enum(["income", "expense", "transfer"]),
});

export function EditCategoryDialog({
    open,
    onOpenChange,
    category
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    category: { id: string; name: string; type: string } | null;
}) {
    const [loading, setLoading] = useState(false);
    const supabase = createClient();
    const { refetch } = useFinancialData();

    const form = useForm<z.infer<typeof schema>>({
        resolver: zodResolver(schema),
        defaultValues: { name: "", type: "expense" }
    });

    useEffect(() => {
        if (category) {
            form.reset({
                name: category.name,
                type: category.type as "income" | "expense" | "transfer"
            });
        }
    }, [category, form]);

    async function onSubmit(data: z.infer<typeof schema>) {
        if (!category) return;
        setLoading(true);
        try {
            const { error } = await supabase
                .from("categories")
                .update({
                    name: data.name,
                    type: data.type,
                })
                .eq("id", category.id);

            if (error) throw error;

            await refetch();
            onOpenChange(false);
        } catch (e) {
            console.error(e);
            alert("Erro ao atualizar categoria");
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Editar Categoria</DialogTitle>
                    <DialogDescription>
                        Edite o nome ou tipo da categoria.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Nome</Label>
                        <Input {...form.register("name")} />
                    </div>
                    <div className="space-y-2">
                        <Label>Tipo</Label>
                        <Select
                            value={form.watch("type")}
                            onValueChange={(value: "income" | "expense" | "transfer") => form.setValue("type", value)}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="income">Receita</SelectItem>
                                <SelectItem value="expense">Despesa</SelectItem>
                                <SelectItem value="transfer">Transferência</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
