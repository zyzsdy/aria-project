import fs from "node:fs/promises";
import path from "node:path";
import { parse, stringify } from "smol-toml";
import ts from "typescript";
import {
  BUILTIN_LOCALES,
  LOCALES_ROOT,
  collectSourceFiles,
  getLineAndColumn,
  getLiteralString,
  getObjectPropertyLiteral,
  loadSourceFile,
  toAppRelativePath
} from "./i18n-shared.mjs";

const CHECK_MODE = process.argv.includes("--check");

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const descriptorMap = new Map();
  const errors = [];

  for (const filePath of await collectSourceFiles()) {
    const { sourceFile } = await loadSourceFile(filePath);
    visit(sourceFile, (node) => {
      if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) {
        return false;
      }

      if (node.expression.text === "defineMessage") {
        const descriptor = extractSingleDescriptor(node.arguments[0]);
        if (descriptor) {
          registerDescriptor(descriptorMap, errors, descriptor, filePath, sourceFile, node.arguments[0]);
        }
        return true;
      }

      if (node.expression.text === "defineMessages") {
        const descriptors = extractMessageCollection(node.arguments[0]);
        for (const descriptor of descriptors) {
          registerDescriptor(descriptorMap, errors, descriptor, filePath, sourceFile, node.arguments[0]);
        }
        return true;
      }

      return false;
    });
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`error: ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  const descriptorEntries = [...descriptorMap.values()].sort((left, right) =>
    left.key.localeCompare(right.key)
  );
  const namespaceEntries = groupByNamespace(descriptorEntries);
  const writtenFiles = await syncEnglishCatalog(namespaceEntries, CHECK_MODE);
  const translationReport = await buildTranslationReport(namespaceEntries);

  console.log(
    `${CHECK_MODE ? "Checked" : "Updated"} ${descriptorEntries.length} messages across ${namespaceEntries.size} namespaces.`
  );

  if (writtenFiles.length > 0) {
    const verb = CHECK_MODE ? "out-of-date" : "wrote";
    console.log(`${verb} English catalogs:`);
    for (const filePath of writtenFiles) {
      console.log(`  - ${toAppRelativePath(filePath)}`);
    }
  }

  for (const localeReport of translationReport) {
    console.log(`Locale ${localeReport.locale}:`);
    if (localeReport.missing.length === 0 && localeReport.extra.length === 0) {
      console.log("  - complete");
      continue;
    }

    if (localeReport.missing.length > 0) {
      console.log(`  - missing (${localeReport.missing.length})`);
      for (const messageKey of localeReport.missing) {
        console.log(`    ${messageKey}`);
      }
    }

    if (localeReport.extra.length > 0) {
      console.log(`  - extra (${localeReport.extra.length})`);
      for (const messageKey of localeReport.extra) {
        console.log(`    ${messageKey}`);
      }
    }
  }

  if (CHECK_MODE && writtenFiles.length > 0) {
    process.exitCode = 1;
  }
}

function visit(node, visitor) {
  const shouldSkipChildren = visitor(node);
  if (shouldSkipChildren) {
    return;
  }

  ts.forEachChild(node, (child) => visit(child, visitor));
}

function extractSingleDescriptor(node) {
  if (!node || !ts.isObjectLiteralExpression(node)) {
    return undefined;
  }

  const key = getObjectPropertyLiteral(node, "key");
  const defaultMessage = getObjectPropertyLiteral(node, "defaultMessage");
  const description = getObjectPropertyLiteral(node, "description");

  if (!key || !defaultMessage) {
    return undefined;
  }

  return {
    key,
    defaultMessage,
    description
  };
}

function extractMessageCollection(node) {
  if (!node || !ts.isObjectLiteralExpression(node)) {
    return [];
  }

  const descriptors = [];

  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isObjectLiteralExpression(property.initializer)) {
      continue;
    }

    const descriptor = extractSingleDescriptor(property.initializer);
    if (descriptor) {
      descriptors.push(descriptor);
    }
  }

  return descriptors;
}

function registerDescriptor(descriptorMap, errors, descriptor, filePath, sourceFile, node) {
  const existing = descriptorMap.get(descriptor.key);
  const location = getLineAndColumn(sourceFile, node);
  const source = `${toAppRelativePath(filePath)}:${location.line}:${location.column}`;

  if (!existing) {
    descriptorMap.set(descriptor.key, {
      ...descriptor,
      source
    });
    return;
  }

  if (
    existing.defaultMessage !== descriptor.defaultMessage ||
    (existing.description ?? "") !== (descriptor.description ?? "")
  ) {
    errors.push(
      `Conflicting descriptor for ${descriptor.key} at ${source}; existing source ${existing.source}`
    );
  }
}

function groupByNamespace(descriptors) {
  const namespaceEntries = new Map();

  for (const descriptor of descriptors) {
    const namespace = descriptor.key.split(".")[0];
    if (!namespace) {
      continue;
    }

    if (!namespaceEntries.has(namespace)) {
      namespaceEntries.set(namespace, new Map());
    }

    namespaceEntries.get(namespace).set(descriptor.key, descriptor.defaultMessage);
  }

  return namespaceEntries;
}

async function syncEnglishCatalog(namespaceEntries, checkMode) {
  const writtenFiles = [];

  for (const [namespace, messages] of namespaceEntries) {
    const filePath = path.join(LOCALES_ROOT, "en", `${namespace}.toml`);
    const nextDocument = stringifyCatalog(messages);
    const currentDocument = await readOptionalFile(filePath);

    if (currentDocument === nextDocument) {
      continue;
    }

    writtenFiles.push(filePath);
    if (!checkMode) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, nextDocument, "utf8");
    }
  }

  return writtenFiles;
}

async function buildTranslationReport(namespaceEntries) {
  const localeReports = [];

  for (const locale of BUILTIN_LOCALES.filter((value) => value !== "en")) {
    const missing = [];
    const extra = [];

    for (const [namespace, englishMessages] of namespaceEntries) {
      const translatedMessages = await readCatalog(path.join(LOCALES_ROOT, locale, `${namespace}.toml`));
      const englishKeys = [...englishMessages.keys()].sort((left, right) => left.localeCompare(right));
      const translatedKeys = Object.keys(translatedMessages).sort((left, right) => left.localeCompare(right));
      const translatedKeySet = new Set(translatedKeys);
      const englishKeySet = new Set(englishKeys);

      for (const messageKey of englishKeys) {
        if (!translatedKeySet.has(messageKey)) {
          missing.push(messageKey);
        }
      }

      for (const messageKey of translatedKeys) {
        if (!englishKeySet.has(messageKey)) {
          extra.push(messageKey);
        }
      }
    }

    localeReports.push({
      locale,
      missing,
      extra
    });
  }

  return localeReports;
}

async function readCatalog(filePath) {
  const document = await readOptionalFile(filePath);
  if (!document) {
    return {};
  }

  const parsed = parse(document);
  const messages = {};
  flattenCatalog(parsed, [], messages);
  return messages;
}

function flattenCatalog(value, pathSegments, messages) {
  if (typeof value === "string") {
    messages[pathSegments.join(".")] = value;
    return;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    flattenCatalog(child, [...pathSegments, key], messages);
  }
}

function stringifyCatalog(messages) {
  const root = {};

  for (const [messageKey, value] of [...messages.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const segments = messageKey.split(".");
    let cursor = root;

    for (const segment of segments.slice(0, -1)) {
      if (!cursor[segment] || typeof cursor[segment] !== "object" || Array.isArray(cursor[segment])) {
        cursor[segment] = {};
      }
      cursor = cursor[segment];
    }

    cursor[segments[segments.length - 1] ?? messageKey] = value;
  }

  return `${stringify(root).trimEnd()}\n`;
}

async function readOptionalFile(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}
