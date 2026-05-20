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
  "auditPlanId": "batch:f8635f40-8aba-45fd-8251-2c6f852a8de6:task:ac38e200-0eeb-4bac-b13f-db4d8b6467cd",
  "taskId": "ac38e200-0eeb-4bac-b13f-db4d8b6467cd",
  "batchId": "f8635f40-8aba-45fd-8251-2c6f852a8de6",
  "roadmapAlias": "audit-e2e-20260520-143848-g",
  "artifactPath": "audit/2026-05-20-audit-persistence-and-data-safety-audit.md",
  "contentSha256": "8f23672bdc29a6fed2435b91cfa6b8b83fd6f06f4e7e5ceba5174e28bc32cf47",
  "sourceSnapshot": {
    "id": "git:94218d9cf03c8a603f17e3cce717dba38c67e0c8:a5514a03143fb7f4ab8f97fad4f85bc438454c68",
    "commit": "94218d9cf03c8a603f17e3cce717dba38c67e0c8",
    "tree": "a5514a03143fb7f4ab8f97fad4f85bc438454c68",
    "branch": "feature/audit-persistence-and-data-safety-ac38e2",
    "dirty": false
  },
  "outcome": "validated_no_findings",
  "scopeCoverage": [
    {
      "root": "src/bot_intevra/__init__.py",
      "covered": true,
      "evidenceRefs": [
        "ev_cfe12cd1-2a96-4502-964b-f9ff8989a77d"
      ]
    },
    {
      "root": "src/bot_intevra/__main__.py",
      "covered": true,
      "evidenceRefs": [
        "ev_44755551-5680-4938-a1e5-83807eeca37b",
        "ev_67141dfb-8765-4fe4-9fb9-f1253ab8c30c"
      ]
    },
    {
      "root": "src/bot_intevra/attachments.py",
      "covered": true,
      "evidenceRefs": [
        "ev_9c1afdd8-dbd4-4f16-a7bd-2c081284fbb1"
      ]
    },
    {
      "root": "src/bot_intevra/backup_crypto.py",
      "covered": true,
      "evidenceRefs": [
        "ev_ca5e7125-850b-423d-8282-f7e24d203e4e"
      ]
    },
    {
      "root": "src/bot_intevra/db.py",
      "covered": true,
      "evidenceRefs": [
        "ev_4f4bc569-6408-4c90-b0b8-158cefd76bf1",
        "ev_f634b269-2355-48e9-afed-816477ec050f"
      ]
    },
    {
      "root": "src/bot_intevra/models.py",
      "covered": true,
      "evidenceRefs": [
        "ev_d2174867-6c51-4d02-ad9f-c9752835adba"
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
        "ev_4f4bc569-6408-4c90-b0b8-158cefd76bf1",
        "ev_f634b269-2355-48e9-afed-816477ec050f"
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
        "ev_d2174867-6c51-4d02-ad9f-c9752835adba"
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
        "ev_cfe12cd1-2a96-4502-964b-f9ff8989a77d"
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
        "ev_44755551-5680-4938-a1e5-83807eeca37b",
        "ev_67141dfb-8765-4fe4-9fb9-f1253ab8c30c"
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
        "ev_9c1afdd8-dbd4-4f16-a7bd-2c081284fbb1"
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
        "ev_ca5e7125-850b-423d-8282-f7e24d203e4e"
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
        "ev_44755551-5680-4938-a1e5-83807eeca37b",
        "ev_4f4bc569-6408-4c90-b0b8-158cefd76bf1",
        "ev_67141dfb-8765-4fe4-9fb9-f1253ab8c30c",
        "ev_9c1afdd8-dbd4-4f16-a7bd-2c081284fbb1",
        "ev_ca5e7125-850b-423d-8282-f7e24d203e4e",
        "ev_cfe12cd1-2a96-4502-964b-f9ff8989a77d",
        "ev_d2174867-6c51-4d02-ad9f-c9752835adba",
        "ev_f634b269-2355-48e9-afed-816477ec050f"
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
    "ev_44755551-5680-4938-a1e5-83807eeca37b",
    "ev_4f4bc569-6408-4c90-b0b8-158cefd76bf1",
    "ev_67141dfb-8765-4fe4-9fb9-f1253ab8c30c",
    "ev_9c1afdd8-dbd4-4f16-a7bd-2c081284fbb1",
    "ev_ca5e7125-850b-423d-8282-f7e24d203e4e",
    "ev_cfe12cd1-2a96-4502-964b-f9ff8989a77d",
    "ev_d2174867-6c51-4d02-ad9f-c9752835adba",
    "ev_f634b269-2355-48e9-afed-816477ec050f"
  ]
}
```
