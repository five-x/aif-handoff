# Design

## Boundary

Implement a deterministic pre-implementation size gate for development implementation tasks. Do not redesign roadmap decomposition or implement automatic split-child execution.

## Contract

Add one new plan-quality issue code: `task_size_split_required`.

The issue message must start with `split_required:` and name the split dimensions that made the card too large or ambiguous. Candidate dimensions:

- `file_boundaries`: manifest paths are broad directories/placeholders instead of concrete files or narrow file groups.
- `changed_file_groups`: manifest paths span more file groups than a single executable card should own.
- `major_subsystems`: manifest paths span multiple major repo/package areas.
- `verification_surface`: manifest verification commands imply a broad setup/runtime surface.
- `ambiguity`: task or plan text uses broad scaffold language such as skeleton application, local dev stack, base configuration, full stack, or end-to-end build.

## Validation shape

Run the size gate for executable implementation tasks: `feature`, `fix`, `docs`, `tests`, and explicit `general` cards. Diagnostic `audit` and `spike` plans keep their existing validation paths.

The gate uses this exact deterministic rule table:

| Dimension              | Exact rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `file_boundaries`      | True when the normalized manifest boundary path set is empty, contains a placeholder (`n/a`, `none`, `tbd`, `todo`, `unknown`, `later`, `manual`, `repo`, `repository`, `codebase`, `project`, `application`, `app`, `everything`), contains `.`, `./`, `/`, or contains a broad directory boundary. Broad directory boundaries are `packages`, `apps`, `src`, `test`, `tests`, `__tests__`, `config`, `scripts`, `docs`, `migrations`, `packages/<name>`, `apps/<name>`, or any path ending in `/*` or `/**`. |
| `changed_file_groups`  | True when the normalized manifest boundary path set maps to more than 2 changed file groups. Root config files map to `root-config`; package paths map to `packages/<pkg>/<area>` where `<area>` is `src`, `tests`, `config`, or the first non-package segment; app paths map similarly; top-level `src`, `docs`, `scripts`, and `config` paths map to their top-level group.                                                                                                                                  |
| `major_subsystems`     | True when boundaries map to more than 1 major subsystem. Package paths map to `packages/<pkg>`; app paths map to `apps/<app>`; root config files map to `root-config`; top-level source/docs/scripts/config paths map to that top-level subsystem.                                                                                                                                                                                                                                                             |
| `verification_surface` | True when `verificationCommands.length > 4`, or any normalized command is a setup/runtime/dev-stack command: `npm install`, `npm ci`, `pnpm install`, `yarn install`, `bun install`, `npm run dev`, `pnpm dev`, `yarn dev`, `bun dev`, `turbo dev`, `docker compose up`, `docker-compose up`, `docker build`, `docker compose build`, `vite --host`, `playwright test` against localhost, `curl localhost`, `curl 127.0.0.1`, or `node dist/...`.                                                              |
| `ambiguity`            | True when task title, description, plan body, or manifest JSON includes broad implementation terms: `skeleton application`, `application skeleton`, `project architecture`, `core engine skeleton`, `local dev stack`, `dev stack`, `base configuration`, `baseline configuration`, `scaffold`, `scaffolding`, `full stack`, `entire app`, `complete setup`, `end-to-end build`, `project setup`, or `architecture and core engine`.                                                                           |

The final reject predicate is:

- reject immediately when `file_boundaries` is true;
- reject when `changed_file_groups` and `major_subsystems` are both true;
- reject when `changed_file_groups` and `ambiguity` are both true;
- reject when `major_subsystems` and `ambiguity` are both true;
- reject when `verification_surface` and at least one of `changed_file_groups`, `major_subsystems`, or `ambiguity` is true;
- reject when the changed file group count is greater than 3 even if no broad language is present;
- reject when the major subsystem count is greater than 2 even if no broad language is present.

For executable no-manifest plans, apply a text-only version of the same gate before implementation:

