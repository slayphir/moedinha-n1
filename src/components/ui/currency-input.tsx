"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import React, { useEffect, useState } from "react";

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
    value: string | number;
    onChange: (value: string) => void;
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
    ({ value, onChange, className, ...props }, ref) => {
        const [displayValue, setDisplayValue] = useState("");

        // Formata o valor inicial ou atualizações externas
        useEffect(() => {
            if (!value) {
                setDisplayValue("");
                return;
            }
            const numberValue = typeof value === "string" ? parseFloat(value) : value;
            if (!isNaN(numberValue)) {
                // Se for um número válido, formata
                setDisplayValue(formatMoney(numberValue));
            }
        }, [value]);

        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const rawValue = e.target.value.replace(/\D/g, ""); // Remove tudo que não é dígito

            // Se vazio, limpa
            if (!rawValue) {
                setDisplayValue("");
                onChange("");
                return;
            }

            // Converte para decimal (ex: 1234 -> 12.34)
            const amount = parseFloat(rawValue) / 100;

            // Atualiza display formatado
            setDisplayValue(formatMoney(amount));

            // Retorna o valor numérico como string para o pai (compatível com input number)
            onChange(amount.toString());
        };

        const formatMoney = (value: number) => {
            return value.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
            });
        };

        return (
            <Input
                {...props}
                ref={ref}
                type="text"
                inputMode="numeric"
                value={displayValue}
                onChange={handleChange}
                className={cn("font-mono", className)}
                placeholder="R$ 0,00"
            />
        );
    }
);

CurrencyInput.displayName = "CurrencyInput";
