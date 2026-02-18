"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    ArrowRight,
    ArrowLeft,
    Coins,
    CreditCard,
    Landmark,
    Wallet,
    Tag,
    Target,
    Sparkles,
    Check,
    Plus,
    SkipForward,
    PartyPopper,
    X,
    Minus,
    ChevronsUpDown,
} from "lucide-react";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { BRAZILIAN_BANKS } from "@/lib/constants/banks";
import { createAccount, deleteAccount } from "@/app/actions/accounts";
import { createGoal } from "@/app/actions/goals";
import { createDefaultDistribution } from "@/app/actions/distribution";
import { completeSetup, createCategory, deleteCategory } from "@/app/actions/complete-setup";
import { getLevel } from "@/lib/gamification";
import confetti from "canvas-confetti";
import { CurrencyInput } from "@/components/ui/currency-input";

type SetupAccount = { id: string; name: string; type: string; is_credit_card: boolean };
type SetupCategory = { id: string; name: string; type: string };

type SetupWizardProps = {
    orgId: string;
    existingAccounts: SetupAccount[];
    existingCategories: SetupCategory[];
};



function BankCombobox({ value, onSelect }: { value: string; onSelect: (val: string) => void }) {
    const [open, setOpen] = useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal text-ink"
                >
                    {value
                        ? BRAZILIAN_BANKS.find((bank) => bank.name === value)?.name || value
                        : "Selecione o banco..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
                <Command>
                    <CommandInput placeholder="Buscar banco..." />
                    <CommandList>
                        <CommandEmpty>Banco não encontrado.</CommandEmpty>
                        <CommandGroup className="max-h-[300px] overflow-auto">
                            {BRAZILIAN_BANKS.map((bank) => (
                                <CommandItem
                                    key={bank.code}
                                    value={bank.name}
                                    onSelect={(currentValue) => {
                                        onSelect(currentValue === value ? "" : currentValue);
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === bank.name ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {bank.name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

const STEPS = [
    { id: "welcome", label: "Boas-vindas", icon: Sparkles, emoji: "👋" },
    { id: "accounts", label: "Contas", icon: Wallet, emoji: "💳" },
    { id: "categories", label: "Categorias", icon: Tag, emoji: "🏷️" },
    { id: "distribution", label: "Distribuição", icon: Coins, emoji: "📊" },
    { id: "goal", label: "Primeira Meta", icon: Target, emoji: "🎯" },
];

const ACCOUNT_PRESETS = [
    { name: "Conta Corrente", type: "bank", icon: Landmark },
    { name: "Carteira / Dinheiro", type: "cash", icon: Wallet },
    { name: "Cartão de Crédito", type: "credit_card", icon: CreditCard },
    { name: "Poupança", type: "savings", icon: Landmark },
    { name: "Conta Salário", type: "bank", icon: Landmark },
    { name: "Conta Digital", type: "bank", icon: Landmark },
];

const CATEGORY_PRESETS_EXPENSE = [
    "Alimentação", "Moradia", "Transporte", "Saúde", "Educação",
    "Lazer", "Vestuário", "Assinaturas", "Pets", "Presentes",
    "Restaurantes", "Mercado", "Farmácia", "Combustível", "Estacionamento",
    "Internet", "Celular", "Energia", "Água", "Gás",
    "Aluguel", "Condomínio", "IPTU", "Seguro", "Manutenção",
    "Academia", "Streaming", "Delivery", "Café", "Padaria",
    "Cabeleireiro", "Cosméticos", "Eletrônicos", "Jogos", "Livros",
    "Viagem", "Hotel", "Uber/99", "Dentista", "Terapia",
];

const CATEGORY_PRESETS_INCOME = [
    "Salário", "Freelance", "Investimentos", "Vendas", "Outros",
    "Aluguel Recebido", "Dividendos", "Comissão", "Pensão", "Bônus",
    "Reembolso", "Cashback", "Prêmio", "Mesada", "13º Salário",
];

// ── XP System (action-based, not step-based) ──
// Setup only earns ~100-300 XP total. Levels go much higher.
const XP_VALUES = {
    nickname: 10,
    account: 25,
    category: 10,
    distribution: 50,
    goal: 50,
};

// XP_VALUES stays local — wizard-specific XP rewards
// LEVELS and getLevel come from @/lib/gamification

export function SetupWizard({ orgId, existingAccounts, existingCategories }: SetupWizardProps) {
    const router = useRouter();
    const [step, setStep] = useState(0);
    const [direction, setDirection] = useState<"next" | "prev">("next");
    const [loading, setLoading] = useState(false);

    // Welcome state
    const [nickname, setNickname] = useState("");

    // Accounts state
    const [accounts, setAccounts] = useState<SetupAccount[]>(existingAccounts);
    const [newAccountName, setNewAccountName] = useState("");
    const [newAccountType, setNewAccountType] = useState("bank");

    // Categories state
    const [categories, setCategories] = useState<SetupCategory[]>(existingCategories);
    const [newCatName, setNewCatName] = useState("");
    const [newCatType, setNewCatType] = useState<"income" | "expense">("expense");

    // Distribution state
    const [distributionCreated, setDistributionCreated] = useState(false);
    const [distNecessidades, setDistNecessidades] = useState(50);
    const [distDesejos, setDistDesejos] = useState(30);
    const [distMetas, setDistMetas] = useState(20);

    // Goal state
    const [goalName, setGoalName] = useState("");
    const [goalAmount, setGoalAmount] = useState("");
    const [goalType, setGoalType] = useState<"savings" | "purchase" | "investment" | "travel" | "debt" | "emergency_fund" | "other">("savings");

    // Done state
    const [done, setDone] = useState(false);

    // ── XP calculation (action-based) ──
    const xpEarned = useMemo(() => {
        let xp = 0;
        if (nickname.trim()) xp += XP_VALUES.nickname;
        xp += accounts.length * XP_VALUES.account;
        xp += categories.length * XP_VALUES.category;
        if (distributionCreated) xp += XP_VALUES.distribution;
        if (goalName.trim()) xp += XP_VALUES.goal;
        return xp;
    }, [nickname, accounts.length, categories.length, distributionCreated, goalName]);

    const { level: currentLevel, index: levelIndex, next: nextLevel } = getLevel(xpEarned);
    const xpForBar = nextLevel ? ((xpEarned - currentLevel.minXP) / (nextLevel.minXP - currentLevel.minXP)) * 100 : 100;

    const ACHIEVEMENTS = useMemo(() => [
        { id: "welcome", label: "Primeiro Passo", emoji: "👣", unlocked: nickname.trim().length > 0 },
        { id: "accounts", label: "Conta Aberta", emoji: "🏦", unlocked: accounts.length > 0 },
        { id: "categories5", label: "Organizador", emoji: "📋", unlocked: categories.length >= 5 },
        { id: "categories10", label: "Super Organizador", emoji: "🏆", unlocked: categories.length >= 10 },
        { id: "distribution", label: "Distribuidor", emoji: "⚖️", unlocked: distributionCreated },
        { id: "goal", label: "Sonhador", emoji: "🌟", unlocked: goalName.trim().length > 0 },
    ], [nickname, accounts.length, categories.length, distributionCreated, goalName]);

    const goNext = useCallback(() => {
        setDirection("next");
        setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }, []);

    const goPrev = useCallback(() => {
        setDirection("prev");
        setStep((s) => Math.max(s - 1, 0));
    }, []);

    // ── Accounts: toggle (add/remove) ──
    const handleToggleAccount = async (name: string, type: string) => {
        const existing = accounts.find((a) => a.name.toLowerCase() === name.toLowerCase());
        if (existing) {
            // Remove
            setLoading(true);
            await deleteAccount(existing.id);
            setAccounts((prev) => prev.filter((a) => a.id !== existing.id));
            setLoading(false);
        } else {
            // Add
            setLoading(true);
            const isCreditCard = type === "credit_card";
            const result = await createAccount({
                name,
                initial_balance: 0,
                type: isCreditCard ? "bank" : type,
                is_credit_card: isCreditCard,
                credit_limit: isCreditCard ? 1000 : undefined,
                closing_day: isCreditCard ? 1 : undefined,
                due_day: isCreditCard ? 10 : undefined,
            });
            if (!result.error) {
                // We need the real ID from the server
                const newId = (result as { id?: string }).id || Date.now().toString();
                setAccounts((prev) => [...prev, { id: newId, name, type, is_credit_card: isCreditCard }]);
                setNewAccountName("");
            }
            setLoading(false);
        }
    };

    const handleAddCustomAccount = async () => {
        if (!newAccountName.trim()) return;
        setLoading(true);
        const isCreditCard = newAccountType === "credit_card";
        const result = await createAccount({
            name: newAccountName,
            initial_balance: 0,
            type: isCreditCard ? "bank" : newAccountType,
            is_credit_card: isCreditCard,
            credit_limit: isCreditCard ? 1000 : undefined,
            closing_day: isCreditCard ? 1 : undefined,
            due_day: isCreditCard ? 10 : undefined,
        });
        if (!result.error) {
            const newId = (result as { id?: string }).id || Date.now().toString();
            setAccounts((prev) => [...prev, { id: newId, name: newAccountName, type: newAccountType, is_credit_card: isCreditCard }]);
            setNewAccountName("");
        }
        setLoading(false);
    };

    // ── Categories: toggle (add/remove) ──
    const handleToggleCategory = async (name: string, type: "income" | "expense") => {
        const existing = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
        if (existing) {
            // Remove
            setLoading(true);
            await deleteCategory(existing.id);
            setCategories((prev) => prev.filter((c) => c.id !== existing.id));
            setLoading(false);
        } else {
            // Add
            setLoading(true);
            const result = await createCategory({ name, type });
            if (!result.error && result.data) {
                setCategories((prev) => [...prev, result.data!]);
            }
            setLoading(false);
        }
    };

    const handleAddCustomCategory = async () => {
        if (!newCatName.trim()) return;
        if (categories.some((c) => c.name.toLowerCase() === newCatName.toLowerCase())) return;
        setLoading(true);
        const result = await createCategory({ name: newCatName, type: newCatType });
        if (!result.error && result.data) {
            setCategories((prev) => [...prev, result.data!]);
        }
        setNewCatName("");
        setLoading(false);
    };

    // ── Distribution ──
    const distSoma = distNecessidades + distDesejos + distMetas;
    const distValid = distSoma === 100;

    const handleSaveDistribution = async () => {
        if (!distValid) return;
        setLoading(true);
        // First create default, then we could adjust. For simplicity use saveDistribution
        // But we need a distribution_id first. Let's create default then update.
        const defaultResult = await createDefaultDistribution(orgId);
        if (!defaultResult.error) {
            setDistributionCreated(true);
        }
        setLoading(false);
    };

    const handleCreateGoal = async () => {
        if (!goalName.trim()) return;
        setLoading(true);
        try {
            const result = await createGoal({
                name: goalName,
                type: goalType,
                target_amount: goalAmount ? parseFloat(goalAmount) : undefined,
                strategy: "manual",
            });
            if (result.error) {
                console.error("Erro ao criar meta:", result.error);
            }
        } catch (err) {
            console.error("Exceção ao criar meta:", err);
        }
        setLoading(false);
        await finishSetup();
    };

    const finishSetup = async () => {
        setLoading(true);
        await completeSetup(orgId);
        setDone(true);
        setLoading(false);

        // 🎉 Confetti!
        confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 },
            colors: ["#F1C31E", "#295033", "#825219", "#2E9F62"],
        });

        setTimeout(() => {
            router.refresh();
        }, 2500);
    };

    const currentStep = STEPS[step];

    if (done) {
        return (
            <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 animate-fade-in-up">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-vault-700 to-coin text-3xl shadow-lg animate-pulse-glow">
                    <PartyPopper className="h-10 w-10 text-paper" />
                </div>
                <h1 className="font-display text-4xl text-ink">Tudo pronto! 🎉</h1>
                <p className="font-semibold coin-shimmer text-lg">
                    {currentLevel.emoji} Nível {levelIndex}: {currentLevel.title}
                </p>
                <p className="text-sm text-ink/70">+{xpEarned} XP conquistados no setup</p>
                <p className="max-w-md text-center text-ink/70">
                    Seu sistema financeiro está configurado. Continue usando para subir de nível!
                </p>
                <div className="flex gap-3">
                    {ACHIEVEMENTS.map((a) => (
                        <div
                            key={a.id}
                            className={`flex h-12 w-12 items-center justify-center rounded-full text-xl shadow-md transition-all ${a.unlocked
                                ? "bg-gradient-to-br from-vault-700 to-coin"
                                : "bg-stroke/40 grayscale opacity-40"
                                }`}
                            title={a.label}
                        >
                            {a.emoji}
                        </div>
                    ))}
                </div>
                <p className="text-sm text-ink/50">Redirecionando para o dashboard...</p>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-2xl space-y-6 py-8">
            {/* Progress indicator */}
            <div className="flex items-center justify-center gap-2">
                {STEPS.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-2">
                        <button
                            onClick={() => { setDirection(i > step ? "next" : "prev"); setStep(i); }}
                            className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium transition-all duration-300 ${i === step
                                ? "bg-gradient-to-br from-vault-700 to-coin text-paper shadow-md scale-110"
                                : i < step
                                    ? "bg-vault-700 text-paper"
                                    : "bg-stroke/50 text-ink/50"
                                }`}
                        >
                            {i < step ? <Check className="h-4 w-4" /> : s.emoji}
                        </button>
                        {i < STEPS.length - 1 && (
                            <div className={`hidden h-0.5 w-8 rounded-full sm:block transition-colors duration-300 ${i < step ? "bg-vault-700" : "bg-stroke/50"
                                }`} />
                        )}
                    </div>
                ))}
            </div>

            {/* ── XP / Level Bar ── */}
            <Card className="overflow-hidden border-coin/30 bg-gradient-to-r from-vault-950/5 via-transparent to-coin/5">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-vault-700 to-coin text-paper font-bold text-sm shadow-md">
                                Lv.{levelIndex}
                            </div>
                            <div>
                                <p className="text-sm font-semibold coin-shimmer">
                                    {currentLevel.emoji} {currentLevel.title}
                                </p>
                                <p className="text-xs text-ink/50">
                                    {xpEarned} XP {nextLevel && `· próximo nível: ${nextLevel.minXP} XP`}
                                </p>
                            </div>
                        </div>
                        <div className="hidden sm:flex items-center gap-1.5">
                            {ACHIEVEMENTS.map((a) => (
                                <div
                                    key={a.id}
                                    title={a.unlocked ? `✓ ${a.label}` : a.label}
                                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm transition-all duration-300 ${a.unlocked
                                        ? "bg-coin/15 scale-110 shadow-sm"
                                        : "bg-stroke/30 grayscale opacity-40"
                                        }`}
                                >
                                    {a.emoji}
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* XP progress bar */}
                    <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-stroke/40">
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-vault-700 via-vault-700 to-coin transition-all duration-700 ease-out"
                            style={{ width: `${Math.min(xpForBar, 100)}%` }}
                        />
                    </div>
                    {xpEarned > 0 && (
                        <p className="mt-1.5 text-right text-xs text-coin font-medium animate-fade-in-up">
                            {xpEarned} XP ✨
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Step title */}
            <div className="text-center animate-fade-in-up" key={`title-${step}`}>
                <h1 className="font-display text-3xl text-ink">
                    {currentStep.emoji} {currentStep.label}
                </h1>
            </div>

            {/* Step content */}
            <Card className="overflow-hidden">
                <CardContent className="p-6">
                    <div
                        key={`step-${step}`}
                        className={direction === "next" ? "animate-slide-in-right" : "animate-fade-in-up"}
                    >
                        {/* ── Step 0: Welcome ── */}
                        {step === 0 && (
                            <div className="space-y-6 text-center">
                                <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-vault-950 to-vault-700 shadow-lg">
                                    <Coins className="h-12 w-12 text-coin animate-coin-spin" />
                                </div>
                                <div className="space-y-2">
                                    <h2 className="text-xl font-semibold text-ink">
                                        Bem-vindo ao Moedinha Nº1! 🎊
                                    </h2>
                                    <p className="text-ink/70">
                                        Vamos configurar tudo em poucos passos para você começar a gerenciar suas finanças de forma prática e divertida.
                                    </p>
                                </div>
                                <div className="mx-auto max-w-xs space-y-2">
                                    <Label htmlFor="nickname">Como quer ser chamado?</Label>
                                    <Input
                                        id="nickname"
                                        value={nickname}
                                        onChange={(e) => setNickname(e.target.value)}
                                        placeholder="Ex: Douglas, Duda, Mestre..."
                                        className="text-center"
                                    />
                                    {nickname.trim() && (
                                        <p className="text-xs text-coin font-medium animate-fade-in-up">
                                            +{XP_VALUES.nickname} XP 🎉
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── Step 1: Accounts (toggle) ── */}
                        {step === 1 && (
                            <div className="space-y-6">
                                <p className="text-sm text-ink/70">
                                    Toque para adicionar ou remover contas. Pode voltar e alterar quando quiser.
                                </p>

                                {/* Quick-add presets */}
                                <div className="grid grid-cols-2 gap-3">
                                    {ACCOUNT_PRESETS.map((preset) => {
                                        const added = accounts.some(
                                            (a) => a.name.toLowerCase() === preset.name.toLowerCase()
                                        );
                                        return (
                                            <button
                                                key={preset.name}
                                                disabled={loading}
                                                onClick={() => handleToggleAccount(preset.name, preset.type)}
                                                className={`flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition-all duration-200 ${added
                                                    ? "border-vault-700/40 bg-vault-700/10 text-vault-700"
                                                    : "border-stroke hover:border-coin hover:bg-coin/5 hover:-translate-y-0.5"
                                                    }`}
                                            >
                                                <preset.icon className="h-5 w-5 shrink-0" />
                                                <span className="font-medium flex-1">{preset.name}</span>
                                                {added ? <X className="h-4 w-4 text-ink/40" /> : <Plus className="h-4 w-4 text-ink/30" />}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Custom account */}
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    {newAccountType === "bank" ? (
                                        <div className="flex-1 relative">
                                            <BankCombobox
                                                value={newAccountName}
                                                onSelect={(name) => setNewAccountName(name)}
                                            />
                                        </div>
                                    ) : (
                                        <Input
                                            value={newAccountName}
                                            onChange={(e) => setNewAccountName(e.target.value)}
                                            placeholder="Nome da conta..."
                                            className="flex-1"
                                        />
                                    )}

                                    <div className="flex gap-2">
                                        <Select value={newAccountType} onValueChange={setNewAccountType}>
                                            <SelectTrigger className="w-36">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="bank">Banco</SelectItem>
                                                <SelectItem value="cash">Dinheiro</SelectItem>
                                                <SelectItem value="credit_card">Cartão</SelectItem>
                                                <SelectItem value="savings">Poupança</SelectItem>
                                                <SelectItem value="investment">Investimento</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Button
                                            size="icon"
                                            disabled={!newAccountName.trim() || loading}
                                            onClick={handleAddCustomAccount}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>

                                {accounts.length > 0 && (
                                    <p className="text-center text-sm text-vault-700 font-medium">
                                        ✅ {accounts.length} conta(s) · +{accounts.length * XP_VALUES.account} XP
                                    </p>
                                )}
                            </div>
                        )}

                        {/* ── Step 2: Categories (toggle, expanded) ── */}
                        {step === 2 && (
                            <div className="space-y-6">
                                <p className="text-sm text-ink/70">
                                    Toque para adicionar ou remover categorias. Quanto mais organizado, melhor!
                                </p>

                                <div>
                                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/60">Despesas</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {CATEGORY_PRESETS_EXPENSE.map((name) => {
                                            const exists = categories.some((c) => c.name.toLowerCase() === name.toLowerCase());
                                            return (
                                                <button
                                                    key={name}
                                                    disabled={loading}
                                                    onClick={() => handleToggleCategory(name, "expense")}
                                                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-200 ${exists
                                                        ? "bg-destructive/10 text-destructive border border-destructive/20"
                                                        : "bg-stroke/30 text-ink/70 hover:bg-destructive/10 hover:text-destructive border border-transparent hover:border-destructive/20"
                                                        }`}
                                                >
                                                    {exists ? "✕ " : ""}{name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/60">Receitas</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {CATEGORY_PRESETS_INCOME.map((name) => {
                                            const exists = categories.some((c) => c.name.toLowerCase() === name.toLowerCase());
                                            return (
                                                <button
                                                    key={name}
                                                    disabled={loading}
                                                    onClick={() => handleToggleCategory(name, "income")}
                                                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-200 ${exists
                                                        ? "bg-vault-700/10 text-vault-700 border border-vault-700/20"
                                                        : "bg-stroke/30 text-ink/70 hover:bg-vault-700/10 hover:text-vault-700 border border-transparent hover:border-vault-700/20"
                                                        }`}
                                                >
                                                    {exists ? "✕ " : ""}{name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Custom */}
                                <div className="flex gap-2">
                                    <Input
                                        value={newCatName}
                                        onChange={(e) => setNewCatName(e.target.value)}
                                        placeholder="Nova categoria..."
                                        className="flex-1"
                                    />
                                    <Select value={newCatType} onValueChange={(v) => setNewCatType(v as "income" | "expense")}>
                                        <SelectTrigger className="w-32">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="expense">Despesa</SelectItem>
                                            <SelectItem value="income">Receita</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        size="sm"
                                        disabled={!newCatName.trim() || loading}
                                        onClick={handleAddCustomCategory}
                                    >
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>

                                <p className="text-center text-sm text-vault-700 font-medium">
                                    {categories.length > 0
                                        ? `✅ ${categories.length} categoria(s) · +${categories.length * XP_VALUES.category} XP`
                                        : "Nenhuma categoria selecionada"}
                                </p>
                            </div>
                        )}

                        {/* ── Step 3: Distribution (editable) ── */}
                        {step === 3 && (
                            <div className="space-y-6 text-center">
                                <p className="text-sm text-ink/70">
                                    Divida sua renda como preferir. A regra clássica é 50/30/20, mas ajuste ao seu gosto!
                                </p>

                                <div className="mx-auto max-w-md space-y-3">
                                    {/* Necessidades */}
                                    <div className="flex items-center gap-3 rounded-lg border border-vault-700/30 bg-vault-700/5 p-4">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-vault-700 text-paper font-bold shrink-0">
                                            {distNecessidades}
                                        </div>
                                        <div className="text-left flex-1">
                                            <p className="font-medium text-ink">Necessidades</p>
                                            <p className="text-xs text-ink/60">Aluguel, alimentação, contas fixas</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => setDistNecessidades((v) => Math.max(0, v - 5))}
                                                className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke hover:bg-stroke/20 transition-colors"
                                            >
                                                <Minus className="h-3 w-3" />
                                            </button>
                                            <Input
                                                type="number"
                                                value={distNecessidades}
                                                onChange={(e) => setDistNecessidades(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                                                className="w-16 text-center"
                                            />
                                            <button
                                                onClick={() => setDistNecessidades((v) => Math.min(100, v + 5))}
                                                className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke hover:bg-stroke/20 transition-colors"
                                            >
                                                <Plus className="h-3 w-3" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Desejos */}
                                    <div className="flex items-center gap-3 rounded-lg border border-coin/30 bg-coin/5 p-4">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-coin text-ink font-bold shrink-0">
                                            {distDesejos}
                                        </div>
                                        <div className="text-left flex-1">
                                            <p className="font-medium text-ink">Desejos</p>
                                            <p className="text-xs text-ink/60">Lazer, restaurantes, compras</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => setDistDesejos((v) => Math.max(0, v - 5))}
                                                className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke hover:bg-stroke/20 transition-colors"
                                            >
                                                <Minus className="h-3 w-3" />
                                            </button>
                                            <Input
                                                type="number"
                                                value={distDesejos}
                                                onChange={(e) => setDistDesejos(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                                                className="w-16 text-center"
                                            />
                                            <button
                                                onClick={() => setDistDesejos((v) => Math.min(100, v + 5))}
                                                className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke hover:bg-stroke/20 transition-colors"
                                            >
                                                <Plus className="h-3 w-3" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Metas */}
                                    <div className="flex items-center gap-3 rounded-lg border border-blue-400/30 bg-blue-400/5 p-4">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-paper font-bold shrink-0">
                                            {distMetas}
                                        </div>
                                        <div className="text-left flex-1">
                                            <p className="font-medium text-ink">Metas</p>
                                            <p className="text-xs text-ink/60">Poupança, investimentos, dívidas</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => setDistMetas((v) => Math.max(0, v - 5))}
                                                className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke hover:bg-stroke/20 transition-colors"
                                            >
                                                <Minus className="h-3 w-3" />
                                            </button>
                                            <Input
                                                type="number"
                                                value={distMetas}
                                                onChange={(e) => setDistMetas(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                                                className="w-16 text-center"
                                            />
                                            <button
                                                onClick={() => setDistMetas((v) => Math.min(100, v + 5))}
                                                className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke hover:bg-stroke/20 transition-colors"
                                            >
                                                <Plus className="h-3 w-3" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Total indicator */}
                                    <div className={`rounded-lg px-4 py-2 text-sm font-medium ${distValid
                                        ? "bg-vault-700/10 text-vault-700"
                                        : "bg-destructive/10 text-destructive"
                                        }`}>
                                        Total: {distSoma}% {distValid ? "✅" : `(faltam ${100 - distSoma > 0 ? 100 - distSoma : distSoma - 100}%)`}
                                    </div>
                                </div>

                                {!distributionCreated ? (
                                    <Button
                                        onClick={handleSaveDistribution}
                                        disabled={loading || !distValid}
                                        className="mx-auto"
                                        size="lg"
                                    >
                                        {loading ? "Configurando..." : `Ativar distribuição ${distNecessidades}/${distDesejos}/${distMetas}`}
                                    </Button>
                                ) : (
                                    <p className="text-vault-700 font-medium">✅ Distribuição configurada! +{XP_VALUES.distribution} XP</p>
                                )}

                                <p className="text-xs text-ink/50">
                                    Você pode alterar os percentuais depois em Distribuição.
                                </p>
                            </div>
                        )}

                        {/* ── Step 4: Goal ── */}
                        {step === 4 && (
                            <div className="space-y-6">
                                <p className="text-sm text-ink/70 text-center">
                                    Ter uma meta financeira te motiva a economizar. Pode ser qualquer coisa!
                                </p>

                                <div className="mx-auto max-w-sm space-y-4">
                                    <div className="space-y-2">
                                        <Label>Nome da meta</Label>
                                        <Input
                                            value={goalName}
                                            onChange={(e) => setGoalName(e.target.value)}
                                            placeholder="Ex: Reserva de emergência, iPhone, Viagem..."
                                        />
                                        {goalName.trim() && (
                                            <p className="text-xs text-coin font-medium animate-fade-in-up">
                                                +{XP_VALUES.goal} XP 🎯
                                            </p>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Tipo</Label>
                                        <Select value={goalType} onValueChange={(v) => setGoalType(v as typeof goalType)}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="savings">💰 Poupança</SelectItem>
                                                <SelectItem value="purchase">🛍️ Compra</SelectItem>
                                                <SelectItem value="investment">📈 Investimento</SelectItem>
                                                <SelectItem value="travel">✈️ Viagem</SelectItem>
                                                <SelectItem value="debt">💸 Dívida</SelectItem>
                                                <SelectItem value="emergency_fund">🆘 Reserva de Emergência</SelectItem>
                                                <SelectItem value="other">📦 Outro</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Valor alvo (opcional)</Label>
                                        <CurrencyInput
                                            value={goalAmount}
                                            onChange={(val) => setGoalAmount(val)}
                                            placeholder="R$ 5.000,00"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex items-center justify-between">
                <Button
                    variant="ghost"
                    onClick={goPrev}
                    disabled={step === 0}
                    className="gap-2"
                >
                    <ArrowLeft className="h-4 w-4" /> Voltar
                </Button>

                <div className="flex gap-2">
                    {step === 4 && (
                        <Button
                            variant="outline"
                            onClick={finishSetup}
                            disabled={loading}
                            className="gap-2"
                        >
                            <SkipForward className="h-4 w-4" /> Pular
                        </Button>
                    )}

                    {step < STEPS.length - 1 ? (
                        <Button onClick={goNext} className="gap-2">
                            Próximo <ArrowRight className="h-4 w-4" />
                        </Button>
                    ) : (
                        <Button
                            onClick={handleCreateGoal}
                            disabled={!goalName.trim() || loading}
                            className="gap-2 bg-gradient-to-r from-vault-700 to-coin hover:from-vault-900 hover:to-coin"
                        >
                            {loading ? "Finalizando..." : "Concluir"} <Sparkles className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
