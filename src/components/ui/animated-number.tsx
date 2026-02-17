"use client";

import { useEffect, useRef, useState } from "react";

type AnimatedNumberProps = {
    value: number;
    duration?: number;
    formatFn?: (n: number) => string;
    className?: string;
};

export function AnimatedNumber({
    value,
    duration = 900,
    formatFn = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    className,
}: AnimatedNumberProps) {
    const [display, setDisplay] = useState(0);
    const rafRef = useRef<number | null>(null);
    const startRef = useRef<number | null>(null);
    const prevValue = useRef(0);

    useEffect(() => {
        const from = prevValue.current;
        const to = value;
        prevValue.current = value;

        if (rafRef.current) cancelAnimationFrame(rafRef.current);

        const animate = (timestamp: number) => {
            if (!startRef.current) startRef.current = timestamp;
            const elapsed = timestamp - startRef.current;
            const progress = Math.min(elapsed / duration, 1);

            // easeOutCubic for a satisfying feel
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(from + (to - from) * eased);

            if (progress < 1) {
                rafRef.current = requestAnimationFrame(animate);
            }
        };

        startRef.current = null;
        rafRef.current = requestAnimationFrame(animate);

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [value, duration]);

    return <span className={className}>{formatFn(display)}</span>;
}
