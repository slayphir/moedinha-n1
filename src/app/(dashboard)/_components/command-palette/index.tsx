"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { ArrowLeftRight, Calendar, Filter, Plus, Receipt, Search } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { parseQuickCommand, type QuickTransactionDraft } from "@/lib/quick-launch";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const run = (callback: () => void) => {
    callback();
    setOpen(false);
    setQuery("");
  };

  const openQuickLaunch = (payload?: QuickTransactionDraft) => {
    window.dispatchEvent(new CustomEvent("financeiro:open-transaction", { detail: { draft: payload } }));
  };

  const runQuickQuery = () => {
    const parsed = parseQuickCommand(query);
    if (!parsed) return false;
    run(() => openQuickLaunch(parsed));
    return true;
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="hidden gap-2 text-muted-foreground md:inline-flex"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
        <span>Buscar...</span>
        <kbd className="pointer-events-none ml-1 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:flex">
          Ctrl+K
        </kbd>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0" hideClose={false}>
          <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-group]]:px-2">
            <div className="flex items-center border-b px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    const consumed = runQuickQuery();
                    if (consumed) event.preventDefault();
                  }
                }}
                placeholder="Ex: add 25 mercado | 35 almoco"
                className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <Command.List className="max-h-[320px] overflow-y-auto p-2">
              <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                Sem resultado.
              </Command.Empty>

              <Command.Group heading="Acoes rapidas">
                <Command.Item
                  onSelect={() => run(() => openQuickLaunch({ type: "income" }))}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 aria-selected:bg-accent"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar receita
                </Command.Item>
                <Command.Item
                  onSelect={() => run(() => openQuickLaunch({ type: "expense" }))}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 aria-selected:bg-accent"
                >
                  <Receipt className="h-4 w-4" />
                  Adicionar despesa
                </Command.Item>
                <Command.Item
                  onSelect={() => run(() => router.push("/dashboard/lancamentos?transfer=1"))}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 aria-selected:bg-accent"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                  Transferir
                </Command.Item>
              </Command.Group>

              <Command.Group heading="Navegacao">
                <Command.Item
                  onSelect={() => run(() => router.push("/dashboard/lancamentos"))}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 aria-selected:bg-accent"
                >
                  <Filter className="h-4 w-4" />
                  Lancamentos
                </Command.Item>
                <Command.Item
                  onSelect={() => run(() => router.push("/dashboard/relatorios"))}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 aria-selected:bg-accent"
                >
                  <Calendar className="h-4 w-4" />
                  Relatorios
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
