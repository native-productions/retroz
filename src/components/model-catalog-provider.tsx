"use client";

import * as React from "react";
import { MODEL_GROUPS, DEFAULT_MODELS } from "@/lib/models";
import type { ModelCatalog } from "@/lib/model-catalog";

/**
 * The active model catalog, loaded once by the app shell.
 *
 * In PROVIDER mode the options are database rows rather than a constant, and
 * four different selectors plus two label call sites need them. Threading the
 * list through every page's props would touch a dozen components for one value,
 * so the shell puts it in context instead.
 */
const ModelCatalogContext = React.createContext<ModelCatalog>({
  engineMode: "LOCAL",
  groups: MODEL_GROUPS,
  defaultModel: DEFAULT_MODELS.CLAUDE,
  labels: {},
});

export function ModelCatalogProvider({
  catalog,
  children,
}: {
  catalog: ModelCatalog;
  children: React.ReactNode;
}) {
  return (
    <ModelCatalogContext.Provider value={catalog}>
      {children}
    </ModelCatalogContext.Provider>
  );
}

export function useModelCatalog(): ModelCatalog {
  return React.useContext(ModelCatalogContext);
}

/**
 * The value a model `<Select>` should show for a stored choice.
 *
 * A stored model belonging to the inactive engine mode is not in the current
 * options, and a Select given a value with no matching item renders blank. Fall
 * back to the catalog default so the control always shows what the run will
 * actually use.
 */
export function useSelectedModel(stored?: string | null): string {
  const { groups, defaultModel } = useModelCatalog();
  if (stored && groups.some((g) => g.options.some((o) => o.value === stored))) {
    return stored;
  }
  return defaultModel;
}
