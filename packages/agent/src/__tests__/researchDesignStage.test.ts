import { describe, expect, it } from "vitest";
import { parseStageArtifactOutput } from "../subagents/researchDesignStage.js";

describe("research/design stage artifact parser", () => {
  it("parses accepted stage artifacts", () => {
    const parsed = parseStageArtifactOutput(
      [
        "```aif-stage-artifact",
        JSON.stringify({
          version: 1,
          stage: "research",
          status: "accepted",
          summary: "Research is sufficient.",
          markdown: "# Research\n\nFindings.",
          questions: [],
        }),
        "```",
      ].join("\n"),
      "research",
    );

    expect(parsed).toEqual(
      expect.objectContaining({
        version: 1,
        stage: "research",
        status: "accepted",
        summary: "Research is sufficient.",
        markdown: "# Research\n\nFindings.",
      }),
    );
  });

  it("requires questions when output asks for clarification", () => {
    expect(() =>
      parseStageArtifactOutput(
        [
          "```aif-stage-artifact",
          JSON.stringify({
            version: 1,
            stage: "design",
            status: "questions",
            summary: "Design needs a decision.",
            markdown: null,
            questions: [],
          }),
          "```",
        ].join("\n"),
        "design",
      ),
    ).toThrow(/questions must be non-empty/i);
  });

  it("rejects mismatched stages", () => {
    expect(() =>
      parseStageArtifactOutput(
        [
          "```aif-stage-artifact",
          JSON.stringify({
            version: 1,
            stage: "research",
            status: "accepted",
            summary: "Wrong stage.",
            markdown: "# Research",
            questions: [],
          }),
          "```",
        ].join("\n"),
        "design",
      ),
    ).toThrow(/stage must be design/i);
  });
});
