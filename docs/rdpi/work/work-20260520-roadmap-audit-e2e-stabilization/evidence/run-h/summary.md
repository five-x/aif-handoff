# Audit Summary

<!-- audit-synthesis-outcome
{"kind":"validated_no_findings","reason":"No findings survived validation and all source reports included substantive no-findings evidence.","sourceReportCount":6,"validatedFindingCount":0,"substantiveNoFindingsReportCount":6,"inventoryOnlyNoFindingsReportCount":0,"weakReportCount":0}
-->

No validated findings.

Audit outcome: Validated no-findings with substantive audit evidence.

Absence reasoning: trusted source reports `audit/2026-05-20-audit-architecture-and-ownership-boundaries-audit.md`, `audit/2026-05-20-audit-integration-and-orchestration-boundaries-audit.md`, `audit/2026-05-20-audit-performance-and-runtime-behavior-audit.md`, `audit/2026-05-20-audit-persistence-and-data-safety-audit.md`, `audit/2026-05-20-audit-security-and-configuration-controls-audit.md`, `audit/2026-05-20-audit-test-and-operations-readiness-audit.md` were each classified as validated_no_findings with substantive child evidence; synthesis preserved those child outcomes and did not promote unsupported findings.

Generated from terminal audit batch report artifacts. Source report findings were included only when they carried concrete path:line Evidence, Risk, Proposed fix, and Verification sections.

## Child Report Status

| Source report                                                              | Task                                   | Status | Notes                                     |
| -------------------------------------------------------------------------- | -------------------------------------- | ------ | ----------------------------------------- |
| `audit/2026-05-20-audit-architecture-and-ownership-boundaries-audit.md`    | `34ceaa1d-6488-40e1-8961-ea32802caf07` | passed | included findings: 0; omitted findings: 0 |
| `audit/2026-05-20-audit-security-and-configuration-controls-audit.md`      | `77b3d7e8-41d0-4b5d-ad85-f3a7795b5129` | passed | included findings: 0; omitted findings: 0 |
| `audit/2026-05-20-audit-performance-and-runtime-behavior-audit.md`         | `da5adee2-dc17-475a-9298-142b2d9aad95` | passed | included findings: 0; omitted findings: 0 |
| `audit/2026-05-20-audit-persistence-and-data-safety-audit.md`              | `3dc681c3-cba4-4d93-8593-11718230f3a0` | passed | included findings: 0; omitted findings: 0 |
| `audit/2026-05-20-audit-integration-and-orchestration-boundaries-audit.md` | `e42198b0-a469-44c2-9d19-004fc53c5e17` | passed | included findings: 0; omitted findings: 0 |
| `audit/2026-05-20-audit-test-and-operations-readiness-audit.md`            | `d32ad336-dbb1-48de-87e7-cae015976f81` | passed | included findings: 0; omitted findings: 0 |

## Card Decision Matrix

| Source report                                                              | Task                                   | OTZ requirement                                                 | Acceptance criteria                                                                                                                  | Requirement completion | Implementation evidence                                                  | Verification evidence                     | Verification strength | Valid findings | Weak findings | Discarded findings | Residual risks | Final decision    |
| -------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------ | ----------------------------------------- | --------------------- | -------------- | ------------- | ------------------ | -------------- | ----------------- |
| `audit/2026-05-20-audit-architecture-and-ownership-boundaries-audit.md`    | `34ceaa1d-6488-40e1-8961-ea32802caf07` | Produce a terminal audit source report for the scoped OTZ card. | Report artifact exists and is trusted valid.<br>Accepted findings meet the evidence contract or no-findings evidence is substantive. | `satisfied`            | audit/2026-05-20-audit-architecture-and-ownership-boundaries-audit.md    | validator accepted source report evidence | `verified`            | 0              | 0             | 0                  | none           | `closed_verified` |
| `audit/2026-05-20-audit-security-and-configuration-controls-audit.md`      | `77b3d7e8-41d0-4b5d-ad85-f3a7795b5129` | Produce a terminal audit source report for the scoped OTZ card. | Report artifact exists and is trusted valid.<br>Accepted findings meet the evidence contract or no-findings evidence is substantive. | `satisfied`            | audit/2026-05-20-audit-security-and-configuration-controls-audit.md      | validator accepted source report evidence | `verified`            | 0              | 0             | 0                  | none           | `closed_verified` |
| `audit/2026-05-20-audit-performance-and-runtime-behavior-audit.md`         | `da5adee2-dc17-475a-9298-142b2d9aad95` | Produce a terminal audit source report for the scoped OTZ card. | Report artifact exists and is trusted valid.<br>Accepted findings meet the evidence contract or no-findings evidence is substantive. | `satisfied`            | audit/2026-05-20-audit-performance-and-runtime-behavior-audit.md         | validator accepted source report evidence | `verified`            | 0              | 0             | 0                  | none           | `closed_verified` |
| `audit/2026-05-20-audit-persistence-and-data-safety-audit.md`              | `3dc681c3-cba4-4d93-8593-11718230f3a0` | Produce a terminal audit source report for the scoped OTZ card. | Report artifact exists and is trusted valid.<br>Accepted findings meet the evidence contract or no-findings evidence is substantive. | `satisfied`            | audit/2026-05-20-audit-persistence-and-data-safety-audit.md              | validator accepted source report evidence | `verified`            | 0              | 0             | 0                  | none           | `closed_verified` |
| `audit/2026-05-20-audit-integration-and-orchestration-boundaries-audit.md` | `e42198b0-a469-44c2-9d19-004fc53c5e17` | Produce a terminal audit source report for the scoped OTZ card. | Report artifact exists and is trusted valid.<br>Accepted findings meet the evidence contract or no-findings evidence is substantive. | `satisfied`            | audit/2026-05-20-audit-integration-and-orchestration-boundaries-audit.md | validator accepted source report evidence | `verified`            | 0              | 0             | 0                  | none           | `closed_verified` |
| `audit/2026-05-20-audit-test-and-operations-readiness-audit.md`            | `d32ad336-dbb1-48de-87e7-cae015976f81` | Produce a terminal audit source report for the scoped OTZ card. | Report artifact exists and is trusted valid.<br>Accepted findings meet the evidence contract or no-findings evidence is substantive. | `satisfied`            | audit/2026-05-20-audit-test-and-operations-readiness-audit.md            | validator accepted source report evidence | `verified`            | 0              | 0             | 0                  | none           | `closed_verified` |

## Weak/discarded findings

No weak or discarded findings were omitted from the synthesis output.

## Source Reports Checked

- audit/2026-05-20-audit-architecture-and-ownership-boundaries-audit.md (task 34ceaa1d-6488-40e1-8961-ea32802caf07)
  - Included findings: 0
  - Omitted findings: 0
- audit/2026-05-20-audit-security-and-configuration-controls-audit.md (task 77b3d7e8-41d0-4b5d-ad85-f3a7795b5129)
  - Included findings: 0
  - Omitted findings: 0
