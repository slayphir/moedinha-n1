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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Contact } from "@/hooks/use-financial-data";

const schema = z.object({
    name: z.string().min(1, "Nome é obrigatório"),
    phone: z.string().optional().or(z.literal("")),
    email: z.string().email("Email inválido").optional().or(z.literal("")),
    relationship: z.string().optional(),
});

export function EditContactDialog({
    open,
    onOpenChange,
    contact,
    onSuccess
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contact: Contact | null;
    onSuccess: () => void;
}) {
    const [loading, setLoading] = useState(false);
    const supabase = createClient();

    const form = useForm<z.infer<typeof schema>>({
        resolver: zodResolver(schema),
        defaultValues: { name: "", phone: "", email: "", relationship: "client" }
    });

    useEffect(() => {
        if (contact) {
            form.reset({
                name: contact.name,
                phone: contact.phone || "",
                email: contact.email || "",
                relationship: contact.relationship || "client"
            });
        }
    }, [contact, form]);

    async function onSubmit(data: z.infer<typeof schema>) {
        if (!contact) return;
        setLoading(true);
        try {
            const { error } = await supabase
                .from("contacts")
                .update({
                    name: data.name,
                    phone: data.phone || null,
                    email: data.email || null,
                    relationship: data.relationship || null,
                })
                .eq("id", contact.id);

            if (error) throw error;

            onSuccess();
            onOpenChange(false);
        } catch (e) {
            console.error(e);
            alert("Erro ao atualizar contato");
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Editar Contato</DialogTitle>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Nome</Label>
                        <Input {...form.register("name")} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Telefone</Label>
                            <Input {...form.register("phone")} />
                        </div>
                        <div className="space-y-2">
                            <Label>Email</Label>
                            <Input {...form.register("email")} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Tipo de Relacionamento</Label>
                        <Select
                            value={form.watch("relationship")}
                            onValueChange={(val) => form.setValue("relationship", val)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="client">Cliente</SelectItem>
                                <SelectItem value="provider">Fornecedor</SelectItem>
                                <SelectItem value="family">Família</SelectItem>
                                <SelectItem value="friend">Amigo</SelectItem>
                                <SelectItem value="other">Outro</SelectItem>
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
