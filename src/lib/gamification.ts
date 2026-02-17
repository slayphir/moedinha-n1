export type GamificationStats = {
  accountCount: number;
  categoryCount: number;
  transactionCount: number;
  hasDistribution: boolean;
  goalCount: number;
};

export type LevelInfo = {
  level: number;
  title: string;
  emoji: string;
  minXP: number;
};

export type GamificationTx = {
  date: string;
  type: "income" | "expense" | "transfer" | string;
  amount: number;
  categoryId: string | null;
};

export type GamificationMission = {
  id: string;
  title: string;
  description: string;
  current: number;
  target: number;
  reward: string;
  completed: boolean;
};

export type GamificationBadge = {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
};

export type GamificationSnapshot = {
  level: number;
  title: string;
  xp: number;
  xpToNext: number;
  duckCoins: number;
  streakDays: number;
  missions: GamificationMission[];
  badges: GamificationBadge[];
};

type BuildGamificationInput = {
  transactions: GamificationTx[];
  monthTransactions: GamificationTx[];
  monthIncome: number;
  monthExpense: number;
  now?: Date;
};

const TIERS = [
  { title: "Curioso Financeiro", emoji: "🌱" },
  { title: "Aprendiz do Cofre", emoji: "🔑" },
  { title: "Guardiao de Moedas", emoji: "🛡️" },
  { title: "Estrategista Fiscal", emoji: "📈" },
  { title: "Conquistador de Metas", emoji: "🎯" },
  { title: "Arquiteto Financeiro", emoji: "🏗️" },
  { title: "Mago dos Numeros", emoji: "✨" },
  { title: "Lenda do Cofre", emoji: "🏆" },
  { title: "Imperador Fiscal", emoji: "👑" },
  { title: "Mestre Supremo", emoji: "💎" },
];

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

function generateLevels(): LevelInfo[] {
  const levels: LevelInfo[] = [];
  for (let i = 1; i <= 99; i++) {
    const tierIndex = Math.min(Math.floor((i - 1) / 10), TIERS.length - 1);
    const tier = TIERS[tierIndex];
    const rank = (i - 1) % 10;
    const minXP = i === 1 ? 0 : Math.floor(50 * Math.pow(i, 1.8));
    levels.push({
      level: i,
      title: `${tier.title} ${ROMAN[rank]}`,
      emoji: tier.emoji,
      minXP,
    });
  }
  return levels;
}

export const LEVELS = generateLevels();

export function calcXP(g: GamificationStats): number {
  let xp = 0;
  xp += g.accountCount * 25;
  xp += g.categoryCount * 10;
  xp += g.transactionCount * 5;
  if (g.hasDistribution) xp += 50;
  xp += g.goalCount * 50;
  return xp;
}

export function getLevel(xp: number) {
  const current = [...LEVELS].reverse().find((l) => xp >= l.minXP) ?? LEVELS[0];
  const idx = LEVELS.indexOf(current);
  const next = LEVELS[idx + 1] ?? null;
  const pct = next ? ((xp - current.minXP) / (next.minXP - current.minXP)) * 100 : 100;
  return {
    level: current,
    index: current.level,
    next,
    pct: Math.min(Math.max(pct, 0), 100),
  };
}

function toISODate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function daysDiff(a: Date, b: Date): number {
  const oneDayMs = 1000 * 60 * 60 * 24;
  return Math.round((a.getTime() - b.getTime()) / oneDayMs);
}

function getStreakDays(transactions: GamificationTx[], now: Date): number {
  if (transactions.length === 0) return 0;

  const uniqueDays = Array.from(new Set(transactions.map((tx) => tx.date))).sort((a, b) => b.localeCompare(a));
  if (uniqueDays.length === 0) return 0;

  const lastTxDay = new Date(`${uniqueDays[0]}T00:00:00`);
  const today = new Date(`${toISODate(now)}T00:00:00`);

  if (daysDiff(today, lastTxDay) > 1) return 0;

  let streak = 1;
  let prev = lastTxDay;
  for (let i = 1; i < uniqueDays.length; i++) {
    const current = new Date(`${uniqueDays[i]}T00:00:00`);
    if (daysDiff(prev, current) === 1) {
      streak++;
      prev = current;
      continue;
    }
    break;
  }
  return streak;
}

