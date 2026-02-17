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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const schema = z.object({
    name: z.string().min(1, "Nome é obrigatório"),
    phone: z.string().optional(),
    email: z.string().email("Email inválido").optional().or(z.literal("")),
    relationship: z.string().optional(),
});

export function CreateContactDialog({ open, onOpenChange, onSuccess }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (id: string) => void;
}) {
    const [loading, setLoading] = useState(false);
    const supabase = createClient();
    // note: useFinancialData needs to be updated to fetch contacts, for now we will just re-fetch manually or rely on parent

    const form = useForm<z.infer<typeof schema>>({
        resolver: zodResolver(schema),
        defaultValues: { name: "", phone: "", email: "", relationship: "client" }
    });

    async function onSubmit(data: z.infer<typeof schema>) {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("No user");

            const { data: members } = await supabase.from("org_members").select("org_id").eq("user_id", user.id).limit(1);
            const orgId = members?.[0]?.org_id;
            if (!orgId) throw new Error("No organization found");

            const { data: newContact, error } = await supabase
                .from("contacts")
                .insert({
                    name: data.name,
                    phone: data.phone || null,
                    email: data.email || null,
                    relationship: data.relationship || null,
                    org_id: orgId
                })
                .select("id")
                .single();

            if (error) throw error;

            onSuccess(newContact.id);
            onOpenChange(false);
            form.reset();
        } catch (e) {
            console.error(e);
            alert("Erro ao criar contato");
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Novo Contato (Credor/Devedor)</DialogTitle>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Nome</Label>
                        <Input {...form.register("name")} placeholder="Ex: João da Silva" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Telefone</Label>
                            <Input {...form.register("phone")} placeholder="(11) 99999-9999" />
                        </div>
                        <div className="space-y-2">
                            <Label>Email</Label>
                            <Input {...form.register("email")} placeholder="joao@email.com" />
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
                        <Button type="submit" disabled={loading}>{loading ? "Criando..." : "Criar"}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
