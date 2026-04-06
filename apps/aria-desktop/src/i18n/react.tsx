import React, { useEffect, useMemo, useState, type PropsWithChildren } from "react";
import type { CatalogNamespace } from "./catalog";
import { buildLocaleLoadChain, resolveRequestedLocale } from "./locale";
import type { MessageDescriptor } from "./messages";
import { createMessageFormatter, type MessageValues } from "./runtime";
import { getAvailableCatalogLocales, loadCatalogMessages, type CatalogSource } from "./source";

type I18nContextValue = {
  availableLocales: string[];
  locale: string;
  requestedLocale: string;
  resolvedLocale: string;
  t: (message: MessageDescriptor, values?: MessageValues) => string;
};

const defaultFormatter = createMessageFormatter("en");

const defaultContextValue: I18nContextValue = {
  availableLocales: [],
  locale: "en",
  requestedLocale: "en",
  resolvedLocale: "en",
  t: (message, values) => defaultFormatter(message.defaultMessage, values)
};

const I18nContext = React.createContext<I18nContextValue>(defaultContextValue);

type I18nProviderProps = PropsWithChildren<{
  locale: string;
  namespaces: readonly string[];
  sources: readonly CatalogSource[];
  systemLocale?: string | null;
}>;

export function I18nProvider({ children, locale, namespaces, sources, systemLocale }: I18nProviderProps) {
  const availableLocales = useMemo(() => getAvailableCatalogLocales(sources), [sources]);
  const resolution = useMemo(
    () =>
      resolveRequestedLocale({
        availableLocales,
        requestedLocale: locale,
        systemLocale
      }),
    [availableLocales, locale, systemLocale]
  );
  const [messages, setMessages] = useState<CatalogNamespace>({});
  const formatMessage = useMemo(
    () => createMessageFormatter(resolution.resolvedLocale),
    [resolution.resolvedLocale]
  );

  useEffect(() => {
    let isCurrent = true;

    void (async () => {
      const nextMessages: CatalogNamespace = {};

      for (const namespace of namespaces) {
        Object.assign(
          nextMessages,
          await loadCatalogMessages({
            localeChain: buildLocaleLoadChain({
              availableLocales,
              requestedLocale: locale,
              systemLocale
            }),
            namespace,
            sources
          })
        );
      }

      if (isCurrent) {
        setMessages(nextMessages);
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [availableLocales, locale, namespaces, sources, systemLocale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      availableLocales,
      locale,
      requestedLocale: resolution.requestedLocale,
      resolvedLocale: resolution.resolvedLocale,
      t: (message, values) => formatMessage(messages[message.key] ?? message.defaultMessage, values)
    }),
    [availableLocales, formatMessage, locale, messages, resolution.requestedLocale, resolution.resolvedLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return React.useContext(I18nContext);
}

export function useT() {
  return useI18n().t;
}
