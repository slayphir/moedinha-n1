"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

export function EmbedDashboard({ orgId }: { orgId: string }) {
  const [kpis, setKpis] = useState<{
    saldo_orbita?: number;
    receitas_mes?: number;
    despesas_mes?: number;
    resultado_mes?: number;
  } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ org_id: orgId });
    const t = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") : null;
    if (t) params.set("token", t);
    fetch(`/api/kpis?${params}`)
      .then((r) => r.json())
      .then((d) => setKpis(d))
      .catch(() => setKpis(null));
  }, [orgId]);

  if (!kpis) {
    return <p className="text-muted-foreground">Carregando...</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Saldo em Órbita</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{formatCurrency(kpis.saldo_orbita ?? 0)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Receitas (mês)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(kpis.receitas_mes ?? 0)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Despesas (mês)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(kpis.despesas_mes ?? 0)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Resultado (mês)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`text-2xl font-bold ${(kpis.resultado_mes ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
            {formatCurrency(kpis.resultado_mes ?? 0)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
