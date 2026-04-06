import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(SCRIPT_ROOT, "..");
export const SRC_ROOT = path.join(APP_ROOT, "src");
export const LOCALES_ROOT = path.join(SRC_ROOT, "i18n", "locales");
export const BUILTIN_LOCALES = ["en", "zh-CN", "ja"];

export async function collectSourceFiles(rootDir = SRC_ROOT) {
  const files = [];
  const pending = [rootDir];

  while (pending.length > 0) {
    const currentDir = pending.pop();
    if (!currentDir) {
      continue;
    }

    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "locales") {
          continue;
        }
        pending.push(absolutePath);
        continue;
      }

      if (!/\.(ts|tsx)$/.test(entry.name)) {
        continue;
      }

      if (/\.test\.(ts|tsx)$/.test(entry.name)) {
        continue;
      }

      files.push(absolutePath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

export async function loadSourceFile(filePath) {
  const sourceText = await fs.readFile(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  return { sourceText, sourceFile };
}

export function getLiteralString(node) {
  if (!node) {
    return undefined;
  }

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  if (ts.isJsxExpression(node)) {
    return getLiteralString(node.expression);
  }

  return undefined;
}

export function getObjectPropertyLiteral(objectLiteral, propertyName) {
  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }

    const name = getPropertyName(property.name);
    if (name !== propertyName) {
      continue;
    }

    return getLiteralString(property.initializer);
  }

  return undefined;
}

export function getPropertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return undefined;
}

export function getLineAndColumn(sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    line: line + 1,
    column: character + 1
  };
}

export function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

export function looksTranslatable(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return false;
  }

  if (/^[0-9._/:\-]+$/u.test(normalized)) {
    return false;
  }

  if (/^(https?:\/\/|www\.)/iu.test(normalized)) {
    return false;
  }

  if (/^[\w.-]+\/[\w./-]+$/u.test(normalized) || /^[\w.-]+\.[A-Za-z]{2,}(\/.*)?$/u.test(normalized)) {
    return false;
  }

  return /[\p{L}\p{Script=Han}]/u.test(normalized);
}

export function toAppRelativePath(filePath) {
  return path.relative(APP_ROOT, filePath).split(path.sep).join("/");
}