export function buildGamification(input: BuildGamificationInput): GamificationSnapshot {
  const now = input.now ?? new Date();
  const categoryCount = new Set(input.transactions.map((tx) => tx.categoryId).filter(Boolean)).size;

  const stats: GamificationStats = {
    accountCount: 0,
    categoryCount,
    transactionCount: input.transactions.length,
    hasDistribution: input.monthTransactions.some((tx) => tx.type === "expense" && tx.categoryId !== null),
    goalCount: 0,
  };

  const xp = calcXP(stats);
  const level = getLevel(xp);
  const xpToNext = level.next ? Math.max(0, level.next.minXP - xp) : 0;
  const streakDays = getStreakDays(input.transactions, now);

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 6);
  const weekStartISO = toISODate(weekStart);
  const weekTxCount = input.transactions.filter((tx) => tx.date >= weekStartISO).length;
  const monthCategoryCount = new Set(input.monthTransactions.map((tx) => tx.categoryId).filter(Boolean)).size;
  const savingsCurrent = Math.max(0, Math.round(input.monthIncome - input.monthExpense));
  const savingsTarget = Math.max(1, Math.round(input.monthIncome * 0.1));

  const missions: GamificationMission[] = [
    {
      id: "week_5_tx",
      title: "Registrar 5 lancamentos",
      description: "Adicione 5 lancamentos nesta semana.",
      current: weekTxCount,
      target: 5,
      reward: "+40 XP",
      completed: weekTxCount >= 5,
    },
    {
      id: "month_saving",
      title: "Mes no verde",
      description: "Manter resultado mensal positivo.",
      current: savingsCurrent,
      target: savingsTarget,
      reward: "+60 XP",
      completed: savingsCurrent >= savingsTarget,
    },
    {
      id: "month_categories",
      title: "Classificar despesas",
      description: "Usar categorias em ao menos 8 despesas no mes.",
      current: monthCategoryCount,
      target: 8,
      reward: "+30 XP",
      completed: monthCategoryCount >= 8,
    },
  ];

  const badges: GamificationBadge[] = [
    {
      id: "first_tx",
      title: "Primeiro Lancamento",
      description: "Registrou a primeira movimentacao financeira.",
      unlocked: input.transactions.length > 0,
    },
    {
      id: "consistent_30",
      title: "Consistencia",
      description: "Acumulou 30 ou mais lancamentos.",
      unlocked: input.transactions.length >= 30,
    },
    {
      id: "saver",
      title: "Guardiao do Caixa",
      description: "Fechou o periodo com saldo positivo.",
      unlocked: input.monthIncome > 0 && input.monthIncome > input.monthExpense,
    },
    {
      id: "category_master",
      title: "Mestre das Categorias",
      description: "Utilizou 10 categorias diferentes.",
      unlocked: categoryCount >= 10,
    },
    {
      id: "level_10",
      title: "Nivel 10",
      description: "Alcancou o nivel 10 no cofre.",
      unlocked: level.level.level >= 10,
    },
  ];

  const completedMissions = missions.filter((m) => m.completed).length;
  const unlockedBadges = badges.filter((b) => b.unlocked).length;
  const duckCoins = Math.max(0, Math.round(xp / 10) + streakDays * 2 + completedMissions * 5 + unlockedBadges * 3);

  return {
    level: level.level.level,
    title: `${level.level.emoji} ${level.level.title}`,
    xp,
    xpToNext,
    duckCoins,
    streakDays,
    missions,
    badges,
  };
}

