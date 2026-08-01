"use client";

import { useModelCatalog } from "@/components/model-catalog-provider";
import {
  SelectGroup,
  SelectLabel,
  SelectItem,
} from "@/components/ui/ui-select";

/**
 * Model options for the task, workflow, project and campaign override selects.
 *
 * Which models these are depends on the engine mode: the fixed Claude/Codex
 * catalogs in LOCAL mode, the configured endpoints' models in PROVIDER mode.
 * Overrides from the inactive mode stay in the database and are ignored at run
 * time (resolveProviderModel), so nothing breaks when the mode is switched.
 */
export function ModelSelectOptions() {
  const { groups, engineMode } = useModelCatalog();

  if (groups.length === 0) {
    return (
      <SelectGroup>
        <SelectLabel>
          {engineMode === "PROVIDER"
            ? "No provider models — add one in Settings"
            : "No models available"}
        </SelectLabel>
      </SelectGroup>
    );
  }

  return (
    <>
      {groups.map((group) => (
        <SelectGroup key={group.label}>
          <SelectLabel>{group.label}</SelectLabel>
          {group.options.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
            </SelectItem>
          ))}
        </SelectGroup>
      ))}
    </>
  );
}
