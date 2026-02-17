"use client";

import * as React from "react";
import { useFilter } from "@/contexts/filter-context";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Calendar as CalendarIcon, Filter } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function GlobalFilter() {
    const { preset, setPreset, dateRange, setDateRange } = useFilter();

    return (
        <div className="flex items-center gap-2">
            <Select value={preset} onValueChange={(val: any) => setPreset(val)}>
                <SelectTrigger className="w-[140px] h-9 text-xs">
                    <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="month">Este Mês</SelectItem>
                    <SelectItem value="last_month">Mês Passado</SelectItem>
                    <SelectItem value="7d">Últimos 7 dias</SelectItem>
                    <SelectItem value="30d">Últimos 30 dias</SelectItem>
                    <SelectItem value="90d">Últimos 90 dias</SelectItem>
                    <SelectItem value="ytd">Ano Atual (YTD)</SelectItem>
                    <SelectItem value="year">Últimos 12 meses</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
            </Select>

            {preset === "custom" && (
                <DateRangePicker
                    date={dateRange}
                    setDate={(range) => {
                        if (range) {
                            setDateRange({ from: range.from, to: range.to });
                        }
                    }}
                    className="h-9"
                />
            )}
        </div>
    );
}
