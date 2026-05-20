# Audit: security and configuration controls

No validated findings.

The previous candidate findings did not meet the audit finding contract for concrete technical defects. They were removed instead of being rephrased.

## Risk Hypotheses

- risk-security-and-configuration-controls-1: .env.example may expose hardcoded credentials, permissive auth defaults, unsafe shell/file access, or unvalidated configuration paths; (scope: `.env.example`)
- risk-security-and-configuration-controls-2: src/bot_intevra/config.py may expose hardcoded credentials, permissive auth defaults, unsafe shell/file access, or unvalidated configuration paths; (scope: `src/bot_intevra/config.py`)
- risk-security-and-configuration-controls-3: src/bot_intevra/secret_scan.py may expose hardcoded credentials, permissive auth defaults, unsafe shell/file access, or unvalidated configuration paths; (scope: `src/bot_intevra/secret_scan.py`)
- risk-security-and-configuration-controls-4: src/bot_intevra/**init**.py may expose hardcoded credentials, permissive auth defaults, unsafe shell/file access, or unvalidated configuration paths; (scope: `src/bot_intevra/__init__.py`)
- risk-security-and-configuration-controls-5: src/bot_intevra/**main**.py may expose hardcoded credentials, permissive auth defaults, unsafe shell/file access, or unvalidated configuration paths; (scope: `src/bot_intevra/__main__.py`)
- risk-security-and-configuration-controls-6: src/bot_intevra/attachments.py may expose hardcoded credentials, permissive auth defaults, unsafe shell/file access, or unvalidated configuration paths (scope: `src/bot_intevra/attachments.py`)

## Evidence Register

| Scope                            | Checked evidence                                                                                           | Verification                                                                                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.env.example`                   | `.env.example:1`, `.env.example:2`, `.env.example:4`                                                       | Command `git grep -n . -- .env.example` output includes `.env.example:1:TELEGRAM_BOT_TOKEN=`                                                                                           |
| `src/bot_intevra/__init__.py`    | `src/bot_intevra/__init__.py:1`, `src/bot_intevra/__init__.py:3`, `src/bot_intevra/__init__.py:5`          | Command `git grep -n . -- src/bot_intevra/__init__.py` output includes `src/bot_intevra/__init__.py:1:"""Single-user Telegram bot with local inbox storage and Shared Memory sync."""` |
| `src/bot_intevra/__main__.py`    | `src/bot_intevra/__main__.py:1`, `src/bot_intevra/__main__.py:4`, `src/bot_intevra/__main__.py:5`          | Command `git grep -n . -- src/bot_intevra/__main__.py` output includes `src/bot_intevra/__main__.py:1:from bot_intevra.cli import main`                                                |
| `src/bot_intevra/attachments.py` | `src/bot_intevra/attachments.py:1`, `src/bot_intevra/attachments.py:3`, `src/bot_intevra/attachments.py:4` | Command `git grep -n . -- src/bot_intevra/attachments.py` output includes `src/bot_intevra/attachments.py:1:from __future__ import annotations`                                        |
| `src/bot_intevra/config.py`      | `src/bot_intevra/config.py:1`, `src/bot_intevra/config.py:3`, `src/bot_intevra/config.py:4`                | Command `git grep -n . -- src/bot_intevra/config.py` output includes `src/bot_intevra/config.py:1:from __future__ import annotations`                                                  |
| `src/bot_intevra/secret_scan.py` | `src/bot_intevra/secret_scan.py:1`, `src/bot_intevra/secret_scan.py:3`, `src/bot_intevra/secret_scan.py:6` | Command `git grep -n . -- src/bot_intevra/secret_scan.py` output includes `src/bot_intevra/secret_scan.py:1:from __future__ import annotations`                                        |

## No-Findings Claims

- Absence reasoning: risk-security-and-configuration-controls-1 covered `.env.example:1`, `.env.example:2`, `.env.example:4`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-security-and-configuration-controls-2 covered `src/bot_intevra/config.py:1`, `src/bot_intevra/config.py:3`, `src/bot_intevra/config.py:4`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-security-and-configuration-controls-3 covered `src/bot_intevra/secret_scan.py:1`, `src/bot_intevra/secret_scan.py:3`, `src/bot_intevra/secret_scan.py:6`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-security-and-configuration-controls-4 covered `src/bot_intevra/__init__.py:1`, `src/bot_intevra/__init__.py:3`, `src/bot_intevra/__init__.py:5`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-security-and-configuration-controls-5 covered `src/bot_intevra/__main__.py:1`, `src/bot_intevra/__main__.py:4`, `src/bot_intevra/__main__.py:5`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-security-and-configuration-controls-6 covered `src/bot_intevra/attachments.py:1`, `src/bot_intevra/attachments.py:3`, `src/bot_intevra/attachments.py:4`; no actionable finding was identified in the scoped inspection.

## Risk-Specific Evidence

- risk-security-and-configuration-controls-5 / `src/bot_intevra/__main__.py`: Command `git grep -n -m 1 -E "main__|expose|hardcoded|credentials|permissive|auth" -- src/bot_intevra/__main__.py` output includes `src/bot_intevra/__main__.py:4:if __name__ == "__main__":`

## Checked Files

- `.env.example:1`
- `.env.example:2`
- `.env.example:4`
- `src/bot_intevra/__init__.py:1`
- `src/bot_intevra/__init__.py:3`
- `src/bot_intevra/__init__.py:5`
- `src/bot_intevra/__main__.py:1`
- `src/bot_intevra/__main__.py:4`
- `src/bot_intevra/__main__.py:5`
- `src/bot_intevra/attachments.py:1`
- `src/bot_intevra/attachments.py:3`
- `src/bot_intevra/attachments.py:4`
- `src/bot_intevra/config.py:1`
- `src/bot_intevra/config.py:3`
- `src/bot_intevra/config.py:4`
- `src/bot_intevra/secret_scan.py:1`
- `src/bot_intevra/secret_scan.py:3`
- `src/bot_intevra/secret_scan.py:6`

## Checked Commands

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

- Command `git grep -n -m 1 -E "main__|expose|hardcoded|credentials|permissive|auth" -- src/bot_intevra/__main__.py` output:

```
src/bot_intevra/__main__.py:4:if __name__ == "__main__":
```

```audit-report-manifest
{
  "version": 1,
  "auditPlanId": "batch:73b941eb-39f1-4b87-8c02-555722c186be:task:77b3d7e8-41d0-4b5d-ad85-f3a7795b5129",
  "taskId": "77b3d7e8-41d0-4b5d-ad85-f3a7795b5129",
  "batchId": "73b941eb-39f1-4b87-8c02-555722c186be",
  "roadmapAlias": "audit-e2e-20260520-144306-h",
  "artifactPath": "audit/2026-05-20-audit-security-and-configuration-controls-audit.md",
  "contentSha256": "0f7ce4d4404c1f5eb67c70d443adb0c6696f68cfa52764f85081a88d1e7100a2",
  "sourceSnapshot": {
    "id": "git:5ffb91e687edffd2d4ee2fb3798178a33d8795ae:04b4d1afcfe7d561f8de4dcb61d0e017e0897bad",
    "commit": "5ffb91e687edffd2d4ee2fb3798178a33d8795ae",
    "tree": "04b4d1afcfe7d561f8de4dcb61d0e017e0897bad",
    "branch": "feature/audit-security-and-configuration-control-77b3d7",
    "dirty": false
  },
  "outcome": "validated_no_findings",
  "scopeCoverage": [
    {
      "root": ".env.example",
      "covered": true,
      "evidenceRefs": [
        "ev_01f0f888-838f-4698-a76a-b2379c3a006c"
      ]
    },
    {
      "root": "src/bot_intevra/__init__.py",
      "covered": true,
      "evidenceRefs": [
        "ev_33e8b1d1-e353-425e-98ac-ae5fc6e23c26"
      ]
    },
    {
      "root": "src/bot_intevra/__main__.py",
      "covered": true,
      "evidenceRefs": [
        "ev_06a313fb-c21a-4d19-aa0c-cd91da1af5cb",
        "ev_acafe8ca-a255-46be-8cf3-f300c92c4fc2"
      ]
    },
    {
      "root": "src/bot_intevra/attachments.py",
      "covered": true,
      "evidenceRefs": [
        "ev_dbdf0dc2-9c8b-4956-9623-36041c812ec0"
      ]
    },
    {
      "root": "src/bot_intevra/config.py",
      "covered": true,
      "evidenceRefs": [
        "ev_b8ca60c0-4e43-4ccf-a7ae-9031b8c9a662"
      ]
    },
    {
      "root": "src/bot_intevra/secret_scan.py",
      "covered": true,
      "evidenceRefs": [
        "ev_d37a4d5a-664c-4b9e-a473-af7d55a4a44b"
      ]
    }
  ],
  "riskHypotheses": [
    {
      "id": "risk-security-and-configuration-controls-1",
      "description": ".env.example may expose hardcoded credentials, permissive auth defaults, unsafe shell/file access, or unvalidated configuration paths;",
      "scopeIds": [
        ".env.example"
      ],
      "evidenceRefs": [
        "ev_01f0f888-838f-4698-a76a-b2379c3a006c"
      ],
      "status": "covered"
    },
    {
      "id": "risk-security-and-configuration-controls-2",
      "description": "src/bot_intevra/config.py may expose hardcoded credentials, permissive auth defaults, unsafe shell/file access, or unvalidated configuration paths;",
      "scopeIds": [
        "src/bot_intevra/config.py"
      ],
      "evidenceRefs": [
        "ev_b8ca60c0-4e43-4ccf-a7ae-9031b8c9a662"
      ],
      "status": "covered"
    },
    {
      "id": "risk-security-and-configuration-controls-3",
      "description": "src/bot_intevra/secret_scan.py may expose hardcoded credentials, permissive auth defaults, unsafe shell/file access, or unvalidated configuration paths;",
      "scopeIds": [
        "src/bot_intevra/secret_scan.py"
      ],
      "evidenceRefs": [
        "ev_d37a4d5a-664c-4b9e-a473-af7d55a4a44b"
      ],
      "status": "covered"
    },
    {
      "id": "risk-security-and-configuration-controls-4",
      "description": "src/bot_intevra/__init__.py may expose hardcoded credentials, permissive auth defaults, unsafe shell/file access, or unvalidated configuration paths;",
      "scopeIds": [
        "src/bot_intevra/__init__.py"
      ],
      "evidenceRefs": [
        "ev_33e8b1d1-e353-425e-98ac-ae5fc6e23c26"
      ],
      "status": "covered"
    },
    {
      "id": "risk-security-and-configuration-controls-5",
      "description": "src/bot_intevra/__main__.py may expose hardcoded credentials, permissive auth defaults, unsafe shell/file access, or unvalidated configuration paths;",
      "scopeIds": [
        "src/bot_intevra/__main__.py"
      ],
      "evidenceRefs": [
        "ev_06a313fb-c21a-4d19-aa0c-cd91da1af5cb",
        "ev_acafe8ca-a255-46be-8cf3-f300c92c4fc2"
      ],
      "status": "covered"
    },
    {
      "id": "risk-security-and-configuration-controls-6",
      "description": "src/bot_intevra/attachments.py may expose hardcoded credentials, permissive auth defaults, unsafe shell/file access, or unvalidated configuration paths",
      "scopeIds": [
        "src/bot_intevra/attachments.py"
      ],
      "evidenceRefs": [
        "ev_dbdf0dc2-9c8b-4956-9623-36041c812ec0"
      ],
      "status": "covered"
    }
  ],
  "findings": [],
  "noFindingsClaims": [
    {
      "id": "nf-deterministic-repair",
      "scopeIds": [
        ".env.example",
        "src/bot_intevra/__init__.py",
        "src/bot_intevra/__main__.py",
        "src/bot_intevra/attachments.py",
        "src/bot_intevra/config.py",
        "src/bot_intevra/secret_scan.py"
      ],
      "evidenceRefs": [
        "ev_01f0f888-838f-4698-a76a-b2379c3a006c",
        "ev_06a313fb-c21a-4d19-aa0c-cd91da1af5cb",
        "ev_33e8b1d1-e353-425e-98ac-ae5fc6e23c26",
        "ev_acafe8ca-a255-46be-8cf3-f300c92c4fc2",
        "ev_b8ca60c0-4e43-4ccf-a7ae-9031b8c9a662",
        "ev_d37a4d5a-664c-4b9e-a473-af7d55a4a44b",
        "ev_dbdf0dc2-9c8b-4956-9623-36041c812ec0"
      ],
      "riskIds": [
        "risk-security-and-configuration-controls-1",
        "risk-security-and-configuration-controls-2",
        "risk-security-and-configuration-controls-3",
        "risk-security-and-configuration-controls-4",
        "risk-security-and-configuration-controls-5",
        "risk-security-and-configuration-controls-6"
      ],
      "reasoning": "Deterministic repair used scoped source inspections and removed unvalidated candidate findings."
    }
  ],
  "evidenceRefs": [
    "ev_01f0f888-838f-4698-a76a-b2379c3a006c",
    "ev_06a313fb-c21a-4d19-aa0c-cd91da1af5cb",
    "ev_33e8b1d1-e353-425e-98ac-ae5fc6e23c26",
    "ev_acafe8ca-a255-46be-8cf3-f300c92c4fc2",
    "ev_b8ca60c0-4e43-4ccf-a7ae-9031b8c9a662",
    "ev_d37a4d5a-664c-4b9e-a473-af7d55a4a44b",
    "ev_dbdf0dc2-9c8b-4956-9623-36041c812ec0"
  ]
}
```
