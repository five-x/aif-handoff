import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isFindingRefutedByConfiguredRefutations,
  type AifReviewGateRefutationConfig,
} from "../reviewGateRefutations.js";
import type { AutoReviewFinding } from "../types.js";

describe("isFindingRefutedByConfiguredRefutations", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "review-gate-refutations-"));
    mkdirSync(join(projectRoot, "src", "data"), { recursive: true });
    mkdirSync(join(projectRoot, "src", "types"), { recursive: true });
    writeFileSync(
      join(projectRoot, "src", "types", "domain.ts"),
      ["export interface LoanOffer {", "  id: string;", "}", ""].join("\n"),
      "utf8",
    );
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  function finding(text: string): AutoReviewFinding {
    return {
      id: "finding-1",
      source: "code_review",
      text,
    };
  }

  function refutation(
    override: Partial<AifReviewGateRefutationConfig> = {},
  ): AifReviewGateRefutationConfig {
    return {
      id: "imported-domain-type",
      paths: ["src/data/offers.ts", "src/types/domain.ts"],
      claimPattern: "Duplicate type definition.*LoanOffer",
      proof: {
        type: "imported_type_without_local_declaration",
        symbol: "LoanOffer",
        importerPath: "src/data/offers.ts",
        declarationPath: "src/types/domain.ts",
      },
      ...override,
    };
  }

  it("refutes a configured imported type finding", () => {
    writeFileSync(
      join(projectRoot, "src", "data", "offers.ts"),
      [
        "import type { LoanOffer } from '../types/domain';",
        "export const offers: LoanOffer[] = [];",
        "",
      ].join("\n"),
      "utf8",
    );

    expect(
      isFindingRefutedByConfiguredRefutations({
        projectRoot,
        finding: finding(
          "Duplicate type definition: `src/data/offers.ts` declares local `interface LoanOffer` conflicting with `src/types/domain.ts`.",
        ),
        refutations: [refutation()],
      }),
    ).toBe(true);
  });

  it("refutes inline named type imports", () => {
    writeFileSync(
      join(projectRoot, "src", "data", "offers.ts"),
      [
        "import { type LoanOffer } from '../types/domain';",
        "export const offers: LoanOffer[] = [];",
        "",
      ].join("\n"),
      "utf8",
    );

    expect(
      isFindingRefutedByConfiguredRefutations({
        projectRoot,
        finding: finding(
          "Duplicate type definition: `src/data/offers.ts` declares local `interface LoanOffer` conflicting with `src/types/domain.ts`.",
        ),
        refutations: [refutation()],
      }),
    ).toBe(true);
  });

  it("does not refute without config", () => {
    writeFileSync(
      join(projectRoot, "src", "data", "offers.ts"),
      "import type { LoanOffer } from '../types/domain';\n",
      "utf8",
    );

    expect(
      isFindingRefutedByConfiguredRefutations({
        projectRoot,
        finding: finding(
          "Duplicate type definition: `src/data/offers.ts` declares local `interface LoanOffer` conflicting with `src/types/domain.ts`.",
        ),
        refutations: [],
      }),
    ).toBe(false);
  });

  it("ignores invalid config fail-closed", () => {
    writeFileSync(
      join(projectRoot, "src", "data", "offers.ts"),
      "import type { LoanOffer } from '../types/domain';\n",
      "utf8",
    );

    expect(
      isFindingRefutedByConfiguredRefutations({
        projectRoot,
        finding: finding(
          "Duplicate type definition: `src/data/offers.ts` declares local `interface LoanOffer` conflicting with `src/types/domain.ts`.",
        ),
        refutations: [
          refutation({
            paths: ["../outside.ts"],
          }),
          refutation({
            claimPattern: "[",
          }),
        ],
      }),
    ).toBe(false);
  });

  it("does not refute when the importer declares the symbol locally", () => {
    writeFileSync(
      join(projectRoot, "src", "data", "offers.ts"),
      ["export interface LoanOffer {", "  id: string;", "}", ""].join("\n"),
      "utf8",
    );

    expect(
      isFindingRefutedByConfiguredRefutations({
        projectRoot,
        finding: finding(
          "Duplicate type definition: `src/data/offers.ts` declares local `interface LoanOffer` conflicting with `src/types/domain.ts`.",
        ),
        refutations: [refutation()],
      }),
    ).toBe(false);
  });

  it("infers importer and declaration paths from paths when proof paths are omitted", () => {
    writeFileSync(
      join(projectRoot, "src", "data", "offers.ts"),
      [
        "import type { LoanOffer } from '../types/domain';",
        "export const offers: LoanOffer[] = [];",
        "",
      ].join("\n"),
      "utf8",
    );

    expect(
      isFindingRefutedByConfiguredRefutations({
        projectRoot,
        finding: finding(
          "Duplicate type definition: `src/data/offers.ts` declares local `interface LoanOffer` conflicting with `src/types/domain.ts`.",
        ),
        refutations: [
          {
            id: "inferred-paths",
            paths: ["src/data/offers.ts", "src/types/domain.ts"],
            claimPattern: "Duplicate type definition.*LoanOffer",
            proof: {
              type: "imported_type_without_local_declaration",
              symbol: "LoanOffer",
            },
          },
        ],
      }),
    ).toBe(true);
  });
});
