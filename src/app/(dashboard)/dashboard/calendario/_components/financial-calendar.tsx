"use client";

import { useState, useMemo } from "react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, MoreHorizontal, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCurrency } from "@/lib/utils";
import { CalendarDayData, CalendarEvent } from "@/app/actions/calendar";
import { cn } from "@/lib/utils";

interface FinancialCalendarProps {
    initialData: CalendarDayData[];
    currentDate: Date;
    onMonthChange: (date: Date) => void;
}

export function FinancialCalendar({ initialData, currentDate, onMonthChange }: FinancialCalendarProps) {
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const calendarDays = useMemo(() => {
        return eachDayOfInterval({ start: startDate, end: endDate });
    }, [startDate, endDate]);

    const daysDataMap = useMemo(() => {
        const map = new Map<string, CalendarDayData>();
        initialData.forEach(d => map.set(d.date, d));
        return map;
    }, [initialData]);

    const handlePrevMonth = () => onMonthChange(subMonths(currentDate, 1));
    const handleNextMonth = () => onMonthChange(addMonths(currentDate, 1));

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold capitalize text-foreground">
                    {format(currentDate, "MMMM yyyy", { locale: ptBR })}
                </h2>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={handlePrevMonth}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={handleNextMonth}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-7 gap-px rounded-lg bg-muted/20 border p-px text-sm shadow-sm">
                {/* Header Days */}
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
                    <div key={day} className="py-2 text-center font-semibold text-muted-foreground bg-background/50">
                        {day}
                    </div>
                ))}

                {/* Calendar Grid */}
                {calendarDays.map((day, dayIdx) => {
                    const dayStr = format(day, "yyyy-MM-dd");
                    const dayData = daysDataMap.get(dayStr);
                    const isCurrentMonth = isSameMonth(day, monthStart);
                    const isSelected = selectedDate && isSameDay(day, selectedDate);

                    const hasEvents = dayData && dayData.events.length > 0;
                    const balance = dayData?.balance_change ?? 0;
                    const isPositive = balance >= 0;

                    return (
                        <Popover key={day.toString()}>
                            <PopoverTrigger asChild>
                                <div
                                    onClick={() => setSelectedDate(day)}
                                    className={cn(
                                        "min-h-[100px] bg-background p-2 transition-colors hover:bg-muted/50 cursor-pointer flex flex-col justify-between group relative",
                                        !isCurrentMonth && "bg-muted/10 text-muted-foreground",
                                        isToday(day) && "ring-2 ring-primary ring-inset z-10"
                                    )}
                                >
                                    <div className="flex justify-between items-start">
                                        <span
                                            className={cn(
                                                "flex h-6 w-6 items-center justify-center rounded-full font-medium text-xs",
                                                isToday(day) ? "bg-primary text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                                            )}
                                        >
                                            {format(day, "d")}
                                        </span>
                                        {dayData && (dayData.income > 0 || dayData.expense > 0) && (
                                            <div className="text-[10px] font-bold">
                                                {balance !== 0 && (
                                                    <span className={isPositive ? "text-emerald-600" : "text-red-500"}>
                                                        {isPositive ? "+" : ""}{formatCurrency(balance)}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-1 mt-1">
                                        {dayData?.events.slice(0, 3).map((event) => (
                                            <div
                                                key={event.id}
                                                className={cn(
                                                    "truncate rounded px-1 text-[10px] font-medium border-l-2",
                                                    event.type === "income" ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" :
                                                        event.status === "projected" ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400 italic" :
                                                            "border-red-500 bg-red-500/10 text-red-700 dark:text-red-400"
                                                )}
                                            >
                                                {event.description}
                                            </div>
                                        ))}
                                        {dayData && dayData.events.length > 3 && (
                                            <div className="text-[10px] text-muted-foreground pl-1">
                                                + {dayData.events.length - 3} mais...
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 p-0" align="start">
                                <div className="p-4 border-b">
                                    <h4 className="font-semibold">{format(day, "EEEE, d 'de' MMMM", { locale: ptBR })}</h4>
                                    <div className="flex justify-between text-xs mt-2 text-muted-foreground">
                                        <span>Receitas: <span className="text-emerald-600 font-medium">{formatCurrency(dayData?.income ?? 0)}</span></span>
                                        <span>Despesas: <span className="text-red-500 font-medium">{formatCurrency(dayData?.expense ?? 0)}</span></span>
                                    </div>
                                </div>
                                <div className="max-h-[300px] overflow-y-auto p-2 space-y-1">
                                    {/* Sorted: Income first, then Expense. Paid first, then Projected. */}
                                    {dayData?.events
                                        .sort((a, b) => (a.type === b.type ? 0 : a.type === 'income' ? -1 : 1))
                                        .map((evt) => (
                                            <div key={evt.id} className="flex items-center justify-between rounded-md p-2 text-sm hover:bg-muted/50">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <div className={cn("h-2 w-2 rounded-full shrink-0",
                                                        evt.type === 'income' ? 'bg-emerald-500' :
                                                            evt.status === 'projected' ? 'bg-amber-500' : 'bg-red-500'
                                                    )} />
                                                    <span className={cn("truncate", evt.status === 'projected' && "italic text-muted-foreground")}>
                                                        {evt.description}
                                                    </span>
                                                </div>
                                                <span className={cn("font-medium shrink-0 ml-2",
                                                    evt.type === 'income' ? 'text-emerald-600' : 'text-red-500'
                                                )}>
                                                    {evt.type === 'expense' ? '-' : '+'}{formatCurrency(evt.amount)}
                                                </span>
                                            </div>
                                        ))}
                                    {(!dayData || dayData.events.length === 0) && (
                                        <p className="text-center text-xs text-muted-foreground py-4">Sem eventos financeiros.</p>
                                    )}
                                </div>
                            </PopoverContent>
                        </Popover>
                    );
                })}
            </div>
        </div>
    );
}
