# Audit: architecture and ownership boundaries

No validated findings.

The previous candidate findings did not meet the audit finding contract for concrete technical defects. They were removed instead of being rephrased.

## Risk Hypotheses

- risk-architecture-and-ownership-boundaries-1: README.md may encode unclear ownership, circular dependencies, or cross-module routing that would make task changes unsafe; (scope: `README.md`)
- risk-architecture-and-ownership-boundaries-2: AGENTS.md may encode unclear ownership, circular dependencies, or cross-module routing that would make task changes unsafe; (scope: `AGENTS.md`)
- risk-architecture-and-ownership-boundaries-3: pyproject.toml may encode unclear ownership, circular dependencies, or cross-module routing that would make task changes unsafe; (scope: `pyproject.toml`)
- risk-architecture-and-ownership-boundaries-4: src/bot_intevra/**init**.py may encode unclear ownership, circular dependencies, or cross-module routing that would make task changes unsafe; (scope: `src/bot_intevra/__init__.py`)
- risk-architecture-and-ownership-boundaries-5: src/bot_intevra/**main**.py may encode unclear ownership, circular dependencies, or cross-module routing that would make task changes unsafe; (scope: `src/bot_intevra/__main__.py`)
- risk-architecture-and-ownership-boundaries-6: src/bot_intevra/attachments.py may encode unclear ownership, circular dependencies, or cross-module routing that would make task changes unsafe (scope: `src/bot_intevra/attachments.py`)

## Evidence Register

| Scope                            | Checked evidence                                                                                           | Verification                                                                                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                      | `AGENTS.md:3`, `AGENTS.md:5`, `AGENTS.md:7`                                                                | Command `git grep -n . -- AGENTS.md` output includes `AGENTS.md:1:<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->`                             |
| `README.md`                      | `README.md:3`, `README.md:5`, `README.md:6`                                                                | Command `git grep -n . -- README.md` output includes `README.md:1:# Solo Memory Bot`                                                                                                   |
| `pyproject.toml`                 | `pyproject.toml:1`, `pyproject.toml:2`, `pyproject.toml:3`                                                 | Command `git grep -n . -- pyproject.toml` output includes `pyproject.toml:1:[build-system]`                                                                                            |
| `src/bot_intevra/__init__.py`    | `src/bot_intevra/__init__.py:1`, `src/bot_intevra/__init__.py:3`, `src/bot_intevra/__init__.py:5`          | Command `git grep -n . -- src/bot_intevra/__init__.py` output includes `src/bot_intevra/__init__.py:1:"""Single-user Telegram bot with local inbox storage and Shared Memory sync."""` |
| `src/bot_intevra/__main__.py`    | `src/bot_intevra/__main__.py:1`, `src/bot_intevra/__main__.py:4`, `src/bot_intevra/__main__.py:5`          | Command `git grep -n . -- src/bot_intevra/__main__.py` output includes `src/bot_intevra/__main__.py:1:from bot_intevra.cli import main`                                                |
| `src/bot_intevra/attachments.py` | `src/bot_intevra/attachments.py:1`, `src/bot_intevra/attachments.py:3`, `src/bot_intevra/attachments.py:4` | Command `git grep -n . -- src/bot_intevra/attachments.py` output includes `src/bot_intevra/attachments.py:1:from __future__ import annotations`                                        |

## No-Findings Claims

- Absence reasoning: risk-architecture-and-ownership-boundaries-1 covered `README.md:3`, `README.md:5`, `README.md:6`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-architecture-and-ownership-boundaries-2 covered `AGENTS.md:3`, `AGENTS.md:5`, `AGENTS.md:7`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-architecture-and-ownership-boundaries-3 covered `pyproject.toml:1`, `pyproject.toml:2`, `pyproject.toml:3`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-architecture-and-ownership-boundaries-4 covered `src/bot_intevra/__init__.py:1`, `src/bot_intevra/__init__.py:3`, `src/bot_intevra/__init__.py:5`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-architecture-and-ownership-boundaries-5 covered `src/bot_intevra/__main__.py:1`, `src/bot_intevra/__main__.py:4`, `src/bot_intevra/__main__.py:5`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-architecture-and-ownership-boundaries-6 covered `src/bot_intevra/attachments.py:1`, `src/bot_intevra/attachments.py:3`, `src/bot_intevra/attachments.py:4`; no actionable finding was identified in the scoped inspection.

## Risk-Specific Evidence

- risk-architecture-and-ownership-boundaries-5 / `src/bot_intevra/__main__.py`: Command `git grep -n -m 1 -E "main__|encode|unclear|ownership|circular|dependencies" -- src/bot_intevra/__main__.py` output includes `src/bot_intevra/__main__.py:4:if __name__ == "__main__":`

## Checked Files

- `AGENTS.md:3`
- `AGENTS.md:5`
- `AGENTS.md:7`
- `README.md:3`
- `README.md:5`
- `README.md:6`
- `pyproject.toml:1`
- `pyproject.toml:2`
- `pyproject.toml:3`
- `src/bot_intevra/__init__.py:1`
- `src/bot_intevra/__init__.py:3`
- `src/bot_intevra/__init__.py:5`
- `src/bot_intevra/__main__.py:1`
- `src/bot_intevra/__main__.py:4`
- `src/bot_intevra/__main__.py:5`
- `src/bot_intevra/attachments.py:1`
- `src/bot_intevra/attachments.py:3`
- `src/bot_intevra/attachments.py:4`

## Checked Commands

- Command `git grep -n . -- AGENTS.md` output:

```
AGENTS.md:1:<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->
AGENTS.md:3:# Repository Guidelines
AGENTS.md:5:This file is compiled from global and project GPTI sources.
AGENTS.md:7:## Layering
AGENTS.md:9:- Global source root: `C:\Users\apron\.codex\gpti`
AGENTS.md:10:- Project source root: `C:\Users\apron\source\botIntevra\.codex\gpti`
AGENTS.md:12:## Project Summary
AGENTS.md:14:<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->
AGENTS.md:16:# Project Identity
AGENTS.md:18:- Project: botIntevra
AGENTS.md:19:- Preset: python
AGENTS.md:20:- Description: Single-user Telegram memory bot with local SQLite storage, review flow, and Shared Memory sync.
AGENTS.md:22:# Working Agreements
AGENTS.md:24:- Keep repository-specific runtime guidance in this file and in `.codex/gpti/profiles/`.
AGENTS.md:25:- Keep long-lived operational knowledge in `docs/kb/` and `docs/ops/`.
AGENTS.md:26:- Keep reusable memory artifacts in `docs/memory/`.
AGENTS.md:28:# Commands
AGENTS.md:30:- Build: python -m compileall src
AGENTS.md:31:- Test: python -m pytest -q
AGENTS.md:32:- Lint: python -m compileall src tests
AGENTS.md:33:- Run: python -m bot_intevra run-bot
AGENTS.md:35:# Rollout and Migrations
AGENTS.md:37:- Record rollout notes and migration procedures in `docs/ops/runbook.md`.
AGENTS.md:38:- Keep environment-specific secrets outside the repository and outside shared memory.
[... truncated 53 additional line(s) ...]
```

- Command `git grep -n . -- README.md` output:

```
README.md:1:# Solo Memory Bot
README.md:3:Minimal MVP for a single-user Telegram bot that:
README.md:5:- saves every incoming note into a local inbox first;
README.md:6:- stores PDF and voice artifacts locally before any curation;
README.md:7:- normalizes each note into a review draft with an internal LLM before any publish;
README.md:8:- publishes curated non-secret notes into Shared Memory only on explicit review;
README.md:9:- answers questions from local notes and from LightRAG-backed Shared Memory.
README.md:11:## Why this shape
README.md:13:The local repo docs and live checks in this workspace show two practical constraints:
README.md:15:- Shared Memory is for searchable non-secret knowledge, not for raw secrets.
README.md:16:- The live query path can return `no-context` in `local` mode, so the bot should not rely on one blind query mode.
README.md:18:Because of that, this MVP uses a two-layer design:
README.md:20:1. `Local inbox`
README.md:21:   - SQLite database plus markdown mirrors under `data/bot-intevra/inbox/`
README.md:22:   - source of truth for raw notes and ideas
README.md:23:2. `Shared Memory`
README.md:24:   - curated facts, status snapshots, and explicitly published notes
README.md:25:   - queried with managed fallback: `local -> hybrid -> naive`
README.md:26:3. `Normalizer`
README.md:27:   - OpenAI-compatible local LLM endpoint for turning raw text into structured drafts
README.md:28:   - can ask clarification questions instead of publishing low-context notes
README.md:29:4. `Voice transcription`
README.md:30:   - optional OpenAI-compatible transcription endpoint for Telegram voice notes
README.md:31:   - failed or unavailable transcription still produces an explicit blocked review draft instead of silently dropping the input
[... truncated 124 additional line(s) ...]
```

- Command `git grep -n . -- pyproject.toml` output:

```
pyproject.toml:1:[build-system]
pyproject.toml:2:requires = ["setuptools>=69"]
pyproject.toml:3:build-backend = "setuptools.build_meta"
pyproject.toml:5:[project]
pyproject.toml:6:name = "bot-intevra"
pyproject.toml:7:version = "0.1.0"
pyproject.toml:8:description = "Single-user Telegram bot with local inbox storage and Shared Memory sync."
pyproject.toml:9:readme = "README.md"
pyproject.toml:10:requires-python = ">=3.11"
pyproject.toml:11:dependencies = [
pyproject.toml:12:  "fastapi>=0.115,<1",
pyproject.toml:13:  "httpx>=0.27,<1",
pyproject.toml:14:  "mcp>=1,<2",
pyproject.toml:15:  "pyaes>=1.6,<2",
pyproject.toml:16:  "pypdf>=5.4,<6",
pyproject.toml:17:  "python-multipart>=0.0.9,<1",
pyproject.toml:18:  "python-telegram-bot>=21.0,<22",
pyproject.toml:19:  "uvicorn>=0.30,<1",
pyproject.toml:20:]
pyproject.toml:22:[project.scripts]
pyproject.toml:23:bot-intevra = "bot_intevra.cli:main"
pyproject.toml:25:[tool.setuptools]
pyproject.toml:26:package-dir = {"" = "src"}
pyproject.toml:28:[tool.setuptools.packages.find]
[... truncated 1 additional line(s) ...]
```

- Command `git grep -n . -- src/bot_intevra/__init__.py` output:

```
src/bot_intevra/__init__.py:1:"""Single-user Telegram bot with local inbox storage and Shared Memory sync."""
src/bot_intevra/__init__.py:3:__all__ = ["__version__"]
src/bot_intevra/__init__.py:5:__version__ = "0.1.0"
```

- Command `git grep -n . -- src/bot_intevra/__main__.py` output:

```
src/bot_intevra/__main__.py:1:from bot_intevra.cli import main
src/bot_intevra/__main__.py:4:if __name__ == "__main__":
src/bot_intevra/__main__.py:5:    raise SystemExit(main())
```

- Command `git grep -n . -- src/bot_intevra/attachments.py` output:

```
src/bot_intevra/attachments.py:1:from __future__ import annotations
src/bot_intevra/attachments.py:3:from dataclasses import dataclass, field
src/bot_intevra/attachments.py:4:from datetime import datetime, timezone
src/bot_intevra/attachments.py:5:from pathlib import Path
src/bot_intevra/attachments.py:6:import re
src/bot_intevra/attachments.py:9:@dataclass(slots=True)
src/bot_intevra/attachments.py:10:class SavedAttachment:
src/bot_intevra/attachments.py:11:    original_file_name: str
src/bot_intevra/attachments.py:12:    stored_path: Path
src/bot_intevra/attachments.py:13:    stored_reference: str
src/bot_intevra/attachments.py:14:    mime_type: str | None
src/bot_intevra/attachments.py:15:    file_size: int | None
src/bot_intevra/attachments.py:16:    attachment_kind: str = "document"
src/bot_intevra/attachments.py:17:    duration_seconds: int | None = None
src/bot_intevra/attachments.py:18:    extracted_text: str | None = None
src/bot_intevra/attachments.py:19:    extraction_error: str | None = None
src/bot_intevra/attachments.py:22:@dataclass(slots=True)
src/bot_intevra/attachments.py:23:class AttachmentReviewPlan:
src/bot_intevra/attachments.py:24:    note_text: str
src/bot_intevra/attachments.py:25:    should_normalize: bool
src/bot_intevra/attachments.py:26:    title: str | None = None
src/bot_intevra/attachments.py:27:    summary: str | None = None
src/bot_intevra/attachments.py:28:    clarification_questions: list[str] = field(default_factory=list)
src/bot_intevra/attachments.py:31:def build_attachment_storage_path(
[... truncated 155 additional line(s) ...]
```

- Command `git grep -n -m 1 -E "main__|encode|unclear|ownership|circular|dependencies" -- src/bot_intevra/__main__.py` output:

```
src/bot_intevra/__main__.py:4:if __name__ == "__main__":
```

```audit-report-manifest
{
  "version": 1,
  "auditPlanId": "batch:73b941eb-39f1-4b87-8c02-555722c186be:task:34ceaa1d-6488-40e1-8961-ea32802caf07",
  "taskId": "34ceaa1d-6488-40e1-8961-ea32802caf07",
  "batchId": "73b941eb-39f1-4b87-8c02-555722c186be",
  "roadmapAlias": "audit-e2e-20260520-144306-h",
  "artifactPath": "audit/2026-05-20-audit-architecture-and-ownership-boundaries-audit.md",
  "contentSha256": "28876e61950203a3dc324b6acb4d9b1eaf2ec38f779a73aae255cff9d49b9851",
  "sourceSnapshot": {
    "id": "git:5ffb91e687edffd2d4ee2fb3798178a33d8795ae:04b4d1afcfe7d561f8de4dcb61d0e017e0897bad",
    "commit": "5ffb91e687edffd2d4ee2fb3798178a33d8795ae",
    "tree": "04b4d1afcfe7d561f8de4dcb61d0e017e0897bad",
    "branch": "feature/audit-architecture-and-ownership-boundar-34ceaa",
    "dirty": false
  },
  "outcome": "validated_no_findings",
  "scopeCoverage": [
    {
      "root": "AGENTS.md",
      "covered": true,
      "evidenceRefs": [
        "ev_ca758e22-a57e-44de-9bb2-8a3b187c0cd8"
      ]
    },
    {
      "root": "README.md",
      "covered": true,
      "evidenceRefs": [
        "ev_f76649c6-5de2-461f-802c-86ad185bbd62"
      ]
    },
    {
      "root": "pyproject.toml",
      "covered": true,
      "evidenceRefs": [
        "ev_1fae3aa1-fbc2-49cb-bd89-879f08f1b3ef"
      ]
    },
    {
      "root": "src/bot_intevra/__init__.py",
      "covered": true,
      "evidenceRefs": [
        "ev_f5a8f198-8388-45b5-8a91-530035a518d5"
      ]
    },
    {
      "root": "src/bot_intevra/__main__.py",
      "covered": true,
      "evidenceRefs": [
        "ev_20987f2c-3ef6-44e2-a6f2-e4d39ecd8c07",
        "ev_788aee8b-1f91-41d8-b50c-2ff45d2bc72e"
      ]
    },
    {
      "root": "src/bot_intevra/attachments.py",
      "covered": true,
      "evidenceRefs": [
        "ev_710d2d17-f01b-4344-931a-1c9d1de4cb0d"
      ]
    }
  ],
  "riskHypotheses": [
    {
      "id": "risk-architecture-and-ownership-boundaries-1",
      "description": "README.md may encode unclear ownership, circular dependencies, or cross-module routing that would make task changes unsafe;",
      "scopeIds": [
        "README.md"
      ],
      "evidenceRefs": [
        "ev_f76649c6-5de2-461f-802c-86ad185bbd62"
      ],
      "status": "covered"
    },
    {
      "id": "risk-architecture-and-ownership-boundaries-2",
      "description": "AGENTS.md may encode unclear ownership, circular dependencies, or cross-module routing that would make task changes unsafe;",
      "scopeIds": [
        "AGENTS.md"
      ],
      "evidenceRefs": [
        "ev_ca758e22-a57e-44de-9bb2-8a3b187c0cd8"
      ],
      "status": "covered"
    },
    {
      "id": "risk-architecture-and-ownership-boundaries-3",
      "description": "pyproject.toml may encode unclear ownership, circular dependencies, or cross-module routing that would make task changes unsafe;",
      "scopeIds": [
        "pyproject.toml"
      ],
      "evidenceRefs": [
        "ev_1fae3aa1-fbc2-49cb-bd89-879f08f1b3ef"
      ],
      "status": "covered"
    },
    {
      "id": "risk-architecture-and-ownership-boundaries-4",
      "description": "src/bot_intevra/__init__.py may encode unclear ownership, circular dependencies, or cross-module routing that would make task changes unsafe;",
      "scopeIds": [
        "src/bot_intevra/__init__.py"
      ],
      "evidenceRefs": [
        "ev_f5a8f198-8388-45b5-8a91-530035a518d5"
      ],
      "status": "covered"
    },
    {
      "id": "risk-architecture-and-ownership-boundaries-5",
      "description": "src/bot_intevra/__main__.py may encode unclear ownership, circular dependencies, or cross-module routing that would make task changes unsafe;",
      "scopeIds": [
        "src/bot_intevra/__main__.py"
      ],
      "evidenceRefs": [
        "ev_20987f2c-3ef6-44e2-a6f2-e4d39ecd8c07",
        "ev_788aee8b-1f91-41d8-b50c-2ff45d2bc72e"
      ],
      "status": "covered"
    },
    {
      "id": "risk-architecture-and-ownership-boundaries-6",
      "description": "src/bot_intevra/attachments.py may encode unclear ownership, circular dependencies, or cross-module routing that would make task changes unsafe",
      "scopeIds": [
        "src/bot_intevra/attachments.py"
      ],
      "evidenceRefs": [
        "ev_710d2d17-f01b-4344-931a-1c9d1de4cb0d"
      ],
      "status": "covered"
    }
  ],
  "findings": [],
  "noFindingsClaims": [
    {
      "id": "nf-deterministic-repair",
      "scopeIds": [
        "AGENTS.md",
        "README.md",
        "pyproject.toml",
        "src/bot_intevra/__init__.py",
        "src/bot_intevra/__main__.py",
        "src/bot_intevra/attachments.py"
      ],
      "evidenceRefs": [
        "ev_1fae3aa1-fbc2-49cb-bd89-879f08f1b3ef",
        "ev_20987f2c-3ef6-44e2-a6f2-e4d39ecd8c07",
        "ev_710d2d17-f01b-4344-931a-1c9d1de4cb0d",
        "ev_788aee8b-1f91-41d8-b50c-2ff45d2bc72e",
        "ev_ca758e22-a57e-44de-9bb2-8a3b187c0cd8",
        "ev_f5a8f198-8388-45b5-8a91-530035a518d5",
        "ev_f76649c6-5de2-461f-802c-86ad185bbd62"
      ],
      "riskIds": [
        "risk-architecture-and-ownership-boundaries-1",
        "risk-architecture-and-ownership-boundaries-2",
        "risk-architecture-and-ownership-boundaries-3",
        "risk-architecture-and-ownership-boundaries-4",
        "risk-architecture-and-ownership-boundaries-5",
        "risk-architecture-and-ownership-boundaries-6"
      ],
      "reasoning": "Deterministic repair used scoped source inspections and removed unvalidated candidate findings."
    }
  ],
  "evidenceRefs": [
    "ev_1fae3aa1-fbc2-49cb-bd89-879f08f1b3ef",
    "ev_20987f2c-3ef6-44e2-a6f2-e4d39ecd8c07",
    "ev_710d2d17-f01b-4344-931a-1c9d1de4cb0d",
    "ev_788aee8b-1f91-41d8-b50c-2ff45d2bc72e",
    "ev_ca758e22-a57e-44de-9bb2-8a3b187c0cd8",
    "ev_f5a8f198-8388-45b5-8a91-530035a518d5",
    "ev_f76649c6-5de2-461f-802c-86ad185bbd62"
  ]
}
```
