"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TransactionForm, type QuickSaveResult } from "./transaction-form";
import type { QuickTransactionDraft } from "@/lib/quick-launch";

export function TransactionModal({
  open,
  onOpenChange,
  initialDraft,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDraft?: QuickTransactionDraft | null;
  onSaved?: (result: QuickSaveResult) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Lancamento rapido</DialogTitle>
          <DialogDescription>
            Valor primeiro, sugestoes automaticas e salvar em segundos.
          </DialogDescription>
        </DialogHeader>
        <TransactionForm
          initialDraft={initialDraft}
          onSuccess={(result) => {
            onSaved?.(result);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