- audit/2026-05-20-audit-performance-and-runtime-behavior-audit.md (task da5adee2-dc17-475a-9298-142b2d9aad95)
  - Included findings: 0
  - Omitted findings: 0
- audit/2026-05-20-audit-persistence-and-data-safety-audit.md (task 3dc681c3-cba4-4d93-8593-11718230f3a0)
  - Included findings: 0
  - Omitted findings: 0
- audit/2026-05-20-audit-integration-and-orchestration-boundaries-audit.md (task e42198b0-a469-44c2-9d19-004fc53c5e17)
  - Included findings: 0
  - Omitted findings: 0
- audit/2026-05-20-audit-test-and-operations-readiness-audit.md (task d32ad336-dbb1-48de-87e7-cae015976f81)
  - Included findings: 0
  - Omitted findings: 0

## Evidence Register

| Source report                                                              | Checked evidence                                                                                                                                                                                                                                                                   | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------- | ----------- | ----------- | -------------------------------------------------------------------------------------------------------------- |
| `audit/2026-05-20-audit-architecture-and-ownership-boundaries-audit.md`    | `AGENTS.md:3`, `AGENTS.md:5`, `AGENTS.md:7`, `README.md:3`, `README.md:5`, `README.md:6`, `pyproject.toml:1`, `pyproject.toml:2`                                                                                                                                                   | - Command `git grep -n -m 1 -E "main\_\_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | encode                                              | unclear    | ownership   | circular    | dependencies" -- src/bot_intevra/**main**.py`output:`src/bot_intevra/**main**.py:4:if **name** == "**main**":` |
| `audit/2026-05-20-audit-security-and-configuration-controls-audit.md`      | `.env.example:1`, `.env.example:2`, `.env.example:4`, `src/bot_intevra/__init__.py:1`, `src/bot_intevra/__init__.py:3`, `src/bot_intevra/__init__.py:5`, `src/bot_intevra/__main__.py:1`, `src/bot_intevra/__main__.py:4`                                                          | - Command `git grep -n -m 1 -E "main\_\_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | expose                                              | hardcoded  | credentials | permissive  | auth" -- src/bot_intevra/**main**.py`output:`src/bot_intevra/**main**.py:4:if **name** == "**main**":`         |
| `audit/2026-05-20-audit-performance-and-runtime-behavior-audit.md`         | `src/bot_intevra/__init__.py:1`, `src/bot_intevra/__init__.py:3`, `src/bot_intevra/__init__.py:5`, `src/bot_intevra/__main__.py:1`, `src/bot_intevra/__main__.py:4`, `src/bot_intevra/__main__.py:5`, `src/bot_intevra/attachments.py:1`, `src/bot_intevra/attachments.py:3`       | - Command `git grep -n -m 1 -E "main\_\_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | perform                                             | repeated   | blocking    | work        | omit" -- src/bot_intevra/**main**.py`output:`src/bot_intevra/**main**.py:4:if **name** == "**main**":`         |
| `audit/2026-05-20-audit-persistence-and-data-safety-audit.md`              | `src/bot_intevra/__init__.py:1`, `src/bot_intevra/__init__.py:3`, `src/bot_intevra/__init__.py:5`, `src/bot_intevra/__main__.py:1`, `src/bot_intevra/__main__.py:4`, `src/bot_intevra/__main__.py:5`, `src/bot_intevra/attachments.py:1`, `src/bot_intevra/attachments.py:3`       | - Command `git grep -n -m 1 -E "main\_\_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | perform                                             | non-atomic | writes      | destructive | migrations" -- src/bot_intevra/**main**.py`output:`src/bot_intevra/**main**.py:4:if **name** == "**main**":`   |
| `audit/2026-05-20-audit-integration-and-orchestration-boundaries-audit.md` | `src/bot_intevra/__init__.py:1`, `src/bot_intevra/__init__.py:3`, `src/bot_intevra/__init__.py:5`, `src/bot_intevra/__main__.py:1`, `src/bot_intevra/__main__.py:4`, `src/bot_intevra/__main__.py:5`, `src/bot_intevra/attachments.py:1`, `src/bot_intevra/attachments.py:3`       | - Command `git grep -n -m 1 -E "main\_\_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | mishandle                                           | retries    | idempotency | external    | contract" -- src/bot_intevra/**main**.py`output:`src/bot_intevra/**main**.py:4:if **name** == "**main**":`     |
| `audit/2026-05-20-audit-test-and-operations-readiness-audit.md`            | `tests/test_ask_contract_matrix.py:1`, `tests/test_ask_contract_matrix.py:3`, `tests/test_ask_contract_matrix.py:4`, `tests/test_attachments.py:1`, `tests/test_attachments.py:3`, `tests/test_attachments.py:4`, `tests/test_backup_crypto.py:1`, `tests/test_backup_crypto.py:3` | - Command `git grep -n . -- tests/test_ask_contract_matrix.py` output: ``` tests/test_ask_contract_matrix.py:1:from **future** import annotations tests/test_ask_contract_matrix.py:3:from dataclasses import dataclass tests/test_ask_contract_matrix.py:4:from pathlib import Path tests/test_ask_contract_matrix.py:5:import shutil tests/test_ask_contract_matrix.py:6:import tempfile tests/test_ask_contract_matrix.py:7:import unittest tests/test_ask_contract_matrix.py:9:from bot_intevra.config import Settings tests/test_ask_contract_matrix.py:10:from bot_intevra.db import NoteStore tests/test_ask_contract_matrix.py:11:from bot_intevra.models import MemoryAnswer, NoteDraft, Reference tests/test_ask_contract_matrix.py:12:from bot_intevra.service import NoteService tests/test_ask_contract_matrix.py:15:class \_RecordingMemoryClient: tests/test_ask_contract_matrix.py:16: def **init**(self, answer: MemoryAnswer) -> None: tests/test_ask_contract_matrix.py:17: self.answer = answer tests/test_ask_contract_matrix.py:18: self.calls: list[dict[str, object]] = [] tests/test_ask_contract_matrix.py:20: async def ask(self, \*\*kwargs: object) -> MemoryAnswer: tests/test_ask_contract_matrix.py:21: self.calls.append(kwargs) tests/test_ask_contract_matrix.py:22: return self.answer tests/test_ask_contract_matrix.py:25:@dataclass(frozen=True, slots=True) tests/test_ask_contract_matrix.py:26:class \_AskMatrixCase: tests/test_ask_contract_matrix.py:27: label: str tests/test_ask_contract_matrix.py:28: question: str tests/test_ask_contract_matrix.py:29: fixture_name: str tests/test_ask_contract_matrix.py:30: expected_answer_class: str tests/test_ask_contract_matrix.py:31: expected_source_type: str | None [... truncated 401 additional line(s) ...] ``` |

## Checked Files

