"use client";

import { useState, useEffect } from "react";
import { getIncomeTaxData, IRData } from "@/app/actions/ir-helper";
import { IncomeTaxReport } from "../_components/income-tax-report";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Printer } from "lucide-react";

export default function IncomeTaxPage() {
    const currentYear = new Date().getFullYear();
    const [year, setYear] = useState<string>((currentYear - 1).toString());
    const [data, setData] = useState<IRData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, [year]);

    async function fetchData() {
        setLoading(true);
        const res = await getIncomeTaxData(parseInt(year));
        if (res.data) {
            setData(res.data);
        }
        setLoading(false);
    }

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-6 container mx-auto py-6 max-w-4xl">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
                <div>
                    <h1 className="text-3xl font-display">Auxiliar de Imposto de Renda</h1>
                    <p className="text-muted-foreground">Selecione o ano base para gerar o relatório.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={year} onValueChange={setYear}>
                        <SelectTrigger className="w-[120px]">
                            <SelectValue placeholder="Ano" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={(currentYear).toString()}>{currentYear}</SelectItem>
                            <SelectItem value={(currentYear - 1).toString()}>{currentYear - 1}</SelectItem>
                            <SelectItem value={(currentYear - 2).toString()}>{currentYear - 2}</SelectItem>
                            <SelectItem value={(currentYear - 3).toString()}>{currentYear - 3}</SelectItem>
                        </SelectContent>
                    </Select>

                    <Button variant="outline" onClick={handlePrint} className="gap-2">
                        <Printer className="h-4 w-4" />
                        Imprimir / PDF
                    </Button>
                </div>
            </div>

            <div className="bg-card border rounded-xl p-8 shadow-sm print:shadow-none print:border-none print:p-0">
                {loading ? (
                    <div className="flex h-[400px] items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : data ? (
                    <IncomeTaxReport data={data} />
                ) : (
                    <div className="text-center py-12 text-muted-foreground">
                        Não foi possível carregar os dados.
                    </div>
                )}
            </div>
        </div>
    );
}
