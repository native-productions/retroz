"use client";

import { MODEL_GROUPS } from "@/lib/models";
import {
  SelectGroup,
  SelectLabel,
  SelectItem,
} from "@/components/ui/ui-select";

/**
 * Grouped Claude/Codex model options for task and workflow override selects.
 * Overrides from the inactive provider are ignored at run time (resolveModel).
 */
export function ModelSelectOptions() {
  return (
    <>
      {MODEL_GROUPS.map((group) => (
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
