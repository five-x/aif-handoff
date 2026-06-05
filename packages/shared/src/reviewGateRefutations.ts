import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { AutoReviewFinding } from "./types.js";
import type {
  AifReviewGateImportedTypeWithoutLocalDeclarationProof,
  AifReviewGateRefutationConfig,
} from "./projectConfig.js";

export type {
  AifReviewGateImportedTypeWithoutLocalDeclarationProof,
  AifReviewGateRefutationConfig,
  AifReviewGateRefutationProof,
} from "./projectConfig.js";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePathText(pathValue: string): string {
  return pathValue
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "");
}

function isSafeRelativePath(pathValue: string): boolean {
  const normalized = normalizePathText(pathValue);
  return (
    normalized.length > 0 &&
    !normalized.startsWith("/") &&
    !/^[a-z]:\//i.test(normalized) &&
    !normalized.split("/").includes("..")
  );
}

function resolveProjectPath(projectRoot: string, pathValue: string): string | null {
  if (!isSafeRelativePath(pathValue)) return null;
  const root = resolve(projectRoot);
  const candidate = resolve(root, normalizePathText(pathValue));
  const relativePath = relative(root, candidate);
  if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return null;
  }
  return candidate;
}

function readProjectFile(projectRoot: string, pathValue: string): string | null {
  const resolved = resolveProjectPath(projectRoot, pathValue);
  if (!resolved || !existsSync(resolved)) return null;
  try {
    return readFileSync(resolved, "utf8");
  } catch {
    return null;
  }
}

function patternMatches(pattern: string, text: string): boolean {
  try {
    return new RegExp(pattern, "i").test(text);
  } catch {
    return false;
  }
}

function findingReferencesScopedPath(findingText: string, paths: string[]): boolean {
  const normalizedText = findingText.replaceAll("\\", "/");
  return paths.some((path) => normalizedText.includes(normalizePathText(path)));
}

function declaresSymbol(fileText: string, symbol: string): boolean {
  const escaped = escapeRegExp(symbol);
  return new RegExp(
    `(?:^|\\n)\\s*(?:export\\s+)?(?:interface|type|class)\\s+${escaped}\\b`,
    "m",
  ).test(fileText);
}

function importedSymbols(sourceText: string): Array<{ symbols: string[]; from: string }> {
  const imports: Array<{ symbols: string[]; from: string }> = [];
  const importPattern = /\bimport\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["'];?/gm;
  for (const match of sourceText.matchAll(importPattern)) {
    const symbols = (match[1] ?? "")
      .split(",")
      .map(
        (raw) =>
          raw
            .trim()
            .replace(/^type\s+/i, "")
            .split(/\s+as\s+/i)[0]
            ?.trim() ?? "",
      )
      .filter(Boolean);
    const from = match[2]?.trim() ?? "";
    if (symbols.length > 0 && from) {
      imports.push({ symbols, from });
    }
  }
  return imports;
}

function importSourceMatchesDeclaration(input: {
  projectRoot: string;
  importerPath: string;
  declarationPath: string;
  importSource: string;
  importFromPattern?: string;
}): boolean {
  if (input.importFromPattern && patternMatches(input.importFromPattern, input.importSource)) {
    return true;
  }

  if (!input.importSource.startsWith(".")) return false;
  const importerAbsolute = resolveProjectPath(input.projectRoot, input.importerPath);
  const declarationAbsolute = resolveProjectPath(input.projectRoot, input.declarationPath);
  if (!importerAbsolute || !declarationAbsolute) return false;

  const resolvedImport = resolve(dirname(importerAbsolute), input.importSource);
  const candidates = [
    resolvedImport,
    `${resolvedImport}.ts`,
    `${resolvedImport}.tsx`,
    `${resolvedImport}.js`,
    `${resolvedImport}.jsx`,
    resolve(resolvedImport, "index.ts"),
    resolve(resolvedImport, "index.tsx"),
    resolve(resolvedImport, "index.js"),
    resolve(resolvedImport, "index.jsx"),
  ];
  return candidates.some((candidate) => candidate === declarationAbsolute);
}

function importedTypeProofSucceeds(input: {
  projectRoot: string;
  paths: string[];
  proof: AifReviewGateImportedTypeWithoutLocalDeclarationProof;
}): boolean {
  const scopedPaths = input.paths.map(normalizePathText);
  const importerPaths = input.proof.importerPath
    ? [normalizePathText(input.proof.importerPath)]
    : scopedPaths;
  const declarationPaths = input.proof.declarationPath
    ? [normalizePathText(input.proof.declarationPath)]
    : scopedPaths;

  for (const importerPath of importerPaths) {
    const importerText = readProjectFile(input.projectRoot, importerPath);
    if (!importerText || declaresSymbol(importerText, input.proof.symbol)) continue;

    for (const declarationPath of declarationPaths) {
      if (declarationPath === importerPath) continue;
      const declarationText = readProjectFile(input.projectRoot, declarationPath);
      if (!declarationText || !declaresSymbol(declarationText, input.proof.symbol)) continue;

      const matchingImport = importedSymbols(importerText).some(
        (importStatement) =>
          importStatement.symbols.includes(input.proof.symbol) &&
          importSourceMatchesDeclaration({
            projectRoot: input.projectRoot,
            importerPath,
            declarationPath,
            importSource: importStatement.from,
            importFromPattern: input.proof.importFromPattern,
          }),
      );
      if (matchingImport) return true;
    }
  }

  return false;
}

function isFindingRefutedByConfig(input: {
  projectRoot: string;
  finding: AutoReviewFinding;
  refutation: AifReviewGateRefutationConfig;
}): boolean {
  const { refutation } = input;
  if (
    !refutation.id ||
    refutation.paths.length === 0 ||
    !refutation.paths.every(isSafeRelativePath) ||
    !findingReferencesScopedPath(input.finding.text, refutation.paths) ||
    !patternMatches(refutation.claimPattern, input.finding.text)
  ) {
    return false;
  }

  if (refutation.proof.type !== "imported_type_without_local_declaration") {
    return false;
  }

  return importedTypeProofSucceeds({
    projectRoot: input.projectRoot,
    paths: refutation.paths,
    proof: refutation.proof,
  });
}

export function isFindingRefutedByConfiguredRefutations(input: {
  projectRoot: string;
  finding: AutoReviewFinding;
  refutations: AifReviewGateRefutationConfig[];
}): boolean {
  return input.refutations.some((refutation) =>
    isFindingRefutedByConfig({
      projectRoot: input.projectRoot,
      finding: input.finding,
      refutation,
    }),
  );
}
