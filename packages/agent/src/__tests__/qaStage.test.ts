import { describe, expect, it } from "vitest";
import { parseQaArtifactOutput } from "../subagents/qa.js";

const inventory = [
  { id: "tests", label: "Targeted tests" },
  { id: "review", label: "Review gate evidence" },
];

function artifact(overrides: Record<string, unknown> = {}): string {
  return [
    "```aif-qa-artifact",
    JSON.stringify({
      version: 1,
      stage: "qa",
      status: "passed",
      summary: "QA passed.",
      markdown: "# QA\n\nAll mandatory checks passed.",
      mandatoryChecks: [
        { id: "tests", status: "passed", summary: "Targeted parser tests passed." },
        { id: "review", status: "passed", summary: "Review evidence is present." },
      ],
      optionalChecks: [],
      ...overrides,
    }),
    "```",
  ].join("\n");
}

describe("QA stage artifact parser", () => {
  it("parses passed artifacts with every mandatory inventory id exactly once", () => {
    const parsed = parseQaArtifactOutput(artifact(), inventory);

    expect(parsed).toEqual(
      expect.objectContaining({
        version: 1,
        stage: "qa",
        status: "passed",
        summary: "QA passed.",
        markdown: "# QA\n\nAll mandatory checks passed.",
      }),
    );
    expect(parsed.mandatoryChecks.map((check) => check.id)).toEqual(["tests", "review"]);
  });

  it("rejects passed artifacts when mandatory inventory is empty", () => {
    expect(() => parseQaArtifactOutput(artifact(), [])).toThrow(/non-empty mandatory inventory/i);
  });

  it("rejects passed artifacts when a mandatory inventory item is blocked", () => {
    expect(() =>
      parseQaArtifactOutput(artifact(), [
        ...inventory,
        {
          id: "implementation-manifest:verification-evidence",
          label: "Implementation verification evidence",
          source: "completion_guard",
          blockingReason: "Implementation manifest has no verification evidence.",
        },
      ]),
    ).toThrow(/cannot satisfy blocked mandatory id/i);
  });

  it("rejects duplicate mandatory check ids", () => {
    expect(() =>
      parseQaArtifactOutput(
        artifact({
          mandatoryChecks: [
            { id: "tests", status: "passed", summary: "First." },
            { id: "tests", status: "passed", summary: "Second." },
          ],
        }),
        inventory,
      ),
    ).toThrow(/duplicate mandatory id tests/i);
  });

  it("rejects unknown mandatory check ids", () => {
    expect(() =>
      parseQaArtifactOutput(
        artifact({
          mandatoryChecks: [
            { id: "tests", status: "passed", summary: "Targeted parser tests passed." },
            { id: "unknown", status: "passed", summary: "Not in inventory." },
          ],
        }),
        inventory,
      ),
    ).toThrow(/unknown mandatory id unknown/i);
  });

  it("rejects passed artifacts with missing or non-passed mandatory checks", () => {
    expect(() =>
      parseQaArtifactOutput(
        artifact({
          mandatoryChecks: [
            { id: "tests", status: "passed", summary: "Targeted parser tests passed." },
          ],
        }),
        inventory,
      ),
    ).toThrow(/missing mandatory id/i);

    expect(() =>
      parseQaArtifactOutput(
        artifact({
          mandatoryChecks: [
            { id: "tests", status: "passed", summary: "Targeted parser tests passed." },
            {
              id: "review",
              status: "skipped",
              summary: "Review evidence unavailable.",
              reason: "Review output was not present.",
              risk: "Review defects may remain unresolved.",
            },
          ],
        }),
        inventory,
      ),
    ).toThrow(/non-passed mandatory id/i);
  });

  it("requires reason and risk for skipped optional checks", () => {
    expect(() =>
      parseQaArtifactOutput(
        artifact({
          optionalChecks: [{ id: "smoke", status: "skipped", summary: "Smoke test skipped." }],
        }),
        inventory,
      ),
    ).toThrow(/reason is required/i);

    const parsed = parseQaArtifactOutput(
      artifact({
        optionalChecks: [
          {
            id: "smoke",
            status: "skipped",
            summary: "Smoke test skipped.",
            reason: "No deployed environment exists.",
            risk: "Production-only regressions may remain unobserved.",
          },
        ],
      }),
      inventory,
    );

    expect(parsed.optionalChecks[0]).toEqual(
      expect.objectContaining({
        id: "smoke",
        status: "skipped",
        reason: "No deployed environment exists.",
        risk: "Production-only regressions may remain unobserved.",
      }),
    );
  });
});
