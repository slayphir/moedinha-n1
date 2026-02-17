"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import { useFinancialData } from "@/hooks/use-financial-data";
import { CreateContactDialog } from "../../cadastros/_components/create-contact-dialog";

export function ContactSelector({
    value,
    onChange,
    disabled
}: {
    value?: string | null;
    onChange: (value: string | null) => void;
    disabled?: boolean;
}) {
    const [open, setOpen] = React.useState(false);
    const [createOpen, setCreateOpen] = React.useState(false);
    const { contacts, refetch } = useFinancialData();

    const selectedContact = contacts.find((contact) => contact.id === value);

    return (
        <div className="flex flex-col gap-2">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-full justify-between"
                        disabled={disabled}
                    >
                        {selectedContact ? selectedContact.name : "Selecione um contato..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                    <Command>
                        <CommandInput placeholder="Buscar contato..." />
                        <CommandList>
                            <CommandEmpty>
                                <div className="p-2">
                                    <p className="text-sm text-muted-foreground mb-2">Contato não encontrado.</p>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full"
                                        onClick={() => {
                                            setOpen(false);
                                            setCreateOpen(true);
                                        }}
                                    >
                                        <Plus className="mr-2 h-4 w-4" />
                                        Criar novo contato
                                    </Button>
                                </div>
                            </CommandEmpty>
                            <CommandGroup>
                                <CommandItem
                                    value="none"
                                    onSelect={() => {
                                        onChange(null);
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            !value ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    Nenhum
                                </CommandItem>
                                {contacts.map((contact) => (
                                    <CommandItem
                                        key={contact.id}
                                        value={contact.name}
                                        onSelect={() => {
                                            onChange(contact.id);
                                            setOpen(false);
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                value === contact.id ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        {contact.name}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>

            <CreateContactDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                onSuccess={(id) => {
                    refetch();
                    onChange(id);
                }}
            />
        </div>
    );
}
