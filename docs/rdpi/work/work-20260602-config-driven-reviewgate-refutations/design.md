# Design - work-20260602-config-driven-reviewgate-refutations

## Approach

Add a shared, config-driven refutation layer and make ReviewGate call that layer before deciding whether a parsed blocker remains actionable. Keep generic refutations generic, and move the LoanOffer-specific terms into test/project config.

## Config schema

Extend `AifProjectConfig` with:

```ts
reviewGateRefutations: Array<{
  id: string;
  paths: string[];
  claimPattern: string;
  proof: {
    type: "imported_type_without_local_declaration";
    symbol: string;
    importerPath?: string;
    declarationPath?: string;
    importFromPattern?: string;
  };
}>;
```

The task example shows `proof.type`; the implementation will require a generic `symbol` for this proof type so the provider does not hardcode project terms. `paths` scopes the review finding text and can also supply the importer/declaration paths when the proof omits explicit path fields.

## Provider behavior

- New shared module: `packages/shared/src/reviewGateRefutations.ts`.
- Export types plus `isFindingRefutedByConfiguredRefutations`.
- A configured refutation matches only when:
  - the refutation has a non-empty `id`;
  - all configured `paths` are safe relative paths;
  - the finding text references at least one scoped path;
  - `claimPattern` compiles and matches the finding text;
  - the proof handler succeeds.
- Proof `imported_type_without_local_declaration` succeeds only when:
  - the importer file exists under `projectRoot`;
  - the declaration file exists under `projectRoot`;
  - the declaration file declares `interface`, `type`, or `class` for `proof.symbol`;
  - the importer file does not declare that symbol locally;
  - the importer imports that symbol from the declaration path or configured import source pattern.
- Invalid config entries are ignored, not thrown. This preserves fail-closed ReviewGate behavior: invalid config cannot auto-refute a blocker.

## ReviewGate integration

- Import `getProjectConfig` and `isFindingRefutedByConfiguredRefutations` from `@aif/shared`.
- Remove the private `isRefutedLoanOfferDuplicateFinding` helper and its hardcoded paths/terms from `packages/agent/src/reviewGate.ts`.
- Keep the generic JSON syntax refutation path as-is unless moving it is mechanically simpler.
- `filterRefutedRepositoryFindings` will consult `getProjectConfig(projectRoot).reviewGateRefutations` for configured refutations and then apply generic JSON syntax refutation.

## Tests

- Extend project config tests for default empty `reviewGateRefutations`, valid config parsing, and invalid entries being ignored.
- Add shared provider tests for:
  - config-driven imported-type refutation works;
  - missing config does not refute;
  - invalid config does not refute;
  - local declaration prevents refutation.
- Update agent ReviewGate tests so the LoanOffer behavior is preserved only when the temp repo writes `.ai-factory/config.yaml` with a configured refutation.
- Add a guard test that `packages/agent/src/reviewGate.ts` no longer contains the LoanOffer/project path literals.

## Risks and mitigations

- Regex config can be overbroad. Keep it scoped by paths and proof checks; an overbroad claim pattern alone is insufficient.
- Path traversal must remain blocked. Reuse safe project-root containment checks in the shared provider.
- Invalid config should not weaken blocking behavior. Ignoring malformed entries makes the ReviewGate deterministic and conservative.
