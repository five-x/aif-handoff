# Audit: integration and orchestration boundaries

No validated findings.

The previous candidate findings did not meet the audit finding contract for concrete technical defects. They were removed instead of being rephrased.

## Risk Hypotheses

- risk-integration-and-orchestration-boundaries-1: src/bot_intevra/**init**.py may mishandle retries, idempotency, external contract errors, or cross-service state handoff; (scope: `src/bot_intevra/__init__.py`)
- risk-integration-and-orchestration-boundaries-2: src/bot_intevra/**main**.py may mishandle retries, idempotency, external contract errors, or cross-service state handoff; (scope: `src/bot_intevra/__main__.py`)
- risk-integration-and-orchestration-boundaries-3: src/bot_intevra/attachments.py may mishandle retries, idempotency, external contract errors, or cross-service state handoff; (scope: `src/bot_intevra/attachments.py`)
- risk-integration-and-orchestration-boundaries-4: src/bot_intevra/backup_crypto.py may mishandle retries, idempotency, external contract errors, or cross-service state handoff; (scope: `src/bot_intevra/backup_crypto.py`)
- risk-integration-and-orchestration-boundaries-5: src/bot_intevra/bot.py may mishandle retries, idempotency, external contract errors, or cross-service state handoff; (scope: `src/bot_intevra/bot.py`)
- risk-integration-and-orchestration-boundaries-6: src/bot_intevra/cli.py may mishandle retries, idempotency, external contract errors, or cross-service state handoff (scope: `src/bot_intevra/cli.py`)

## Evidence Register

| Scope                              | Checked evidence                                                                                                 | Verification                                                                                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/bot_intevra/__init__.py`      | `src/bot_intevra/__init__.py:1`, `src/bot_intevra/__init__.py:3`, `src/bot_intevra/__init__.py:5`                | Command `git grep -n . -- src/bot_intevra/__init__.py` output includes `src/bot_intevra/__init__.py:1:"""Single-user Telegram bot with local inbox storage and Shared Memory sync."""` |
| `src/bot_intevra/__main__.py`      | `src/bot_intevra/__main__.py:1`, `src/bot_intevra/__main__.py:4`, `src/bot_intevra/__main__.py:5`                | Command `git grep -n . -- src/bot_intevra/__main__.py` output includes `src/bot_intevra/__main__.py:1:from bot_intevra.cli import main`                                                |
| `src/bot_intevra/attachments.py`   | `src/bot_intevra/attachments.py:1`, `src/bot_intevra/attachments.py:3`, `src/bot_intevra/attachments.py:4`       | Command `git grep -n . -- src/bot_intevra/attachments.py` output includes `src/bot_intevra/attachments.py:1:from __future__ import annotations`                                        |
| `src/bot_intevra/backup_crypto.py` | `src/bot_intevra/backup_crypto.py:1`, `src/bot_intevra/backup_crypto.py:3`, `src/bot_intevra/backup_crypto.py:4` | Command `git grep -n . -- src/bot_intevra/backup_crypto.py` output includes `src/bot_intevra/backup_crypto.py:1:from __future__ import annotations`                                    |
| `src/bot_intevra/bot.py`           | `src/bot_intevra/bot.py:1`, `src/bot_intevra/bot.py:3`, `src/bot_intevra/bot.py:4`                               | Command `git grep -n . -- src/bot_intevra/bot.py` output includes `src/bot_intevra/bot.py:1:from __future__ import annotations`                                                        |
| `src/bot_intevra/cli.py`           | `src/bot_intevra/cli.py:1`, `src/bot_intevra/cli.py:3`, `src/bot_intevra/cli.py:4`                               | Command `git grep -n . -- src/bot_intevra/cli.py` output includes `src/bot_intevra/cli.py:1:from __future__ import annotations`                                                        |

## No-Findings Claims

- Absence reasoning: risk-integration-and-orchestration-boundaries-1 covered `src/bot_intevra/__init__.py:1`, `src/bot_intevra/__init__.py:3`, `src/bot_intevra/__init__.py:5`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-integration-and-orchestration-boundaries-2 covered `src/bot_intevra/__main__.py:1`, `src/bot_intevra/__main__.py:4`, `src/bot_intevra/__main__.py:5`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-integration-and-orchestration-boundaries-3 covered `src/bot_intevra/attachments.py:1`, `src/bot_intevra/attachments.py:3`, `src/bot_intevra/attachments.py:4`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-integration-and-orchestration-boundaries-4 covered `src/bot_intevra/backup_crypto.py:1`, `src/bot_intevra/backup_crypto.py:3`, `src/bot_intevra/backup_crypto.py:4`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-integration-and-orchestration-boundaries-5 covered `src/bot_intevra/bot.py:1`, `src/bot_intevra/bot.py:3`, `src/bot_intevra/bot.py:4`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-integration-and-orchestration-boundaries-6 covered `src/bot_intevra/cli.py:1`, `src/bot_intevra/cli.py:3`, `src/bot_intevra/cli.py:4`; no actionable finding was identified in the scoped inspection.

## Risk-Specific Evidence

- risk-integration-and-orchestration-boundaries-2 / `src/bot_intevra/__main__.py`: Command `git grep -n -m 1 -E "main__|mishandle|retries|idempotency|external|contract" -- src/bot_intevra/__main__.py` output includes `src/bot_intevra/__main__.py:4:if __name__ == "__main__":`

## Checked Files

- `src/bot_intevra/__init__.py:1`
- `src/bot_intevra/__init__.py:3`
- `src/bot_intevra/__init__.py:5`
- `src/bot_intevra/__main__.py:1`
- `src/bot_intevra/__main__.py:4`
- `src/bot_intevra/__main__.py:5`
- `src/bot_intevra/attachments.py:1`
- `src/bot_intevra/attachments.py:3`
- `src/bot_intevra/attachments.py:4`
- `src/bot_intevra/backup_crypto.py:1`
- `src/bot_intevra/backup_crypto.py:3`
- `src/bot_intevra/backup_crypto.py:4`
- `src/bot_intevra/bot.py:1`
- `src/bot_intevra/bot.py:3`
- `src/bot_intevra/bot.py:4`
- `src/bot_intevra/cli.py:1`
- `src/bot_intevra/cli.py:3`
- `src/bot_intevra/cli.py:4`

## Checked Commands

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

- Command `git grep -n -m 1 -E "main__|mishandle|retries|idempotency|external|contract" -- src/bot_intevra/__main__.py` output:

```
src/bot_intevra/__main__.py:4:if __name__ == "__main__":
```

```audit-report-manifest
{
  "version": 1,
  "auditPlanId": "batch:73b941eb-39f1-4b87-8c02-555722c186be:task:e42198b0-a469-44c2-9d19-004fc53c5e17",
  "taskId": "e42198b0-a469-44c2-9d19-004fc53c5e17",
  "batchId": "73b941eb-39f1-4b87-8c02-555722c186be",
  "roadmapAlias": "audit-e2e-20260520-144306-h",
  "artifactPath": "audit/2026-05-20-audit-integration-and-orchestration-boundaries-audit.md",
  "contentSha256": "57d0914ae8d44ca7b8212b2e2d0f77c324a9b692c197320a4445c8ac9498a67b",
  "sourceSnapshot": {
    "id": "git:5ffb91e687edffd2d4ee2fb3798178a33d8795ae:04b4d1afcfe7d561f8de4dcb61d0e017e0897bad",
    "commit": "5ffb91e687edffd2d4ee2fb3798178a33d8795ae",
    "tree": "04b4d1afcfe7d561f8de4dcb61d0e017e0897bad",
    "branch": "feature/audit-integration-and-orchestration-boun-e42198",
    "dirty": false
  },
  "outcome": "validated_no_findings",
  "scopeCoverage": [
    {
      "root": "src/bot_intevra/__init__.py",
      "covered": true,
      "evidenceRefs": [
        "ev_c42ecee1-9df3-4fec-ab85-97d16ba81d38"
      ]
    },
    {
      "root": "src/bot_intevra/__main__.py",
      "covered": true,
      "evidenceRefs": [
        "ev_928ae05a-0e01-4a89-a77e-fcf5cba3d5e5",
        "ev_cb14a4d9-0d7a-476d-89ad-5dff2759b994"
      ]
    },
    {
      "root": "src/bot_intevra/attachments.py",
      "covered": true,
      "evidenceRefs": [
        "ev_daba2aa2-1430-4f4f-8679-e0e9eccf693b"
      ]
    },
    {
      "root": "src/bot_intevra/backup_crypto.py",
      "covered": true,
      "evidenceRefs": [
        "ev_33db8726-5e0b-4004-a6f4-b12349ae31a0"
      ]
    },
    {
      "root": "src/bot_intevra/bot.py",
      "covered": true,
      "evidenceRefs": [
        "ev_eb9d4eed-8b93-4eb2-a14c-ab13d96d7db0"
      ]
    },
    {
      "root": "src/bot_intevra/cli.py",
      "covered": true,
      "evidenceRefs": [
        "ev_bd4ef906-3ed2-4dc3-b5bd-5f1936dfb822"
      ]
    }
  ],
  "riskHypotheses": [
    {
      "id": "risk-integration-and-orchestration-boundaries-1",
      "description": "src/bot_intevra/__init__.py may mishandle retries, idempotency, external contract errors, or cross-service state handoff;",
      "scopeIds": [
        "src/bot_intevra/__init__.py"
      ],
      "evidenceRefs": [
        "ev_c42ecee1-9df3-4fec-ab85-97d16ba81d38"
      ],
      "status": "covered"
    },
    {
      "id": "risk-integration-and-orchestration-boundaries-2",
      "description": "src/bot_intevra/__main__.py may mishandle retries, idempotency, external contract errors, or cross-service state handoff;",
      "scopeIds": [
        "src/bot_intevra/__main__.py"
      ],
      "evidenceRefs": [
        "ev_928ae05a-0e01-4a89-a77e-fcf5cba3d5e5",
        "ev_cb14a4d9-0d7a-476d-89ad-5dff2759b994"
      ],
      "status": "covered"
    },
    {
      "id": "risk-integration-and-orchestration-boundaries-3",
      "description": "src/bot_intevra/attachments.py may mishandle retries, idempotency, external contract errors, or cross-service state handoff;",
      "scopeIds": [
        "src/bot_intevra/attachments.py"
      ],
      "evidenceRefs": [
        "ev_daba2aa2-1430-4f4f-8679-e0e9eccf693b"
      ],
      "status": "covered"
    },
    {
      "id": "risk-integration-and-orchestration-boundaries-4",
      "description": "src/bot_intevra/backup_crypto.py may mishandle retries, idempotency, external contract errors, or cross-service state handoff;",
      "scopeIds": [
        "src/bot_intevra/backup_crypto.py"
      ],
      "evidenceRefs": [
        "ev_33db8726-5e0b-4004-a6f4-b12349ae31a0"
      ],
      "status": "covered"
    },
    {
      "id": "risk-integration-and-orchestration-boundaries-5",
      "description": "src/bot_intevra/bot.py may mishandle retries, idempotency, external contract errors, or cross-service state handoff;",
      "scopeIds": [
        "src/bot_intevra/bot.py"
      ],
      "evidenceRefs": [
        "ev_eb9d4eed-8b93-4eb2-a14c-ab13d96d7db0"
      ],
      "status": "covered"
    },
    {
      "id": "risk-integration-and-orchestration-boundaries-6",
      "description": "src/bot_intevra/cli.py may mishandle retries, idempotency, external contract errors, or cross-service state handoff",
      "scopeIds": [
        "src/bot_intevra/cli.py"
      ],
      "evidenceRefs": [
        "ev_bd4ef906-3ed2-4dc3-b5bd-5f1936dfb822"
      ],
      "status": "covered"
    }
  ],
  "findings": [],
  "noFindingsClaims": [
    {
      "id": "nf-deterministic-repair",
      "scopeIds": [
        "src/bot_intevra/__init__.py",
        "src/bot_intevra/__main__.py",
        "src/bot_intevra/attachments.py",
        "src/bot_intevra/backup_crypto.py",
        "src/bot_intevra/bot.py",
        "src/bot_intevra/cli.py"
      ],
      "evidenceRefs": [
        "ev_33db8726-5e0b-4004-a6f4-b12349ae31a0",
        "ev_928ae05a-0e01-4a89-a77e-fcf5cba3d5e5",
        "ev_bd4ef906-3ed2-4dc3-b5bd-5f1936dfb822",
        "ev_c42ecee1-9df3-4fec-ab85-97d16ba81d38",
        "ev_cb14a4d9-0d7a-476d-89ad-5dff2759b994",
        "ev_daba2aa2-1430-4f4f-8679-e0e9eccf693b",
        "ev_eb9d4eed-8b93-4eb2-a14c-ab13d96d7db0"
      ],
      "riskIds": [
        "risk-integration-and-orchestration-boundaries-1",
        "risk-integration-and-orchestration-boundaries-2",
        "risk-integration-and-orchestration-boundaries-3",
        "risk-integration-and-orchestration-boundaries-4",
        "risk-integration-and-orchestration-boundaries-5",
        "risk-integration-and-orchestration-boundaries-6"
      ],
      "reasoning": "Deterministic repair used scoped source inspections and removed unvalidated candidate findings."
    }
  ],
  "evidenceRefs": [
    "ev_33db8726-5e0b-4004-a6f4-b12349ae31a0",
    "ev_928ae05a-0e01-4a89-a77e-fcf5cba3d5e5",
    "ev_bd4ef906-3ed2-4dc3-b5bd-5f1936dfb822",
    "ev_c42ecee1-9df3-4fec-ab85-97d16ba81d38",
    "ev_cb14a4d9-0d7a-476d-89ad-5dff2759b994",
    "ev_daba2aa2-1430-4f4f-8679-e0e9eccf693b",
    "ev_eb9d4eed-8b93-4eb2-a14c-ab13d96d7db0"
  ]
}
```