- `.env.example:1`
- `.env.example:2`
- `.env.example:4`
- `AGENTS.md:3`
- `AGENTS.md:5`
- `AGENTS.md:7`
- `README.md:3`
- `README.md:5`
- `README.md:6`
- `pyproject.toml:1`
- `pyproject.toml:2`
- `src/bot_intevra/__init__.py:1`
- `src/bot_intevra/__init__.py:3`
- `src/bot_intevra/__init__.py:5`
- `src/bot_intevra/__main__.py:1`
- `src/bot_intevra/__main__.py:4`
- `src/bot_intevra/__main__.py:5`
- `src/bot_intevra/attachments.py:1`
- `src/bot_intevra/attachments.py:3`
- `tests/test_ask_contract_matrix.py:1`
- `tests/test_ask_contract_matrix.py:3`
- `tests/test_ask_contract_matrix.py:4`
- `tests/test_attachments.py:1`
- `tests/test_attachments.py:3`
- `tests/test_attachments.py:4`
- `tests/test_backup_crypto.py:1`
- `tests/test_backup_crypto.py:3`

## Checked Commands

- Command `git grep -n -m 1 -E "main__|encode|unclear|ownership|circular|dependencies" -- src/bot_intevra/__main__.py` output:

```
src/bot_intevra/__main__.py:4:if __name__ == "__main__":
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

- Command `git grep -n -m 1 -E "main__|expose|hardcoded|credentials|permissive|auth" -- src/bot_intevra/__main__.py` output:

```
src/bot_intevra/__main__.py:4:if __name__ == "__main__":
```

- Command `git grep -n . -- .env.example` output:

```
.env.example:1:TELEGRAM_BOT_TOKEN=
.env.example:2:TELEGRAM_ALLOWED_USER_ID=
.env.example:4:LIGHTRAG_BASE_URL=http://192.168.88.60:9727
.env.example:5:LIGHTRAG_API_KEY=
.env.example:6:LIGHTRAG_DEFAULT_MODE=local
.env.example:7:LIGHTRAG_FALLBACK_MODES=hybrid,naive
.env.example:8:LIGHTRAG_TIMEOUT_SECONDS=45
.env.example:10:NORMALIZER_BASE_URL=http://192.168.88.62:8000/v1
.env.example:11:NORMALIZER_API_KEY=
.env.example:12:NORMALIZER_MODEL=qwen2.5-14b-online
.env.example:13:NORMALIZER_TIMEOUT_SECONDS=20
.env.example:15:TRANSCRIPTION_BASE_URL=http://192.168.88.63:8172
.env.example:16:TRANSCRIPTION_API_KEY=
.env.example:17:TRANSCRIPTION_MODEL=whisper-1
.env.example:18:TRANSCRIPTION_LANGUAGE=ru
.env.example:19:TRANSCRIPTION_TIMEOUT_SECONDS=90
.env.example:21:BOT_DATA_DIR=./data/bot-intevra
.env.example:22:BOT_AUTO_PUBLISH_INBOX=false
.env.example:23:BOT_DEFAULT_RESPONSE_TYPE="Bullet Points"
.env.example:24:BOT_SOURCE_PREFIX=telegram-bot/personal-notes
.env.example:25:BOT_PRIMARY_COMPANY_NAME=Intevra
.env.example:26:BOT_BACKUP_PASSPHRASE=
.env.example:27:BOT_RUNTIME_ENV_FILE=
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

- Command `git grep -n . -- src/bot_intevra/config.py` output:

```
src/bot_intevra/config.py:1:from __future__ import annotations
src/bot_intevra/config.py:3:from dataclasses import dataclass
src/bot_intevra/config.py:4:from pathlib import Path
src/bot_intevra/config.py:5:import os
src/bot_intevra/config.py:7:DEFAULT_TRANSCRIPTION_BASE_URL = "http://192.168.88.63:8172"
src/bot_intevra/config.py:8:DEFAULT_TRANSCRIPTION_MODEL = "whisper-1"
src/bot_intevra/config.py:11:def _env_bool(name: str, default: bool) -> bool:
src/bot_intevra/config.py:12:    raw = os.getenv(name)
src/bot_intevra/config.py:13:    if raw is None:
src/bot_intevra/config.py:14:        return default
src/bot_intevra/config.py:15:    return raw.strip().lower() in {"1", "true", "yes", "on"}
src/bot_intevra/config.py:18:def _env_int(name: str, required: bool = False) -> int | None:
src/bot_intevra/config.py:19:    raw = os.getenv(name)
src/bot_intevra/config.py:20:    if raw is None or raw.strip() == "":
src/bot_intevra/config.py:21:        if required:
src/bot_intevra/config.py:22:            raise ValueError(f"Environment variable {name} is required.")
src/bot_intevra/config.py:23:        return None
src/bot_intevra/config.py:24:    return int(raw.strip())
src/bot_intevra/config.py:27:@dataclass(frozen=True)
src/bot_intevra/config.py:28:class Settings:
src/bot_intevra/config.py:29:    telegram_bot_token: str | None
src/bot_intevra/config.py:30:    telegram_allowed_user_id: int | None
src/bot_intevra/config.py:31:    lightrag_base_url: str
src/bot_intevra/config.py:32:    lightrag_api_key: str | None
[... truncated 88 additional line(s) ...]
```

- Command `git grep -n . -- src/bot_intevra/secret_scan.py` output:

```
src/bot_intevra/secret_scan.py:1:from __future__ import annotations
src/bot_intevra/secret_scan.py:3:import re
src/bot_intevra/secret_scan.py:6:SENSITIVE_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
src/bot_intevra/secret_scan.py:7:    ("private_key_block", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----", re.IGNORECASE)),
src/bot_intevra/secret_scan.py:8:    ("bearer_token", re.compile(r"\bbearer\s+[a-z0-9._\-]{16,}\b", re.IGNORECASE)),
src/bot_intevra/secret_scan.py:9:    ("password_assignment", re.compile(r"\b(password|passwd|pwd)\s*[:=]\s*\S+", re.IGNORECASE)),
src/bot_intevra/secret_scan.py:10:    ("api_key_assignment", re.compile(r"\b(api[_ -]?key|x-api-key)\s*[:=]\s*\S+", re.IGNORECASE)),
src/bot_intevra/secret_scan.py:11:    ("secret_assignment", re.compile(r"\b(secret|token)\s*[:=]\s*\S+", re.IGNORECASE)),
src/bot_intevra/secret_scan.py:12:    ("openai_key", re.compile(r"\bsk-[a-z0-9]{20,}\b", re.IGNORECASE)),
src/bot_intevra/secret_scan.py:13:    ("github_token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b")),
src/bot_intevra/secret_scan.py:14:    ("aws_access_key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
src/bot_intevra/secret_scan.py:15:)
src/bot_intevra/secret_scan.py:18:def find_sensitive_hits(text: str) -> list[str]:
src/bot_intevra/secret_scan.py:19:    hits: list[str] = []
src/bot_intevra/secret_scan.py:20:    for name, pattern in SENSITIVE_PATTERNS:
src/bot_intevra/secret_scan.py:21:        if pattern.search(text):
src/bot_intevra/secret_scan.py:22:            hits.append(name)
src/bot_intevra/secret_scan.py:23:    return hits
```

