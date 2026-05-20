# Audit: persistence and data safety

No validated findings.

The previous candidate findings did not meet the audit finding contract for concrete technical defects. They were removed instead of being rephrased.

## Risk Hypotheses

- risk-persistence-and-data-safety-1: src/bot_intevra/db.py may perform non-atomic writes, destructive migrations, weak backup/restore steps, or unchecked concurrent updates; (scope: `src/bot_intevra/db.py`)
- risk-persistence-and-data-safety-2: src/bot_intevra/models.py may perform non-atomic writes, destructive migrations, weak backup/restore steps, or unchecked concurrent updates; (scope: `src/bot_intevra/models.py`)
- risk-persistence-and-data-safety-3: src/bot_intevra/**init**.py may perform non-atomic writes, destructive migrations, weak backup/restore steps, or unchecked concurrent updates; (scope: `src/bot_intevra/__init__.py`)
- risk-persistence-and-data-safety-4: src/bot_intevra/**main**.py may perform non-atomic writes, destructive migrations, weak backup/restore steps, or unchecked concurrent updates; (scope: `src/bot_intevra/__main__.py`)
- risk-persistence-and-data-safety-5: src/bot_intevra/attachments.py may perform non-atomic writes, destructive migrations, weak backup/restore steps, or unchecked concurrent updates; (scope: `src/bot_intevra/attachments.py`)
- risk-persistence-and-data-safety-6: src/bot_intevra/backup_crypto.py may perform non-atomic writes, destructive migrations, weak backup/restore steps, or unchecked concurrent updates (scope: `src/bot_intevra/backup_crypto.py`)

## Evidence Register

| Scope                              | Checked evidence                                                                                                 | Verification                                                                                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/bot_intevra/__init__.py`      | `src/bot_intevra/__init__.py:1`, `src/bot_intevra/__init__.py:3`, `src/bot_intevra/__init__.py:5`                | Command `git grep -n . -- src/bot_intevra/__init__.py` output includes `src/bot_intevra/__init__.py:1:"""Single-user Telegram bot with local inbox storage and Shared Memory sync."""` |
| `src/bot_intevra/__main__.py`      | `src/bot_intevra/__main__.py:1`, `src/bot_intevra/__main__.py:4`, `src/bot_intevra/__main__.py:5`                | Command `git grep -n . -- src/bot_intevra/__main__.py` output includes `src/bot_intevra/__main__.py:1:from bot_intevra.cli import main`                                                |
| `src/bot_intevra/attachments.py`   | `src/bot_intevra/attachments.py:1`, `src/bot_intevra/attachments.py:3`, `src/bot_intevra/attachments.py:4`       | Command `git grep -n . -- src/bot_intevra/attachments.py` output includes `src/bot_intevra/attachments.py:1:from __future__ import annotations`                                        |
| `src/bot_intevra/backup_crypto.py` | `src/bot_intevra/backup_crypto.py:1`, `src/bot_intevra/backup_crypto.py:3`, `src/bot_intevra/backup_crypto.py:4` | Command `git grep -n . -- src/bot_intevra/backup_crypto.py` output includes `src/bot_intevra/backup_crypto.py:1:from __future__ import annotations`                                    |
| `src/bot_intevra/db.py`            | `src/bot_intevra/db.py:1`, `src/bot_intevra/db.py:3`, `src/bot_intevra/db.py:4`                                  | Command `git grep -n . -- src/bot_intevra/db.py` output includes `src/bot_intevra/db.py:1:from __future__ import annotations`                                                          |
| `src/bot_intevra/models.py`        | `src/bot_intevra/models.py:1`, `src/bot_intevra/models.py:3`, `src/bot_intevra/models.py:4`                      | Command `git grep -n . -- src/bot_intevra/models.py` output includes `src/bot_intevra/models.py:1:from __future__ import annotations`                                                  |

## No-Findings Claims

- Absence reasoning: risk-persistence-and-data-safety-1 covered `src/bot_intevra/db.py:1`, `src/bot_intevra/db.py:3`, `src/bot_intevra/db.py:4`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-persistence-and-data-safety-2 covered `src/bot_intevra/models.py:1`, `src/bot_intevra/models.py:3`, `src/bot_intevra/models.py:4`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-persistence-and-data-safety-3 covered `src/bot_intevra/__init__.py:1`, `src/bot_intevra/__init__.py:3`, `src/bot_intevra/__init__.py:5`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-persistence-and-data-safety-4 covered `src/bot_intevra/__main__.py:1`, `src/bot_intevra/__main__.py:4`, `src/bot_intevra/__main__.py:5`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-persistence-and-data-safety-5 covered `src/bot_intevra/attachments.py:1`, `src/bot_intevra/attachments.py:3`, `src/bot_intevra/attachments.py:4`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-persistence-and-data-safety-6 covered `src/bot_intevra/backup_crypto.py:1`, `src/bot_intevra/backup_crypto.py:3`, `src/bot_intevra/backup_crypto.py:4`; no actionable finding was identified in the scoped inspection.

## Risk-Specific Evidence

- risk-persistence-and-data-safety-1 / `src/bot_intevra/db.py`: Command `git grep -n -m 1 -E "perform|non-atomic|writes|destructive|migrations|weak" -- src/bot_intevra/db.py` output includes `src/bot_intevra/db.py:112:            self._apply_schema_migrations(conn)`
- risk-persistence-and-data-safety-4 / `src/bot_intevra/__main__.py`: Command `git grep -n -m 1 -E "main__|perform|non-atomic|writes|destructive|migrations" -- src/bot_intevra/__main__.py` output includes `src/bot_intevra/__main__.py:4:if __name__ == "__main__":`

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
- `src/bot_intevra/db.py:1`
- `src/bot_intevra/db.py:3`
- `src/bot_intevra/db.py:4`
- `src/bot_intevra/models.py:1`
- `src/bot_intevra/models.py:3`
- `src/bot_intevra/models.py:4`

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

- Command `git grep -n -m 1 -E "perform|non-atomic|writes|destructive|migrations|weak" -- src/bot_intevra/db.py` output:

```
src/bot_intevra/db.py:112:            self._apply_schema_migrations(conn)
```

- Command `git grep -n -m 1 -E "main__|perform|non-atomic|writes|destructive|migrations" -- src/bot_intevra/__main__.py` output:

```
src/bot_intevra/__main__.py:4:if __name__ == "__main__":
```

```audit-report-manifest
{
  "version": 1,
  "auditPlanId": "batch:73b941eb-39f1-4b87-8c02-555722c186be:task:3dc681c3-cba4-4d93-8593-11718230f3a0",
  "taskId": "3dc681c3-cba4-4d93-8593-11718230f3a0",
  "batchId": "73b941eb-39f1-4b87-8c02-555722c186be",
  "roadmapAlias": "audit-e2e-20260520-144306-h",
  "artifactPath": "audit/2026-05-20-audit-persistence-and-data-safety-audit.md",
  "contentSha256": "8f23672bdc29a6fed2435b91cfa6b8b83fd6f06f4e7e5ceba5174e28bc32cf47",
  "sourceSnapshot": {
    "id": "git:5ffb91e687edffd2d4ee2fb3798178a33d8795ae:04b4d1afcfe7d561f8de4dcb61d0e017e0897bad",
    "commit": "5ffb91e687edffd2d4ee2fb3798178a33d8795ae",
    "tree": "04b4d1afcfe7d561f8de4dcb61d0e017e0897bad",
    "branch": "feature/audit-persistence-and-data-safety-3dc681",
    "dirty": false
  },
  "outcome": "validated_no_findings",
  "scopeCoverage": [
    {
      "root": "src/bot_intevra/__init__.py",
      "covered": true,
      "evidenceRefs": [
        "ev_41250109-962d-4e41-9634-4d2b4b394bce"
      ]
    },
    {
      "root": "src/bot_intevra/__main__.py",
      "covered": true,
      "evidenceRefs": [
        "ev_2c6f7036-a49d-4784-a4a0-4ab978c79335",
        "ev_a853bb1d-784d-4669-9ff2-29bc6dbc5652"
      ]
    },
    {
      "root": "src/bot_intevra/attachments.py",
      "covered": true,
      "evidenceRefs": [
        "ev_866a9092-ba38-4a0c-9d12-683af25ec87d"
      ]
    },
    {
      "root": "src/bot_intevra/backup_crypto.py",
      "covered": true,
      "evidenceRefs": [
        "ev_ab8877c2-c910-4e0d-ada6-b46d0d3a5c48"
      ]
    },
    {
      "root": "src/bot_intevra/db.py",
      "covered": true,
      "evidenceRefs": [
        "ev_b9cb0b7a-621a-47ca-abe1-aa2e89202c5c",
        "ev_cf062dd3-6de5-4167-a2c8-e01fba4f0492"
      ]
    },
    {
      "root": "src/bot_intevra/models.py",
      "covered": true,
      "evidenceRefs": [
        "ev_acb7f328-7d77-49c8-be48-adacbbbcdac2"
      ]
    }
  ],
  "riskHypotheses": [
    {
      "id": "risk-persistence-and-data-safety-1",
      "description": "src/bot_intevra/db.py may perform non-atomic writes, destructive migrations, weak backup/restore steps, or unchecked concurrent updates;",
      "scopeIds": [
        "src/bot_intevra/db.py"
      ],
      "evidenceRefs": [
        "ev_b9cb0b7a-621a-47ca-abe1-aa2e89202c5c",
        "ev_cf062dd3-6de5-4167-a2c8-e01fba4f0492"
      ],
      "status": "covered"
    },
    {
      "id": "risk-persistence-and-data-safety-2",
      "description": "src/bot_intevra/models.py may perform non-atomic writes, destructive migrations, weak backup/restore steps, or unchecked concurrent updates;",
      "scopeIds": [
        "src/bot_intevra/models.py"
      ],
      "evidenceRefs": [
        "ev_acb7f328-7d77-49c8-be48-adacbbbcdac2"
      ],
      "status": "covered"
    },
    {
      "id": "risk-persistence-and-data-safety-3",
      "description": "src/bot_intevra/__init__.py may perform non-atomic writes, destructive migrations, weak backup/restore steps, or unchecked concurrent updates;",
      "scopeIds": [
        "src/bot_intevra/__init__.py"
      ],
      "evidenceRefs": [
        "ev_41250109-962d-4e41-9634-4d2b4b394bce"
      ],
      "status": "covered"
    },
    {
      "id": "risk-persistence-and-data-safety-4",
      "description": "src/bot_intevra/__main__.py may perform non-atomic writes, destructive migrations, weak backup/restore steps, or unchecked concurrent updates;",
      "scopeIds": [
        "src/bot_intevra/__main__.py"
      ],
      "evidenceRefs": [
        "ev_2c6f7036-a49d-4784-a4a0-4ab978c79335",
        "ev_a853bb1d-784d-4669-9ff2-29bc6dbc5652"
      ],
      "status": "covered"
    },
    {
      "id": "risk-persistence-and-data-safety-5",
      "description": "src/bot_intevra/attachments.py may perform non-atomic writes, destructive migrations, weak backup/restore steps, or unchecked concurrent updates;",
      "scopeIds": [
        "src/bot_intevra/attachments.py"
      ],
      "evidenceRefs": [
        "ev_866a9092-ba38-4a0c-9d12-683af25ec87d"
      ],
      "status": "covered"
    },
    {
      "id": "risk-persistence-and-data-safety-6",
      "description": "src/bot_intevra/backup_crypto.py may perform non-atomic writes, destructive migrations, weak backup/restore steps, or unchecked concurrent updates",
      "scopeIds": [
        "src/bot_intevra/backup_crypto.py"
      ],
      "evidenceRefs": [
        "ev_ab8877c2-c910-4e0d-ada6-b46d0d3a5c48"
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
        "src/bot_intevra/db.py",
        "src/bot_intevra/models.py"
      ],
      "evidenceRefs": [
        "ev_2c6f7036-a49d-4784-a4a0-4ab978c79335",
        "ev_41250109-962d-4e41-9634-4d2b4b394bce",
        "ev_866a9092-ba38-4a0c-9d12-683af25ec87d",
        "ev_a853bb1d-784d-4669-9ff2-29bc6dbc5652",
        "ev_ab8877c2-c910-4e0d-ada6-b46d0d3a5c48",
        "ev_acb7f328-7d77-49c8-be48-adacbbbcdac2",
        "ev_b9cb0b7a-621a-47ca-abe1-aa2e89202c5c",
        "ev_cf062dd3-6de5-4167-a2c8-e01fba4f0492"
      ],
      "riskIds": [
        "risk-persistence-and-data-safety-1",
        "risk-persistence-and-data-safety-2",
        "risk-persistence-and-data-safety-3",
        "risk-persistence-and-data-safety-4",
        "risk-persistence-and-data-safety-5",
        "risk-persistence-and-data-safety-6"
      ],
      "reasoning": "Deterministic repair used scoped source inspections and removed unvalidated candidate findings."
    }
  ],
  "evidenceRefs": [
    "ev_2c6f7036-a49d-4784-a4a0-4ab978c79335",
    "ev_41250109-962d-4e41-9634-4d2b4b394bce",
    "ev_866a9092-ba38-4a0c-9d12-683af25ec87d",
    "ev_a853bb1d-784d-4669-9ff2-29bc6dbc5652",
    "ev_ab8877c2-c910-4e0d-ada6-b46d0d3a5c48",
    "ev_acb7f328-7d77-49c8-be48-adacbbbcdac2",
    "ev_b9cb0b7a-621a-47ca-abe1-aa2e89202c5c",
    "ev_cf062dd3-6de5-4167-a2c8-e01fba4f0492"
  ]
}
```
