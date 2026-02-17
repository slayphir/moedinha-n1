"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFinancialData } from "@/hooks/use-financial-data";
import { CreateTagDialog } from "./create-tag-dialog";

export function TagSelector({
  value = [],
  onChange,
}: {
  value?: string[];
  onChange: (value: string[]) => void;
}) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const { tags } = useFinancialData();

  const selectedTags = tags.filter((tag) => value.includes(tag.id));

  const handleToggle = (tagId: string) => {
    if (value.includes(tagId)) {
      onChange(value.filter((id) => id !== tagId));
      return;
    }
    onChange([...value, tagId]);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="max-h-40 overflow-auto rounded-md border bg-muted/30 p-2">
        {tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma tag cadastrada.</p>
        ) : (
          <div className="space-y-1">
            {tags.map((tag) => (
              <label
                key={tag.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  checked={value.includes(tag.id)}
                  onChange={() => handleToggle(tag.id)}
                />
                <span>{tag.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedTags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-100 px-2 py-1 text-xs text-emerald-900"
            >
              {tag.name}
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-emerald-200"
                onClick={() => handleToggle(tag.id)}
                aria-label={`Remover ${tag.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" className="w-fit gap-2" onClick={() => setCreateOpen(true)}>
        <Plus className="h-4 w-4" />
        Nova tag
      </Button>

      <CreateTagDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={(id) => onChange([...value, id])}
      />
    </div>
  );
}