- Command `git grep -n -m 1 -E "main__|perform|repeated|blocking|work|omit" -- src/bot_intevra/__main__.py` output:

```
src/bot_intevra/__main__.py:4:if __name__ == "__main__":
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

- Command `git grep -n . -- src/bot_intevra/backup_crypto.py` output:

```
src/bot_intevra/backup_crypto.py:1:from __future__ import annotations
src/bot_intevra/backup_crypto.py:3:from hashlib import pbkdf2_hmac, sha256
src/bot_intevra/backup_crypto.py:4:import hmac
src/bot_intevra/backup_crypto.py:5:from io import BytesIO
src/bot_intevra/backup_crypto.py:6:from pathlib import Path
src/bot_intevra/backup_crypto.py:7:import os
src/bot_intevra/backup_crypto.py:8:import zipfile
src/bot_intevra/backup_crypto.py:10:try:
src/bot_intevra/backup_crypto.py:11:    import pyaes
src/bot_intevra/backup_crypto.py:12:except ImportError as exc:  # pragma: no cover - exercised via runtime error path if missing
src/bot_intevra/backup_crypto.py:13:    pyaes = None
src/bot_intevra/backup_crypto.py:14:    _CRYPTO_IMPORT_ERROR: ImportError | None = exc
src/bot_intevra/backup_crypto.py:15:else:
src/bot_intevra/backup_crypto.py:16:    _CRYPTO_IMPORT_ERROR = None
src/bot_intevra/backup_crypto.py:19:class BackupCryptoError(RuntimeError):
src/bot_intevra/backup_crypto.py:20:    """Raised when encrypted backup creation or restore fails."""
src/bot_intevra/backup_crypto.py:23:DEFAULT_PBKDF2_ITERATIONS = 1_000_000
src/bot_intevra/backup_crypto.py:26:def encrypt_directory(
src/bot_intevra/backup_crypto.py:27:    source_dir: Path,
src/bot_intevra/backup_crypto.py:28:    archive_path: Path,
src/bot_intevra/backup_crypto.py:29:    *,
src/bot_intevra/backup_crypto.py:30:    passphrase: str,
src/bot_intevra/backup_crypto.py:31:    iterations: int = DEFAULT_PBKDF2_ITERATIONS,
src/bot_intevra/backup_crypto.py:32:) -> dict[str, object]:
[... truncated 69 additional line(s) ...]
```

- Command `git grep -n . -- src/bot_intevra/bot.py` output:

```
src/bot_intevra/bot.py:1:from __future__ import annotations
src/bot_intevra/bot.py:3:import asyncio
src/bot_intevra/bot.py:4:from contextlib import asynccontextmanager, suppress
src/bot_intevra/bot.py:5:import logging
src/bot_intevra/bot.py:6:import re
src/bot_intevra/bot.py:8:from telegram import Bot, InlineKeyboardButton, InlineKeyboardMarkup, Message, ReplyKeyboardMarkup, Update
src/bot_intevra/bot.py:9:from telegram.constants import ChatAction, ChatType
src/bot_intevra/bot.py:10:from telegram.ext import (
src/bot_intevra/bot.py:11:    Application,
src/bot_intevra/bot.py:12:    CallbackQueryHandler,
src/bot_intevra/bot.py:13:    CommandHandler,
src/bot_intevra/bot.py:14:    ContextTypes,
src/bot_intevra/bot.py:15:    MessageHandler,
src/bot_intevra/bot.py:16:    filters,
src/bot_intevra/bot.py:17:)
src/bot_intevra/bot.py:19:from bot_intevra.attachments import (
src/bot_intevra/bot.py:20:    AttachmentReviewPlan,
src/bot_intevra/bot.py:21:    SavedAttachment,
src/bot_intevra/bot.py:22:    build_attachment_storage_path,
src/bot_intevra/bot.py:23:    extract_text_from_document,
src/bot_intevra/bot.py:24:    plan_document_review,
src/bot_intevra/bot.py:25:    plan_voice_review,
src/bot_intevra/bot.py:26:    render_attachment_note_text,
src/bot_intevra/bot.py:27:)
[... truncated 1716 additional line(s) ...]
```

- Command `git grep -n . -- src/bot_intevra/cli.py` output:

```
src/bot_intevra/cli.py:1:from __future__ import annotations
src/bot_intevra/cli.py:3:import argparse
src/bot_intevra/cli.py:4:import asyncio
src/bot_intevra/cli.py:5:import json
src/bot_intevra/cli.py:6:from pathlib import Path
src/bot_intevra/cli.py:8:from bot_intevra.config import Settings
src/bot_intevra/cli.py:9:from bot_intevra.service import (
src/bot_intevra/cli.py:10:    NoteService,
src/bot_intevra/cli.py:11:    build_memory_client,
src/bot_intevra/cli.py:12:    build_normalizer_client,
src/bot_intevra/cli.py:13:    build_store,
src/bot_intevra/cli.py:14:    render_ask_response,
src/bot_intevra/cli.py:15:)
src/bot_intevra/cli.py:16:from bot_intevra.status_server import run_status_server
src/bot_intevra/cli.py:19:def build_parser() -> argparse.ArgumentParser:
src/bot_intevra/cli.py:20:    parser = argparse.ArgumentParser(prog="bot-intevra")
src/bot_intevra/cli.py:21:    subparsers = parser.add_subparsers(dest="command", required=True)
src/bot_intevra/cli.py:23:    subparsers.add_parser("init-db", help="Initialize the local SQLite database.")
src/bot_intevra/cli.py:24:    reset_parser = subparsers.add_parser("reset-data", help="Delete local bot data and reinitialize storage.")
src/bot_intevra/cli.py:25:    reset_parser.add_argument("--yes", action="store_true", help="Confirm destructive reset.")
src/bot_intevra/cli.py:27:    save_parser = subparsers.add_parser("save", help="Save a note locally.")
src/bot_intevra/cli.py:28:    save_parser.add_argument("--text", required=True)
src/bot_intevra/cli.py:29:    save_parser.add_argument("--kind", default="raw_note")
src/bot_intevra/cli.py:30:    save_parser.add_argument("--project")
[... truncated 238 additional line(s) ...]
```

- Command `git grep -n -m 1 -E "main__|perform|non-atomic|writes|destructive|migrations" -- src/bot_intevra/__main__.py` output:

```
src/bot_intevra/__main__.py:4:if __name__ == "__main__":
```

- Command `git grep -n -m 1 -E "perform|non-atomic|writes|destructive|migrations|weak" -- src/bot_intevra/db.py` output:

```
src/bot_intevra/db.py:112:            self._apply_schema_migrations(conn)
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

- Command `git grep -n . -- src/bot_intevra/backup_crypto.py` output:

