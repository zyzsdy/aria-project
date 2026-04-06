import type { CatalogNamespace } from "./catalog";

export type CatalogSource = {
  id: string;
  getLocales(): string[];
  loadNamespace(locale: string, namespace: string): Promise<CatalogNamespace>;
};

export type StaticCatalogData = Record<string, Record<string, CatalogNamespace>>;

type LoadCatalogMessagesInput = {
  localeChain: readonly string[];
  namespace: string;
  sources: readonly CatalogSource[];
};

export function createStaticCatalogSource(id: string, data: StaticCatalogData): CatalogSource {
  return {
    id,
    getLocales: () => Object.keys(data),
    async loadNamespace(locale, namespace) {
      return data[locale]?.[namespace] ?? {};
    }
  };
}

export function getAvailableCatalogLocales(sources: readonly CatalogSource[]) {
  const locales = new Set<string>();

  for (const source of sources) {
    for (const locale of source.getLocales()) {
      locales.add(locale);
    }
  }

  return [...locales].sort();
}

export async function loadCatalogMessages({
  localeChain,
  namespace,
  sources
}: LoadCatalogMessagesInput): Promise<CatalogNamespace> {
  const messages: CatalogNamespace = {};

  for (const locale of localeChain) {
    for (const source of sources) {
      Object.assign(messages, await source.loadNamespace(locale, namespace));
    }
  }

  return messages;
}
