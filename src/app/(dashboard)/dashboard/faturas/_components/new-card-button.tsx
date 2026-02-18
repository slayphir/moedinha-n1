"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CreateAccountDialog } from "../../cadastros/_components/create-account-dialog";
import { useRouter } from "next/navigation";

export function NewCardButton() {
    const [open, setOpen] = useState(false);
    const router = useRouter();

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(true)}
                className="h-10 border-input bg-background"
            >
                <Plus className="mr-2 h-4 w-4" />
                Novo Cartao
            </Button>

            <CreateAccountDialog
                open={open}
                onOpenChange={setOpen}
                onSuccess={() => {
                    router.refresh();
                }}
                defaultType="credit_card"
            />
        </>
    );
}