- collect repo paths and concrete source roots from task text and plan text;
- collect concrete verification commands from plan lines;
- reject with `task_size_split_required` when broad scaffold/dev-stack/base-configuration language is present and the plan lacks concrete file boundaries, lacks concrete verification commands, names broad boundaries, spans too many groups/subsystems, or uses setup/runtime commands;
- preserve genuinely narrow fast tasks without manifests.

Operator-readable issue text must include observed counts and dimensions, for example:

`split_required: task is too broad for one implementation card (dimensions: changed_file_groups=3>2, major_subsystems=2>1, verification_surface=setup_runtime_command:npm install, ambiguity=project architecture). Split into children with concrete file boundaries, acceptance checks, and verification commands.`

Deterministic examples:

- Fail: `package.json`, `tsconfig.json`, `.gitignore`, `src/index.ts`, and `src/core/types.ts` for “Setup Project Architecture and Core Engine Skeleton” with `npm install`, `npm run build`, and `node dist/index.js`.
- Fail: any manifest boundary of `packages/api`, `src`, `packages`, `repo`, or `packages/api/**`.
- Pass: `packages/shared/src/planQuality.ts` plus `packages/shared/src/__tests__/planQuality.test.ts` with a focused `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planQuality.test.ts`.
- Pass: a roadmap-created child whose description and manifest scope name one concrete file or one package-local source/test pair, with acceptance criteria and focused verification commands.
- Fail: an explicit `taskIntent: "general"` roadmap child with a broad manifest for skeleton application, local dev stack, and base configuration.
- Fail: a broad fast/no-manifest checklist plan for skeleton application, local dev stack, and base configuration.
- Fail: a broad fast/no-manifest plain-bullet plan for skeleton application, local dev stack, and base configuration before invoking the plan-checker model.

## Integration points

- `packages/shared/src/planQuality.ts`
  - Add the issue code and helper functions.
  - Include size-gate issues in `evaluateTaskPlanQuality`.
  - Keep the existing `aif-plan-manifest` schema valid for narrow tasks.
- `packages/shared/src/taskCompletionEvidence.ts`
  - Reuse `evaluateTaskPlanQuality` during `phase: "pre_implementation"` and surface plan-quality issues as completion-evidence blockers. This protects manual `start_implementation`.
  - This also protects the existing coordinator auto-mode pre-implementer hook, because it already calls the pre-implementation evidence guard before entering `implementing`.
- `packages/agent/src/subagents/planner.ts`
  - Update prompt guidance to tell planners to split broad/multi-area implementation cards instead of writing a broad manifest.
- `packages/agent/src/subagents/planChecker.ts`
  - Update repair guidance to preserve the deterministic size contract and return split-required feedback for broad implementation plans.
  - Run a size-only deterministic plan-quality guard before invoking the plan-checker model, so broad no-manifest plans fail closed while ordinary checklist-format issues remain repairable.

## Tests

- Shared plan-quality tests:
  - broad scaffold/local dev stack/base config plan is rejected with `task_size_split_required`;
  - narrow concrete single-file/source+test plan still passes;
  - narrow roadmap-created child with concrete boundaries still passes.
- Shared pre-implementation evidence test:
  - a broad plan-ready task gets a pre-implementation blocker before runtime handoff.
- Agent plan-checker test:
  - broad full-mode plan is rejected locally before invoking the model.
  - broad fast/no-manifest checklist and plain-bullet plans are rejected locally before invoking the model.
- API task event test:
  - manual `start_implementation` on a broad plan-ready task moves to `blocked_external` with `split_required` and does not enter implementation.
- Coordinator test:
  - auto-mode `plan_ready` broad plans block before `runImplementer` is called, or existing plan-quality pre-implementer coverage is extended to include `task_size_split_required`.

## Risks

- Over-strict limits could block legitimate cross-layer tasks. Keep thresholds conservative and require broad language plus multiple split dimensions for the common cross-file case.
- Under-strict limits could miss broad plans with polished manifests. Include deterministic path, subsystem, and verification-surface checks even when text is polished.
