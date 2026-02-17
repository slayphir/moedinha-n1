"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Crown, Sparkles } from "lucide-react";
import type { GamificationSnapshot } from "@/lib/gamification";

function getProgressPercentage(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}

export function CofreClient({ gamification }: { gamification: GamificationSnapshot }) {
  return (
    <Card className="bg-gradient-to-br from-paper to-surface">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Sparkles className="h-5 w-5 text-coin" />
          Gamificação do Cofre
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-xl border border-coin/60 bg-black/25 px-4 py-2">
          <p className="text-xs uppercase tracking-[0.12em] text-paper/75">Nível atual</p>
          <p className="flex items-center gap-2 text-lg font-semibold text-paper">
            <Crown className="h-5 w-5 text-coin" />
            {gamification.title} ({gamification.level})
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-stroke bg-surface p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-ink/70">XP acumulado</p>
            <p className="text-2xl font-bold text-ink">{gamification.xp}</p>
            <p className="text-xs text-ink/70">Faltam {gamification.xpToNext} XP para o próximo nível.</p>
          </div>
          <div className="rounded-xl border border-stroke bg-surface p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-ink/70">Moedas</p>
            <p className="text-2xl font-bold text-bronze">{gamification.duckCoins}</p>
            <p className="text-xs text-ink/70">Pontos de consistência financeira.</p>
          </div>
          <div className="rounded-xl border border-stroke bg-surface p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-ink/70">Streak</p>
            <p className="text-2xl font-bold text-vault-700">{gamification.streakDays} dias</p>
            <p className="text-xs text-ink/70">Dias seguidos com atividade.</p>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-ink">Missões da semana</p>
          {gamification.missions.map((mission) => {
            const progress = getProgressPercentage(mission.current, mission.target);
            return (
              <div key={mission.id} className="rounded-xl border border-stroke bg-surface p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{mission.title}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      mission.completed ? "bg-vault-700/15 text-vault-700" : "bg-coin/20 text-bronze"
                    }`}
                  >
                    {mission.reward}
                  </span>
                </div>
                <p className="text-xs text-ink/70">{mission.description}</p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stroke/85">
                  <div
                    className={`h-full rounded-full transition-all ${mission.completed ? "bg-vault-700" : "bg-coin"}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-ink/70">
                  {mission.current}/{mission.target}
                </p>
              </div>
            );
          })}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink">Conquistas</p>
          <div className="flex flex-wrap gap-2">
            {gamification.badges.map((badge) => (
              <span
                key={badge.id}
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${
                  badge.unlocked
                    ? "border-coin/70 bg-coin/25 text-vault-900"
                    : "border-stroke bg-paper text-ink/65"
                }`}
                title={badge.description}
              >
                {badge.unlocked ? "Liberada" : "Bloqueada"} - {badge.title}
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
