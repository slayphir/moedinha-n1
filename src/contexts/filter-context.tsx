"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { startOfMonth, endOfMonth, subDays, startOfYear, endOfYear, subMonths } from "date-fns";

export type DateRange = {
    from: Date | undefined;
    to: Date | undefined;
};

export type PeriodPreset = "7d" | "30d" | "90d" | "month" | "last_month" | "ytd" | "year" | "custom";

interface FilterContextType {
    dateRange: DateRange;
    preset: PeriodPreset;
    setPreset: (preset: PeriodPreset) => void;
    setDateRange: (range: DateRange) => void;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export function FilterProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();

    const [dateRange, setDateRangeState] = useState<DateRange>({
        from: startOfMonth(new Date(2024, 0, 15)),
        to: endOfMonth(new Date(2024, 0, 15)),
    });
    const [preset, setPresetState] = useState<PeriodPreset>("month");

    function readCurrentParams() {
        if (typeof window === "undefined") return new URLSearchParams();
        return new URLSearchParams(window.location.search);
    }

    // Sync from URL on mount/update; fallback to current month for hydration safety
    useEffect(() => {
        const searchParams = readCurrentParams();
        const startParam = searchParams.get("start");
        const endParam = searchParams.get("end");
        const presetParam = searchParams.get("period") as PeriodPreset;

        if (startParam && endParam) {
            setDateRangeState({
                from: new Date(startParam),
                to: new Date(endParam),
            });
        } else {
            const now = new Date();
            setDateRangeState({ from: startOfMonth(now), to: endOfMonth(now) });
        }

        if (presetParam) {
            setPresetState(presetParam);
        }
    }, [pathname]);

    const updateUrl = (range: DateRange, newPreset: PeriodPreset) => {
        const params = readCurrentParams();

        if (range.from) params.set("start", range.from.toISOString().split("T")[0]);
        if (range.to) params.set("end", range.to.toISOString().split("T")[0]);
        params.set("period", newPreset);

        router.push(`${pathname}?${params.toString()}`, { scroll: false });
    };

    const setPreset = (newPreset: PeriodPreset) => {
        setPresetState(newPreset);
        const now = new Date();
        let newRange: DateRange = { from: undefined, to: undefined };

        switch (newPreset) {
            case "7d":
                newRange = { from: subDays(now, 7), to: now };
                break;
            case "30d":
                newRange = { from: subDays(now, 30), to: now };
                break;
            case "90d":
                newRange = { from: subDays(now, 90), to: now };
                break;
            case "month":
                newRange = { from: startOfMonth(now), to: endOfMonth(now) };
                break;
            case "last_month":
                const lastMonth = subMonths(now, 1);
                newRange = { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
                break;
            case "ytd":
                newRange = { from: startOfYear(now), to: now };
                break;
            case "year":
                newRange = { from: startOfYear(now), to: endOfYear(now) };
                break;
            case "custom":
                // Keep current range, just change flag
                newRange = dateRange;
                break;
        }

        if (newPreset !== "custom") {
            setDateRange(newRange);
        }
        // For custom, we don't auto-update the range effectively until user picks dates, 
        // but we update the URL with the current range + custom flag
        updateUrl(newRange, newPreset);
    };

    const setDateRange = (range: DateRange) => {
        setDateRangeState(range);
        updateUrl(range, preset === "custom" ? "custom" : preset);
    };

    return (
        <FilterContext.Provider value={{ dateRange, preset, setPreset, setDateRange }}>
            {children}
        </FilterContext.Provider>
    );
}

export function useFilter() {
    const context = useContext(FilterContext);
    if (context === undefined) {
        throw new Error("useFilter must be used within a FilterProvider");
    }
    return context;
}
