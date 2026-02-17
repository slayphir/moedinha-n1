"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { BarChart3, ChevronDown, Coins, LayoutDashboard, List, LogOut, Menu, Percent, Repeat, Settings, Tag, Target, Users, Wallet, CreditCard, Calendar as CalendarIcon, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrg } from "@/contexts/org-context";
import { CommandPalette } from "./command-palette";
import { cn } from "@/lib/utils";
import { AddTransactionFAB } from "../dashboard/_components/add-transaction-fab";

export function DashboardShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: User;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { org } = useOrg();
  const [configOpen, setConfigOpen] = useState(true);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  // Grouped Navigation
  const navSections = [
    {
      title: "Principal",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/dashboard/lancamentos", label: "Lançamentos", icon: List },
        { href: "/dashboard/distribuicao", label: "Distribuição 50/30/20", icon: Percent },
        { href: "/dashboard/faturas", label: "Cartões & Faturas", icon: CreditCard },
        { href: "/dashboard/metas", label: "Metas & Objetivos", icon: Target },
        { href: "/dashboard/relatorios", label: "Relatórios", icon: BarChart3 },
        { href: "/dashboard/relatorios/ir", label: "Auxiliar IR", icon: FileText },
        { href: "/dashboard/calendario", label: "Calendário", icon: CalendarIcon },
        { href: "/dashboard/assinaturas", label: "Assinaturas", icon: Repeat },
      ],
    },
    {
      title: "Configurações",
      collapsible: true,
      items: [
        { href: "/dashboard/cadastros?tab=accounts", label: "Contas", icon: Wallet },
        { href: "/dashboard/cadastros?tab=categories", label: "Categorias", icon: List },
        { href: "/dashboard/cadastros?tab=budgets", label: "Orçamentos", icon: Wallet },
        { href: "/dashboard/cadastros?tab=tags", label: "Regras / Tags", icon: Tag },
        { href: "/dashboard/cadastros?tab=contacts", label: "Contatos", icon: Users },
        { href: "/dashboard/configuracoes", label: "Preferências", icon: Settings },
      ],
    },
    {
      title: "Gamificação",
      items: [
        { href: "/dashboard/cofre", label: "Cofre (Nível)", icon: Coins },
      ],
    },
  ];

  // Mobile bottom nav — only essential items
  const mobileNavItems = [
    { href: "/dashboard", label: "Início", icon: LayoutDashboard },
    { href: "/dashboard/lancamentos", label: "Lançamentos", icon: List },
    { href: "/dashboard/distribuicao", label: "Distribuição", icon: Percent },
    { href: "/dashboard/metas", label: "Metas", icon: Target },
  ];

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* ── Desktop Sidebar (hidden on mobile) ── */}
      <aside className="hidden md:sticky md:top-0 md:flex md:w-64 md:flex-col md:border-r md:border-stroke md:h-screen md:overflow-y-auto bg-gradient-to-b from-vault-950 to-vault-900 text-paper">
        <div className="flex h-14 items-center gap-2 border-b border-paper/20 px-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-coin">
            <Coins className="h-4 w-4 animate-coin-spin" />
            <span className="font-display text-lg coin-shimmer">Moedinha Nº1</span>
          </Link>
        </div>

        <div className="flex flex-1 flex-col gap-4 px-3 py-4">
          {navSections.map((section, idx) => (
            <div key={section.title} className={cn("flex flex-col gap-1", idx > 0 && "pt-2 border-t border-paper/10")}>
              {section.collapsible ? (
                <button
                  onClick={() => setConfigOpen(!configOpen)}
                  className="flex items-center justify-between px-2 py-1 text-xs font-medium uppercase tracking-wider text-paper/50 hover:text-paper"
                >
                  {section.title}
                  <ChevronDown className={cn("h-3 w-3 transition-transform", !configOpen && "-rotate-90")} />
                </button>
              ) : (
                <h3 className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-paper/50">
                  {section.title}
                </h3>
              )}

              {(section.collapsible ? configOpen : true) && (
                <div className="flex flex-col gap-1">
                  {section.items.map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-all duration-200",
                        pathname === item.href.split("?")[0] && (!item.href.includes("tab=") || (item.href.includes("tab=") && searchParams.get("tab") === item.href.split("?")[1]?.split("=")[1]))
                          ? "bg-coin/10 font-medium text-coin border-l-2 border-coin animate-pulse-glow"
                          : "text-paper/80 hover:bg-vault-800 hover:text-paper hover:translate-x-1 border-l-2 border-transparent"
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-paper/20 p-3">
          <p className="truncate text-xs text-paper/75">{org?.name ?? "-"}</p>
          <p className="truncate text-xs text-paper">{user.email}</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start gap-2 text-paper/90 hover:bg-vault-700/30 hover:text-paper"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </aside>

      {/* ── Mobile Bottom Nav Bar ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-stroke bg-vault-950/95 backdrop-blur-md md:hidden safe-area-bottom">
        <div className="flex items-stretch justify-around px-1">
          {mobileNavItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-[56px] min-w-[56px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] transition-colors",
                  isActive ? "text-coin" : "text-paper/60 active:text-paper"
                )}
              >
                <item.icon className={cn("h-5 w-5", isActive && "drop-shadow-[0_0_6px_rgba(241,195,30,0.5)]")} />
                <span className="leading-none">{item.label}</span>
              </Link>
            );
          })}
          {/* "Mais" button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={cn(
              "flex min-h-[56px] min-w-[56px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] transition-colors",
              mobileMenuOpen ? "text-coin" : "text-paper/60 active:text-paper"
            )}
          >
            <Menu className="h-5 w-5" />
            <span className="leading-none">Mais</span>
          </button>
        </div>
      </nav>

      {/* ── Mobile "Mais" Drawer ── */}
      {mobileMenuOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50 md:hidden" onClick={() => setMobileMenuOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-stroke bg-vault-950 text-paper md:hidden safe-area-bottom animate-fade-in-up">
            <div className="flex items-center justify-between border-b border-paper/10 px-4 py-3">
              <span className="font-display text-base text-coin">Menu Completo</span>
              <button onClick={() => setMobileMenuOpen(false)} className="rounded-full p-2 hover:bg-paper/10">
                <ChevronDown className="h-5 w-5 text-paper/60" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1 p-3">
              {navSections.flatMap((s) => s.items).map((item) => (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl p-3 text-center transition-colors min-h-[72px] justify-center",
                    pathname === item.href.split("?")[0]
                      ? "bg-coin/10 text-coin"
                      : "text-paper/70 active:bg-paper/10"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="text-[10px] leading-tight">{item.label}</span>
                </Link>
              ))}
              <button
                onClick={() => { setMobileMenuOpen(false); signOut(); }}
                className="flex flex-col items-center gap-1.5 rounded-xl p-3 text-paper/50 active:bg-paper/10 min-h-[72px] justify-center"
              >
                <LogOut className="h-5 w-5" />
                <span className="text-[10px] leading-tight">Sair</span>
              </button>
            </div>
          </div>
        </>
      )}

      <main className="flex-1 overflow-auto pb-20 md:pb-6">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-stroke/90 bg-paper/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-paper/70">
          <span className="truncate text-sm font-medium text-ink md:hidden">{org?.name}</span>
          <div className="ml-auto flex items-center gap-2">
            <CommandPalette />
          </div>
        </header>
        <div className="p-4">{children}</div>
      </main>
      <AddTransactionFAB />
    </div>
  );
}

