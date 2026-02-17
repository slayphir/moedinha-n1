"use client";

import { useState, useEffect } from "react";
import { FinancialCalendar } from "./_components/financial-calendar";
import { getMonthFinancialEvents, CalendarDayData } from "@/app/actions/calendar";
import { Loader2 } from "lucide-react";

export default function CalendarPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState<CalendarDayData[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchEvents(currentDate);
    }, [currentDate]);

    async function fetchEvents(date: Date) {
        setLoading(true);
        const year = date.getFullYear();
        const month = date.getMonth(); // 0-indexed
        const res = await getMonthFinancialEvents(year, month);
        if (res.data) {
            setEvents(res.data);
        }
        setLoading(false);
    }

    const handleMonthChange = (date: Date) => {
        setCurrentDate(date);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-display">Calendário Financeiro</h1>
                    <p className="text-muted-foreground">Visualize suas receitas e despesas ao longo do mês.</p>
                </div>
            </div>

            <div className="rounded-xl border bg-card text-card-foreground shadow">
                <div className="p-6">
                    {loading ? (
                        <div className="flex h-[400px] items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <FinancialCalendar
                            initialData={events}
                            currentDate={currentDate}
                            onMonthChange={handleMonthChange}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
