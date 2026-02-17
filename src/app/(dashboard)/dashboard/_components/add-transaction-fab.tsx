"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TransactionModal } from "../lancamentos/_components/transaction-modal";
import { createClient } from "@/lib/supabase/client";
import type { QuickTransactionDraft } from "@/lib/quick-launch";
import type { QuickSaveResult } from "../lancamentos/_components/transaction-form";
import { trackQuickDropoff, trackQuickOpen, trackQuickSave } from "@/lib/quick-log-metrics";

interface UndoState {
  ids: string[];
  orgId: string;
}

export function AddTransactionFAB() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<QuickTransactionDraft | null>(null);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const sessionRef = useRef<{ openedAt: number; saved: boolean } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const customEvent = event as CustomEvent<{ draft?: QuickTransactionDraft }>;
      setDraft(customEvent.detail?.draft ?? null);
      setOpen(true);
    };

    window.addEventListener("financeiro:open-transaction", handleOpen);
    return () => window.removeEventListener("financeiro:open-transaction", handleOpen);
  }, []);

  useEffect(() => {
    if (open) {
      sessionRef.current = { openedAt: Date.now(), saved: false };
      trackQuickOpen();
      return;
    }

    if (sessionRef.current && !sessionRef.current.saved) {
      trackQuickDropoff();
    }
    sessionRef.current = null;
    setDraft(null);
  }, [open]);

  async function handleUndo() {
    if (!undoState) return;

    const { error } = await supabase
      .from("transactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("org_id", undoState.orgId)
      .in("id", undoState.ids);

    if (error) {
      alert("Nao foi possivel desfazer.");
      return;
    }

    setUndoState(null);
    router.refresh();
  }

  function handleSaved(result: QuickSaveResult) {
    if (sessionRef.current) sessionRef.current.saved = true;

    trackQuickSave({
      ttlMs: result.ttlMs,
      clicks: result.clicks,
      autoCategorized: result.autoCategorized,
      manualCategoryCorrection: result.manualCategoryCorrection,
    });

    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (result.insertedIds.length > 0) {
      setUndoState({ ids: result.insertedIds, orgId: result.orgId });
      undoTimerRef.current = setTimeout(() => setUndoState(null), 10000);
    }

    router.refresh();
  }

  return (
    <>
      <Button
        size="icon"
        className="fixed bottom-20 right-4 z-50 h-14 w-14 rounded-full shadow-lg md:bottom-6 md:right-6 md:h-12 md:w-12"
        onClick={() => setOpen(true)}
        aria-label="Adicionar lancamento"
      >
        <Plus className="h-6 w-6 md:h-5 md:w-5" />
      </Button>

      <TransactionModal open={open} onOpenChange={setOpen} initialDraft={draft} onSaved={handleSaved} />

      {undoState && (
        <div className="fixed bottom-36 right-4 z-50 w-[280px] rounded-lg border border-stroke bg-surface p-3 shadow-lg md:bottom-20 md:right-6">
          <p className="text-sm font-medium text-ink">Lancamento salvo.</p>
          <p className="text-xs text-ink/70">Voce pode desfazer por alguns segundos.</p>
          <div className="mt-2 flex justify-end">
            <Button type="button" size="sm" variant="outline" onClick={handleUndo}>
              Desfazer
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

