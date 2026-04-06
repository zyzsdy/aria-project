import { parse, stringify } from "smol-toml";

export type CatalogNamespace = Record<string, string>;

export type ParsedCatalogToml = {
  messages: CatalogNamespace;
};

export function parseCatalogToml(document: string): ParsedCatalogToml {
  const parsed = parse(document) as Record<string, unknown>;
  const messages: CatalogNamespace = {};
  flattenCatalogNode(parsed, [], messages);
  return { messages };
}

export function stringifyCatalogToml(messages: CatalogNamespace): string {
  const root: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(messages)) {
    const path = key.split(".");
    let cursor = root;

    for (const segment of path.slice(0, -1)) {
      const next = cursor[segment];
      if (!next || typeof next !== "object" || Array.isArray(next)) {
        cursor[segment] = {};
      }
      cursor = cursor[segment] as Record<string, unknown>;
    }

    const leafKey = path[path.length - 1] ?? key;
    cursor[leafKey] = value;
  }

  return stringify(root);
}

function flattenCatalogNode(
  value: unknown,
  path: string[],
  messages: CatalogNamespace
) {
  if (typeof value === "string") {
    messages[path.join(".")] = value;
    return;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Unsupported catalog value at ${path.join(".") || "<root>"}`);
  }

  for (const [key, child] of Object.entries(value)) {
    flattenCatalogNode(child, [...path, key], messages);
  }
}