```
src/bot_intevra/backup_crypto.py:1:from __future__ import annotations
src/bot_intevra/backup_crypto.py:3:from hashlib import pbkdf2_hmac, sha256
src/bot_intevra/backup_crypto.py:4:import hmac
src/bot_intevra/backup_crypto.py:5:from io import BytesIO
src/bot_intevra/backup_crypto.py:6:from pathlib import Path
src/bot_intevra/backup_crypto.py:7:import os
src/bot_intevra/backup_crypto.py:8:import zipfile
src/bot_intevra/backup_crypto.py:10:try:
src/bot_intevra/backup_crypto.py:11:    import pyaes
src/bot_intevra/backup_crypto.py:12:except ImportError as exc:  # pragma: no cover - exercised via runtime error path if missing
src/bot_intevra/backup_crypto.py:13:    pyaes = None
src/bot_intevra/backup_crypto.py:14:    _CRYPTO_IMPORT_ERROR: ImportError | None = exc
src/bot_intevra/backup_crypto.py:15:else:
src/bot_intevra/backup_crypto.py:16:    _CRYPTO_IMPORT_ERROR = None
src/bot_intevra/backup_crypto.py:19:class BackupCryptoError(RuntimeError):
src/bot_intevra/backup_crypto.py:20:    """Raised when encrypted backup creation or restore fails."""
src/bot_intevra/backup_crypto.py:23:DEFAULT_PBKDF2_ITERATIONS = 1_000_000
src/bot_intevra/backup_crypto.py:26:def encrypt_directory(
src/bot_intevra/backup_crypto.py:27:    source_dir: Path,
src/bot_intevra/backup_crypto.py:28:    archive_path: Path,
src/bot_intevra/backup_crypto.py:29:    *,
src/bot_intevra/backup_crypto.py:30:    passphrase: str,
src/bot_intevra/backup_crypto.py:31:    iterations: int = DEFAULT_PBKDF2_ITERATIONS,
src/bot_intevra/backup_crypto.py:32:) -> dict[str, object]:
[... truncated 69 additional line(s) ...]
```

- Command `git grep -n . -- src/bot_intevra/db.py` output:

```
src/bot_intevra/db.py:1:from __future__ import annotations
src/bot_intevra/db.py:3:from datetime import datetime, timezone
src/bot_intevra/db.py:4:from pathlib import Path
src/bot_intevra/db.py:5:import json
src/bot_intevra/db.py:6:import os
src/bot_intevra/db.py:7:import re
src/bot_intevra/db.py:8:import shutil
src/bot_intevra/db.py:9:import sqlite3
src/bot_intevra/db.py:10:from typing import Any
src/bot_intevra/db.py:12:from bot_intevra.models import (
src/bot_intevra/db.py:13:    AskResponse,
src/bot_intevra/db.py:14:    AskSourceTrace,
src/bot_intevra/db.py:15:    AskTraceRecord,
src/bot_intevra/db.py:16:    CuratedRecordV1,
src/bot_intevra/db.py:17:    CuratedRecordVersion,
src/bot_intevra/db.py:18:    EntityRecord,
src/bot_intevra/db.py:19:    EntityRelationRecord,
src/bot_intevra/db.py:20:    IntakeRecord,
src/bot_intevra/db.py:21:    KnowledgeRecord,
src/bot_intevra/db.py:22:    LocalSearchHit,
src/bot_intevra/db.py:23:    MemoryAnswer,
src/bot_intevra/db.py:24:    NoteDraft,
src/bot_intevra/db.py:25:    NoteRecord,
src/bot_intevra/db.py:26:    Reference,
[... truncated 3475 additional line(s) ...]
```

- Command `git grep -n . -- src/bot_intevra/models.py` output:

```
src/bot_intevra/models.py:1:from __future__ import annotations
src/bot_intevra/models.py:3:from dataclasses import dataclass, field
src/bot_intevra/models.py:4:from datetime import datetime, timezone
src/bot_intevra/models.py:7:def utc_now() -> datetime:
src/bot_intevra/models.py:8:    return datetime.now(timezone.utc)
src/bot_intevra/models.py:11:@dataclass(slots=True)
src/bot_intevra/models.py:12:class NoteDraft:
src/bot_intevra/models.py:13:    note_kind: str
src/bot_intevra/models.py:14:    text: str
src/bot_intevra/models.py:15:    project: str | None = None
src/bot_intevra/models.py:16:    entity_name: str | None = None
src/bot_intevra/models.py:17:    tags: list[str] = field(default_factory=list)
src/bot_intevra/models.py:18:    title: str | None = None
src/bot_intevra/models.py:19:    summary: str | None = None
src/bot_intevra/models.py:20:    normalized_text: str | None = None
src/bot_intevra/models.py:21:    sync_policy: str = "local_only"
src/bot_intevra/models.py:22:    telegram_chat_id: int | None = None
src/bot_intevra/models.py:23:    telegram_user_id: int | None = None
src/bot_intevra/models.py:24:    telegram_message_id: int | None = None
src/bot_intevra/models.py:25:    reply_to_message_id: int | None = None
src/bot_intevra/models.py:26:    contains_sensitive: bool = False
src/bot_intevra/models.py:27:    sensitivity_hits: list[str] = field(default_factory=list)
src/bot_intevra/models.py:28:    review_status: str = "draft"
src/bot_intevra/models.py:29:    needs_clarification: bool = False
[... truncated 308 additional line(s) ...]
```

- Command `git grep -n -m 1 -E "main__|mishandle|retries|idempotency|external|contract" -- src/bot_intevra/__main__.py` output:

