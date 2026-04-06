import { IntlMessageFormat } from "intl-messageformat";
import type { CatalogNamespace } from "./catalog";
import type { MessageDescriptor } from "./messages";

export type MessageValues = Record<string, unknown>;

type TranslateMessageInput = {
  locale: string;
  messages: CatalogNamespace;
  message: MessageDescriptor;
  values?: MessageValues;
};

export function createMessageFormatter(locale: string) {
  const cache = new Map<string, IntlMessageFormat>();

  return (message: string, values?: MessageValues) => {
    const formatter = getOrCreateFormatter(cache, locale, message);
    const result = formatter.format(values);

    return Array.isArray(result) ? result.join("") : String(result);
  };
}

export function translateMessage({ locale, messages, message, values }: TranslateMessageInput) {
  const formatMessage = createMessageFormatter(locale);
  return formatMessage(messages[message.key] ?? message.defaultMessage, values);
}

function getOrCreateFormatter(
  cache: Map<string, IntlMessageFormat>,
  locale: string,
  message: string
) {
  const cacheKey = `${locale}::${message}`;
  const existing = cache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const formatter = new IntlMessageFormat(message, locale);
  cache.set(cacheKey, formatter);
  return formatter;
}
