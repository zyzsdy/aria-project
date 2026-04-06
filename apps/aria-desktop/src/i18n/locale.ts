const DEFAULT_FALLBACK_LOCALE = "en";

type LocaleResolutionInput = {
  availableLocales: readonly string[];
  requestedLocale: string;
  systemLocale?: string | null;
  fallbackLocale?: string;
};

export type LocaleResolution = {
  requestedLocale: string;
  resolvedLocale: string;
  loadChain: string[];
};

export function resolveRequestedLocale(input: LocaleResolutionInput): LocaleResolution {
  const availableLocales = uniqueCanonicalLocales(input.availableLocales);
  const fallbackLocale = resolveAvailableLocale(
    canonicalizeLocale(input.fallbackLocale ?? DEFAULT_FALLBACK_LOCALE),
    availableLocales,
    undefined
  ) ?? availableLocales[0] ?? DEFAULT_FALLBACK_LOCALE;
  const requestedLocale =
    input.requestedLocale === "system"
      ? canonicalizeLocale(input.systemLocale) ?? fallbackLocale
      : canonicalizeLocale(input.requestedLocale) ?? fallbackLocale;
  const loadChain = buildLocaleLoadChain({ ...input, fallbackLocale });

  return {
    requestedLocale,
    resolvedLocale: loadChain[loadChain.length - 1] ?? fallbackLocale,
    loadChain
  };
}

export function buildLocaleLoadChain(input: LocaleResolutionInput): string[] {
  const availableLocales = uniqueCanonicalLocales(input.availableLocales);
  const fallbackLocale = resolveAvailableLocale(
    canonicalizeLocale(input.fallbackLocale ?? DEFAULT_FALLBACK_LOCALE),
    availableLocales,
    undefined
  ) ?? availableLocales[0] ?? DEFAULT_FALLBACK_LOCALE;
  const requestedLocale =
    input.requestedLocale === "system"
      ? canonicalizeLocale(input.systemLocale)
      : canonicalizeLocale(input.requestedLocale);

  const chain: string[] = [];
  pushUnique(chain, fallbackLocale);

  if (!requestedLocale) {
    return chain;
  }

  const baseLocale = requestedLocale.split("-")[0] ?? requestedLocale;
  const exactMatch = resolveAvailableLocale(requestedLocale, availableLocales, baseLocale);
  const baseMatch = resolveAvailableLocale(baseLocale, availableLocales, baseLocale);

  if (baseMatch && baseMatch !== fallbackLocale && baseMatch !== exactMatch) {
    pushUnique(chain, baseMatch);
  }

  if (exactMatch && exactMatch !== fallbackLocale) {
    pushUnique(chain, exactMatch);
  }

  if (!exactMatch && !baseMatch) {
    const languageMatch = availableLocales.find((locale) => locale.startsWith(`${baseLocale}-`));
    if (languageMatch && languageMatch !== fallbackLocale) {
      pushUnique(chain, languageMatch);
    }
  }

  return chain;
}

function resolveAvailableLocale(
  locale: string | undefined,
  availableLocales: readonly string[],
  baseLocale?: string
) {
  if (!locale) {
    return undefined;
  }

  if (availableLocales.includes(locale)) {
    return locale;
  }

  const language = baseLocale ?? locale.split("-")[0] ?? locale;
  if (availableLocales.includes(language)) {
    return language;
  }

  return availableLocales.find((candidate) => candidate.startsWith(`${language}-`));
}

function uniqueCanonicalLocales(locales: readonly string[]) {
  const seen = new Set<string>();
  const canonical = locales
    .map((locale) => canonicalizeLocale(locale))
    .filter((locale): locale is string => locale !== undefined)
    .filter((locale) => {
      if (seen.has(locale)) {
        return false;
      }
      seen.add(locale);
      return true;
    });

  return canonical;
}

function canonicalizeLocale(locale: string | null | undefined) {
  if (!locale) {
    return undefined;
  }

  try {
    return Intl.getCanonicalLocales(locale)[0];
  } catch {
    return undefined;
  }
}

function pushUnique(values: string[], value: string) {
  if (!values.includes(value)) {
    values.push(value);
  }
}
