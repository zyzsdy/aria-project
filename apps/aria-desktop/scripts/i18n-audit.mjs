import ts from "typescript";
import {
  collectSourceFiles,
  getLineAndColumn,
  getLiteralString,
  getPropertyName,
  loadSourceFile,
  looksTranslatable,
  normalizeText,
  toAppRelativePath
} from "./i18n-shared.mjs";

const STRICT_MODE = process.argv.includes("--strict");
const AUDIT_ATTRIBUTES = new Set(["aria-label", "alt", "title", "placeholder"]);

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const findings = [];

  for (const filePath of await collectSourceFiles()) {
    const { sourceFile } = await loadSourceFile(filePath);

    visit(sourceFile, (node) => {
      if (isMessageDescriptorCall(node)) {
        return true;
      }

      const finding = createFinding(filePath, sourceFile, node);
      if (finding) {
        findings.push(finding);
      }

      return false;
    });
  }

  if (findings.length === 0) {
    console.log("No untranslated JSX strings were detected.");
    return;
  }

  console.log(`Found ${findings.length} untranslated UI string candidate(s):`);
  for (const finding of findings) {
    console.log(
      `- ${finding.file}:${finding.line}:${finding.column} [${finding.kind}] ${finding.text}`
    );
  }

  if (STRICT_MODE) {
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

function isMessageDescriptorCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    (node.expression.text === "defineMessage" || node.expression.text === "defineMessages")
  );
}

function createFinding(filePath, sourceFile, node) {
  if (ts.isJsxText(node)) {
    const text = normalizeText(node.getText(sourceFile));
    if (!looksTranslatable(text)) {
      return undefined;
    }

    return toFinding(filePath, sourceFile, node, "jsx-text", text);
  }

  if (ts.isJsxAttribute(node)) {
    const attributeName = node.name.text;
    if (!AUDIT_ATTRIBUTES.has(attributeName)) {
      return undefined;
    }

    const text = normalizeText(getLiteralString(node.initializer) ?? "");
    if (!looksTranslatable(text)) {
      return undefined;
    }

    return toFinding(filePath, sourceFile, node, attributeName, text);
  }

  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "createHtmlTab"
  ) {
    const text = normalizeText(getLiteralString(node.arguments[1]) ?? "");
    if (!looksTranslatable(text)) {
      return undefined;
    }

    return toFinding(filePath, sourceFile, node.arguments[1], "html-tab-title", text);
  }

  if (ts.isPropertyAssignment(node)) {
    const propertyName = getPropertyName(node.name);
    if (!propertyName || !["label", "title", "description", "placeholder"].includes(propertyName)) {
      return undefined;
    }

    if (!ts.isObjectLiteralExpression(node.parent)) {
      return undefined;
    }

    const text = normalizeText(getLiteralString(node.initializer) ?? "");
    if (!looksTranslatable(text)) {
      return undefined;
    }

    return toFinding(filePath, sourceFile, node, `object-${propertyName}`, text);
  }

  return undefined;
}

function toFinding(filePath, sourceFile, node, kind, text) {
  const location = getLineAndColumn(sourceFile, node);
  return {
    file: toAppRelativePath(filePath),
    line: location.line,
    column: location.column,
    kind,
    text
  };
}
