"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/utils";
import { payInvoice } from "@/app/actions/invoices";

type PayInvoiceButtonProps = {
  accountId: string;
  invoiceMonth: string;
  pendingAmount: number;
  pendingCount: number;
};

export function PayInvoiceButton({
  accountId,
  invoiceMonth,
  pendingAmount,
  pendingCount,
}: PayInvoiceButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const hasPending = pendingCount > 0 && pendingAmount > 0;

  const handlePayInvoice = async () => {
    if (!hasPending || loading) return;

    const confirmPay = window.confirm(
      `Confirmar pagamento da fatura ${invoiceMonth}?\n\nSerao quitados ${pendingCount} lancamento(s), total ${formatCurrency(-Math.abs(pendingAmount))}.`
    );
    if (!confirmPay) return;

    setLoading(true);
    try {
      const result = await payInvoice(accountId, invoiceMonth);

      if (result.error) {
        toast({
          variant: "destructive",
          title: "Erro ao pagar fatura",
          description: result.error,
        });
        return;
      }

      const updatedCount = result.data?.updatedCount ?? 0;
      const paidAmount = result.data?.paidAmount ?? 0;

      if (updatedCount === 0) {
        toast({
          title: "Nenhum pendente encontrado",
          description: "Nao havia lancamentos pendentes nesta fatura.",
        });
      } else {
        toast({
          title: "Fatura paga",
          description: `${updatedCount} lancamento(s) consolidados e quitados (${formatCurrency(-Math.abs(paidAmount))}).`,
        });
      }

      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha inesperada ao pagar fatura";
      toast({
        variant: "destructive",
        title: "Erro ao pagar fatura",
        description: message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      onClick={handlePayInvoice}
      disabled={!hasPending || loading}
      className="h-9"
    >
      {loading ? "Pagando..." : hasPending ? "Pagar fatura" : "Fatura quitada"}
    </Button>
  );
}