```
src/bot_intevra/__main__.py:4:if __name__ == "__main__":
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

- Command `git grep -n . -- src/bot_intevra/backup_crypto.py` output:

```
src/bot_intevra/backup_crypto.py:1:from __future__ import annotations
src/bot_intevra/backup_crypto.py:3:from hashlib import pbkdf2_hmac, sha256
src/bot_intevra/backup_crypto.py:4:import hmac
src/bot_intevra/backup_crypto.py:5:from io import BytesIO
src/bot_intevra/backup_crypto.py:6:from pathlib import Path
src/bot_intevra/backup_crypto.py:7:import os
src/bot_intevra/backup_crypto.py:8:import zipfile
src/bot_intevra/backup_crypto.py:10:try:
src/bot_intevra/backup_crypto.py:11:    import pyaes
src/bot_intevra/backup_crypto.py:12:except ImportError as exc:  # pragma: no cover - exercised via runtime error path if missing
src/bot_intevra/backup_crypto.py:13:    pyaes = None
src/bot_intevra/backup_crypto.py:14:    _CRYPTO_IMPORT_ERROR: ImportError | None = exc
src/bot_intevra/backup_crypto.py:15:else:
src/bot_intevra/backup_crypto.py:16:    _CRYPTO_IMPORT_ERROR = None
src/bot_intevra/backup_crypto.py:19:class BackupCryptoError(RuntimeError):
src/bot_intevra/backup_crypto.py:20:    """Raised when encrypted backup creation or restore fails."""
src/bot_intevra/backup_crypto.py:23:DEFAULT_PBKDF2_ITERATIONS = 1_000_000
src/bot_intevra/backup_crypto.py:26:def encrypt_directory(
src/bot_intevra/backup_crypto.py:27:    source_dir: Path,
src/bot_intevra/backup_crypto.py:28:    archive_path: Path,
src/bot_intevra/backup_crypto.py:29:    *,
src/bot_intevra/backup_crypto.py:30:    passphrase: str,
src/bot_intevra/backup_crypto.py:31:    iterations: int = DEFAULT_PBKDF2_ITERATIONS,
src/bot_intevra/backup_crypto.py:32:) -> dict[str, object]:
[... truncated 69 additional line(s) ...]
```

- Command `git grep -n . -- src/bot_intevra/bot.py` output:

```
src/bot_intevra/bot.py:1:from __future__ import annotations
src/bot_intevra/bot.py:3:import asyncio
src/bot_intevra/bot.py:4:from contextlib import asynccontextmanager, suppress
src/bot_intevra/bot.py:5:import logging
src/bot_intevra/bot.py:6:import re
src/bot_intevra/bot.py:8:from telegram import Bot, InlineKeyboardButton, InlineKeyboardMarkup, Message, ReplyKeyboardMarkup, Update
src/bot_intevra/bot.py:9:from telegram.constants import ChatAction, ChatType
src/bot_intevra/bot.py:10:from telegram.ext import (
src/bot_intevra/bot.py:11:    Application,
src/bot_intevra/bot.py:12:    CallbackQueryHandler,
src/bot_intevra/bot.py:13:    CommandHandler,
src/bot_intevra/bot.py:14:    ContextTypes,
src/bot_intevra/bot.py:15:    MessageHandler,
src/bot_intevra/bot.py:16:    filters,
src/bot_intevra/bot.py:17:)
src/bot_intevra/bot.py:19:from bot_intevra.attachments import (
src/bot_intevra/bot.py:20:    AttachmentReviewPlan,
src/bot_intevra/bot.py:21:    SavedAttachment,
src/bot_intevra/bot.py:22:    build_attachment_storage_path,
src/bot_intevra/bot.py:23:    extract_text_from_document,
src/bot_intevra/bot.py:24:    plan_document_review,
src/bot_intevra/bot.py:25:    plan_voice_review,
src/bot_intevra/bot.py:26:    render_attachment_note_text,
src/bot_intevra/bot.py:27:)
[... truncated 1716 additional line(s) ...]
```

- Command `git grep -n . -- src/bot_intevra/cli.py` output:

```
src/bot_intevra/cli.py:1:from __future__ import annotations
src/bot_intevra/cli.py:3:import argparse
src/bot_intevra/cli.py:4:import asyncio
src/bot_intevra/cli.py:5:import json
src/bot_intevra/cli.py:6:from pathlib import Path
src/bot_intevra/cli.py:8:from bot_intevra.config import Settings
src/bot_intevra/cli.py:9:from bot_intevra.service import (
src/bot_intevra/cli.py:10:    NoteService,
src/bot_intevra/cli.py:11:    build_memory_client,
src/bot_intevra/cli.py:12:    build_normalizer_client,
src/bot_intevra/cli.py:13:    build_store,
src/bot_intevra/cli.py:14:    render_ask_response,
src/bot_intevra/cli.py:15:)
src/bot_intevra/cli.py:16:from bot_intevra.status_server import run_status_server
src/bot_intevra/cli.py:19:def build_parser() -> argparse.ArgumentParser:
src/bot_intevra/cli.py:20:    parser = argparse.ArgumentParser(prog="bot-intevra")
src/bot_intevra/cli.py:21:    subparsers = parser.add_subparsers(dest="command", required=True)
src/bot_intevra/cli.py:23:    subparsers.add_parser("init-db", help="Initialize the local SQLite database.")
src/bot_intevra/cli.py:24:    reset_parser = subparsers.add_parser("reset-data", help="Delete local bot data and reinitialize storage.")
src/bot_intevra/cli.py:25:    reset_parser.add_argument("--yes", action="store_true", help="Confirm destructive reset.")
src/bot_intevra/cli.py:27:    save_parser = subparsers.add_parser("save", help="Save a note locally.")
src/bot_intevra/cli.py:28:    save_parser.add_argument("--text", required=True)
src/bot_intevra/cli.py:29:    save_parser.add_argument("--kind", default="raw_note")
src/bot_intevra/cli.py:30:    save_parser.add_argument("--project")
[... truncated 238 additional line(s) ...]
```

- Command `git grep -n . -- tests/test_ask_contract_matrix.py` output:

```
tests/test_ask_contract_matrix.py:1:from __future__ import annotations
tests/test_ask_contract_matrix.py:3:from dataclasses import dataclass
tests/test_ask_contract_matrix.py:4:from pathlib import Path
tests/test_ask_contract_matrix.py:5:import shutil
tests/test_ask_contract_matrix.py:6:import tempfile
tests/test_ask_contract_matrix.py:7:import unittest
tests/test_ask_contract_matrix.py:9:from bot_intevra.config import Settings
tests/test_ask_contract_matrix.py:10:from bot_intevra.db import NoteStore
tests/test_ask_contract_matrix.py:11:from bot_intevra.models import MemoryAnswer, NoteDraft, Reference
tests/test_ask_contract_matrix.py:12:from bot_intevra.service import NoteService
tests/test_ask_contract_matrix.py:15:class _RecordingMemoryClient:
tests/test_ask_contract_matrix.py:16:    def __init__(self, answer: MemoryAnswer) -> None:
tests/test_ask_contract_matrix.py:17:        self.answer = answer
tests/test_ask_contract_matrix.py:18:        self.calls: list[dict[str, object]] = []
tests/test_ask_contract_matrix.py:20:    async def ask(self, **kwargs: object) -> MemoryAnswer:
tests/test_ask_contract_matrix.py:21:        self.calls.append(kwargs)
tests/test_ask_contract_matrix.py:22:        return self.answer
tests/test_ask_contract_matrix.py:25:@dataclass(frozen=True, slots=True)
tests/test_ask_contract_matrix.py:26:class _AskMatrixCase:
tests/test_ask_contract_matrix.py:27:    label: str
tests/test_ask_contract_matrix.py:28:    question: str
tests/test_ask_contract_matrix.py:29:    fixture_name: str
tests/test_ask_contract_matrix.py:30:    expected_answer_class: str
tests/test_ask_contract_matrix.py:31:    expected_source_type: str | None
[... truncated 401 additional line(s) ...]
```

- Command `git grep -n . -- tests/test_attachments.py` output:

```
tests/test_attachments.py:1:from __future__ import annotations
tests/test_attachments.py:3:from pathlib import Path
tests/test_attachments.py:4:import tempfile
tests/test_attachments.py:5:import unittest
tests/test_attachments.py:7:from bot_intevra.attachments import (
tests/test_attachments.py:8:    SavedAttachment,
tests/test_attachments.py:9:    build_attachment_storage_path,
tests/test_attachments.py:10:    plan_document_review,
tests/test_attachments.py:11:    render_attachment_note_text,
tests/test_attachments.py:12:)
tests/test_attachments.py:15:class AttachmentHelpersTests(unittest.TestCase):
tests/test_attachments.py:16:    def test_build_attachment_storage_path_uses_relative_reference(self) -> None:
tests/test_attachments.py:17:        with tempfile.TemporaryDirectory(prefix="solo-memory-attachments-") as tmpdir:
tests/test_attachments.py:18:            base_dir = Path(tmpdir) / "attachments"
tests/test_attachments.py:19:            stored_path, stored_reference = build_attachment_storage_path(
tests/test_attachments.py:20:                base_dir,
tests/test_attachments.py:21:                original_file_name="Bank Details.pdf",
tests/test_attachments.py:22:                message_id=42,
tests/test_attachments.py:23:                file_unique_id="abc123",
tests/test_attachments.py:24:            )
tests/test_attachments.py:26:            self.assertTrue(stored_path.parent.exists())
tests/test_attachments.py:27:            self.assertTrue(stored_reference.startswith("attachments/"))
tests/test_attachments.py:28:            self.assertTrue(stored_path.name.endswith(".pdf"))
tests/test_attachments.py:30:    def test_render_attachment_note_text_includes_metadata_and_extract(self) -> None:
[... truncated 50 additional line(s) ...]
```

- Command `git grep -n . -- tests/test_backup_crypto.py` output:

```
tests/test_backup_crypto.py:1:from __future__ import annotations
tests/test_backup_crypto.py:3:import inspect
tests/test_backup_crypto.py:4:import tempfile
tests/test_backup_crypto.py:5:import unittest
tests/test_backup_crypto.py:6:from pathlib import Path
tests/test_backup_crypto.py:8:import bot_intevra.backup_crypto as backup_crypto
tests/test_backup_crypto.py:9:from bot_intevra.backup_crypto import DEFAULT_PBKDF2_ITERATIONS, decrypt_archive_to_dir, encrypt_directory
tests/test_backup_crypto.py:12:class BackupCryptoTests(unittest.TestCase):
tests/test_backup_crypto.py:13:    def test_encrypt_directory_default_iterations_are_hardened(self) -> None:
tests/test_backup_crypto.py:14:        default = inspect.signature(encrypt_directory).parameters["iterations"].default
tests/test_backup_crypto.py:15:        self.assertEqual(DEFAULT_PBKDF2_ITERATIONS, default)
tests/test_backup_crypto.py:16:        self.assertGreaterEqual(DEFAULT_PBKDF2_ITERATIONS, 1_000_000)
tests/test_backup_crypto.py:18:    @unittest.skipIf(backup_crypto._CRYPTO_IMPORT_ERROR is not None, "pyaes is not installed")
tests/test_backup_crypto.py:19:    def test_encrypt_directory_reports_hardened_default_iterations(self) -> None:
tests/test_backup_crypto.py:20:        with tempfile.TemporaryDirectory(prefix="backup-crypto-") as raw_tmpdir:
tests/test_backup_crypto.py:21:            root = Path(raw_tmpdir)
tests/test_backup_crypto.py:22:            source = root / "source"
tests/test_backup_crypto.py:23:            source.mkdir()
tests/test_backup_crypto.py:24:            (source / "note.txt").write_text("hello", encoding="utf-8")
tests/test_backup_crypto.py:26:            metadata = encrypt_directory(source, root / "backup.enc", passphrase="correct horse battery staple")
tests/test_backup_crypto.py:28:        self.assertEqual(DEFAULT_PBKDF2_ITERATIONS, metadata["iterations"])
tests/test_backup_crypto.py:29:        self.assertGreaterEqual(metadata["iterations"], 1_000_000)
tests/test_backup_crypto.py:31:    @unittest.skipIf(backup_crypto._CRYPTO_IMPORT_ERROR is not None, "pyaes is not installed")
tests/test_backup_crypto.py:32:    def test_decrypt_archive_uses_metadata_iterations_for_round_trip(self) -> None:
[... truncated 21 additional line(s) ...]
```

- Command `git grep -n . -- tests/test_bot.py` output:

```
tests/test_bot.py:1:from __future__ import annotations
tests/test_bot.py:3:import asyncio
tests/test_bot.py:4:from pathlib import Path
tests/test_bot.py:5:import shutil
tests/test_bot.py:6:import tempfile
tests/test_bot.py:7:from types import SimpleNamespace
tests/test_bot.py:8:import unittest
tests/test_bot.py:9:from unittest.mock import AsyncMock, patch
tests/test_bot.py:11:from bot_intevra.attachments import SavedAttachment, build_attachment_storage_path, plan_document_review
tests/test_bot.py:12:from bot_intevra.bot import (
tests/test_bot.py:13:    TelegramMemoryBot,
tests/test_bot.py:14:    _classify_plain_text_intent,
tests/test_bot.py:15:    _extract_note_id_from_review_text,
tests/test_bot.py:16:    _looks_like_plain_text_question,
tests/test_bot.py:17:    _looks_like_plain_text_task,
tests/test_bot.py:18:    _note_kind_hint_from_caption,
tests/test_bot.py:19:)
tests/test_bot.py:20:from bot_intevra.config import Settings
tests/test_bot.py:21:from bot_intevra.db import NoteStore
tests/test_bot.py:22:from bot_intevra.models import AskResponse, AskSourceTrace, KnowledgeRecord, MemoryAnswer, NormalizationResult, NoteDraft
tests/test_bot.py:23:from bot_intevra.service import NoteService
tests/test_bot.py:24:from bot_intevra.transcription_client import TranscriptionResult
tests/test_bot.py:25:from telegram.constants import ChatType
tests/test_bot.py:28:def _button_callbacks(markup) -> list[str]:
[... truncated 1282 additional line(s) ...]
```

- Command `git grep -n . -- tests/test_cli.py` output:

```
tests/test_cli.py:1:from __future__ import annotations
tests/test_cli.py:3:import sys
tests/test_cli.py:4:import unittest
tests/test_cli.py:5:from unittest import mock
tests/test_cli.py:7:from bot_intevra import cli
tests/test_cli.py:10:class CliRoutingTests(unittest.TestCase):
tests/test_cli.py:11:    def test_run_orchestrator_server_routes_to_sync_main(self) -> None:
tests/test_cli.py:12:        argv = [
tests/test_cli.py:13:            "bot-intevra",
tests/test_cli.py:14:            "run-orchestrator-server",
tests/test_cli.py:15:            "--host",
tests/test_cli.py:16:            "127.0.0.1",
tests/test_cli.py:17:            "--port",
tests/test_cli.py:18:            "8091",
tests/test_cli.py:19:        ]
tests/test_cli.py:20:        with mock.patch.object(sys, "argv", argv), mock.patch.object(cli, "sync_main", return_value=0) as sync_main:
tests/test_cli.py:21:            exit_code = cli.main()
tests/test_cli.py:23:        self.assertEqual(0, exit_code)
tests/test_cli.py:24:        sync_main.assert_called_once()
tests/test_cli.py:25:        args = sync_main.call_args.args[0]
tests/test_cli.py:26:        self.assertEqual("run-orchestrator-server", args.command)
tests/test_cli.py:27:        self.assertEqual("127.0.0.1", args.host)
tests/test_cli.py:28:        self.assertEqual(8091, args.port)
tests/test_cli.py:31:if __name__ == "__main__":
[... truncated 1 additional line(s) ...]
```

- Command `git grep -n . -- tests/test_company_profile.py` output:

```
tests/test_company_profile.py:1:from __future__ import annotations
tests/test_company_profile.py:3:import shutil
tests/test_company_profile.py:4:import tempfile
tests/test_company_profile.py:5:import unittest
tests/test_company_profile.py:6:from pathlib import Path
tests/test_company_profile.py:8:from bot_intevra.company_profile import (
tests/test_company_profile.py:9:    CANONICAL_ALIASES,
tests/test_company_profile.py:10:    CANONICAL_PROFILE_TAG,
tests/test_company_profile.py:11:    CANONICAL_PROFILE_TITLE,
tests/test_company_profile.py:12:    REQUIRED_SERVICE_MARKERS,
tests/test_company_profile.py:13:    canonicalize_company_profile,
tests/test_company_profile.py:14:    load_company_profile,
tests/test_company_profile.py:15:    publish_canonical_company_profile,
tests/test_company_profile.py:16:)
tests/test_company_profile.py:17:from bot_intevra.config import Settings
tests/test_company_profile.py:18:from bot_intevra.db import NoteStore
tests/test_company_profile.py:19:from bot_intevra.models import MemoryAnswer, NoteDraft, Reference
tests/test_company_profile.py:20:from bot_intevra.service import NoteService, render_ask_why
tests/test_company_profile.py:23:REPO_ROOT = Path(__file__).resolve().parents[1]
tests/test_company_profile.py:24:PROFILE_PATH = REPO_ROOT / "docs" / "memory" / "entities" / "Intevra" / "company-profile.md"
tests/test_company_profile.py:27:class _PublishMemoryClient:
tests/test_company_profile.py:28:    def __init__(self) -> None:
tests/test_company_profile.py:29:        self.calls: list[dict[str, object]] = []
tests/test_company_profile.py:31:    async def insert_text(self, **kwargs):
[... truncated 167 additional line(s) ...]
```

## Weak Or Invalid Reports

No weak or invalid report artifacts were present in the batch.

## Synthesis Quality Notes

Included source findings: 0.
Omitted source findings: 0.
Weak or invalid source reports: 0.

```audit-report-manifest
{
  "version": 1,
  "auditPlanId": "batch:73b941eb-39f1-4b87-8c02-555722c186be:task:78ec2278-7605-4879-8a67-c648612bf6e7",
  "taskId": "78ec2278-7605-4879-8a67-c648612bf6e7",
  "batchId": "73b941eb-39f1-4b87-8c02-555722c186be",
  "roadmapAlias": "audit-e2e-20260520-144306-h",
  "artifactPath": "audit/2026-05-20-summary.md",
  "contentSha256": "2899fee84182f03dc25e3a350c32084722c4914a396790fa62ee034507217271",
  "sourceSnapshot": {
    "id": "git:5ffb91e687edffd2d4ee2fb3798178a33d8795ae:04b4d1afcfe7d561f8de4dcb61d0e017e0897bad",
    "commit": "5ffb91e687edffd2d4ee2fb3798178a33d8795ae",
    "tree": "04b4d1afcfe7d561f8de4dcb61d0e017e0897bad",
    "branch": "feature/synthesize-audit-findings-78ec22",
    "dirty": false
  },
  "outcome": "validated_no_findings",
  "scopeCoverage": [
    {
      "root": "audit/2026-05-20-audit-architecture-and-ownership-boundaries-audit.md",
      "covered": true,
      "evidenceRefs": [
        "ev_a23bc4a2-82cf-49dd-a0af-5e218bc12c49"
      ]
    },
    {
      "root": "audit/2026-05-20-audit-integration-and-orchestration-boundaries-audit.md",
      "covered": true,
      "evidenceRefs": [
        "ev_a23bc4a2-82cf-49dd-a0af-5e218bc12c49"
      ]
    },
    {
      "root": "audit/2026-05-20-audit-performance-and-runtime-behavior-audit.md",
      "covered": true,
      "evidenceRefs": [
        "ev_a23bc4a2-82cf-49dd-a0af-5e218bc12c49"
      ]
    },
    {
      "root": "audit/2026-05-20-audit-persistence-and-data-safety-audit.md",
      "covered": true,
      "evidenceRefs": [
        "ev_a23bc4a2-82cf-49dd-a0af-5e218bc12c49"
      ]
    },
    {
      "root": "audit/2026-05-20-audit-security-and-configuration-controls-audit.md",
      "covered": true,
      "evidenceRefs": [
        "ev_a23bc4a2-82cf-49dd-a0af-5e218bc12c49"
      ]
    },
    {
      "root": "audit/2026-05-20-audit-test-and-operations-readiness-audit.md",
      "covered": true,
      "evidenceRefs": [
        "ev_a23bc4a2-82cf-49dd-a0af-5e218bc12c49"
      ]
    }
  ],
  "riskHypotheses": [
    {
      "id": "risk-deterministic-synthesis-no-findings",
      "description": "Trusted source audit reports contain no validated findings that survived deterministic synthesis.",
      "scopeIds": [
        "audit/2026-05-20-audit-architecture-and-ownership-boundaries-audit.md",
        "audit/2026-05-20-audit-integration-and-orchestration-boundaries-audit.md",
        "audit/2026-05-20-audit-performance-and-runtime-behavior-audit.md",
        "audit/2026-05-20-audit-persistence-and-data-safety-audit.md",
        "audit/2026-05-20-audit-security-and-configuration-controls-audit.md",
        "audit/2026-05-20-audit-test-and-operations-readiness-audit.md"
      ],
      "evidenceRefs": [
        "ev_a23bc4a2-82cf-49dd-a0af-5e218bc12c49"
      ],
      "status": "covered"
    }
  ],
  "findings": [],
  "noFindingsClaims": [
    {
      "id": "nf-deterministic-synthesis",
      "scopeIds": [
        "audit/2026-05-20-audit-architecture-and-ownership-boundaries-audit.md",
        "audit/2026-05-20-audit-integration-and-orchestration-boundaries-audit.md",
        "audit/2026-05-20-audit-performance-and-runtime-behavior-audit.md",
        "audit/2026-05-20-audit-persistence-and-data-safety-audit.md",
        "audit/2026-05-20-audit-security-and-configuration-controls-audit.md",
        "audit/2026-05-20-audit-test-and-operations-readiness-audit.md"
      ],
      "evidenceRefs": [
        "ev_a23bc4a2-82cf-49dd-a0af-5e218bc12c49"
      ],
      "riskIds": [
        "risk-deterministic-synthesis-no-findings"
      ],
      "reasoning": "Deterministic synthesis used only already-validated source audit reports and preserved substantive no-findings evidence."
    }
  ],
  "evidenceRefs": [
    "ev_a23bc4a2-82cf-49dd-a0af-5e218bc12c49"
  ]
}
```
