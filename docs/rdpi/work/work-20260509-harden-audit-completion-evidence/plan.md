# Plan

Task ID: `work-20260509-harden-audit-completion-evidence`

- [x] Add completion evidence metadata for dirty and committed changed files,
      with committed evidence limited to base-vs-HEAD branch diffs.
- [x] Add issue codes and guard logic for committed report requirements.
- [x] Add guard logic for deterministic fallback reports using exact stable
      fallback markers from the observed implementation/report template.
- [x] Add unit coverage for untracked, tracked dirty, staged, and valid
      committed report artifacts, plus deterministic fallback report blocking.
- [x] Run targeted tests and record results in `result.md`.
