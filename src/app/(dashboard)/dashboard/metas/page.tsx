import { Metadata } from "next";
import { getGoals } from "@/app/actions/goals";
import { MetasClient } from "./metas-client";

export const metadata: Metadata = {
    title: "Metas & Objetivos | Moedinha N°1",
    description: "Gerencie seus objetivos financeiros e acompanhe seu progresso.",
};

import { getEmergencyMetrics } from "@/app/actions/reserves";

export default async function MetasPage() {
    const goals = await getGoals();
    const reserveMetrics = await getEmergencyMetrics();

    return (
        <div className="container mx-auto py-6">
            <MetasClient goals={goals} reserveMetrics={reserveMetrics} />
        </div>
    );
}
