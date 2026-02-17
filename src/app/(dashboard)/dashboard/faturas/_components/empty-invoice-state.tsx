"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CreateAccountDialog } from "../../cadastros/_components/create-account-dialog";
import { PlusCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export function EmptyInvoiceState() {
    const [open, setOpen] = useState(false);
    const router = useRouter();

    return (
        <div className="space-y-6">
            <h1 className="font-display text-3xl">Faturas</h1>
            <Card className="border-dashed border-2">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-4">
                    <p>Nenhum cartão de crédito ativo encontrado.</p>
                    <p className="text-sm max-w-sm">
                        Cadastre seu primeiro cartão para começar a controlar suas faturas e limites em um só lugar.
                    </p>
                    <Button onClick={() => setOpen(true)} className="gap-2">
                        <PlusCircle className="h-4 w-4" />
                        Cadastrar Cartão
                    </Button>
                </CardContent>
            </Card>

            <CreateAccountDialog
                open={open}
                onOpenChange={setOpen}
                onSuccess={() => router.refresh()}
                defaultType="credit_card"
            />
        </div>
    );
}
