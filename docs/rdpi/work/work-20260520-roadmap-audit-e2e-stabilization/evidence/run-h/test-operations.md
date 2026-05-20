# Audit: test and operations readiness

No validated findings.

The previous candidate findings did not meet the audit finding contract for concrete technical defects. They were removed instead of being rephrased.

## Risk Hypotheses

- risk-test-and-operations-readiness-1: tests/test_ask_contract_matrix.py may leave critical runtime behavior untested, release commands undocumented, or incident rollback procedures unverifiable; (scope: `tests/test_ask_contract_matrix.py`)
- risk-test-and-operations-readiness-2: tests/test_attachments.py may leave critical runtime behavior untested, release commands undocumented, or incident rollback procedures unverifiable; (scope: `tests/test_attachments.py`)
- risk-test-and-operations-readiness-3: tests/test_backup_crypto.py may leave critical runtime behavior untested, release commands undocumented, or incident rollback procedures unverifiable; (scope: `tests/test_backup_crypto.py`)
- risk-test-and-operations-readiness-4: tests/test_bot.py may leave critical runtime behavior untested, release commands undocumented, or incident rollback procedures unverifiable; (scope: `tests/test_bot.py`)
- risk-test-and-operations-readiness-5: tests/test_cli.py may leave critical runtime behavior untested, release commands undocumented, or incident rollback procedures unverifiable; (scope: `tests/test_cli.py`)
- risk-test-and-operations-readiness-6: tests/test_company_profile.py may leave critical runtime behavior untested, release commands undocumented, or incident rollback procedures unverifiable (scope: `tests/test_company_profile.py`)

## Evidence Register

| Scope                               | Checked evidence                                                                                                    | Verification                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/test_ask_contract_matrix.py` | `tests/test_ask_contract_matrix.py:1`, `tests/test_ask_contract_matrix.py:3`, `tests/test_ask_contract_matrix.py:4` | Command `git grep -n . -- tests/test_ask_contract_matrix.py` output includes `tests/test_ask_contract_matrix.py:1:from __future__ import annotations` |
| `tests/test_attachments.py`         | `tests/test_attachments.py:1`, `tests/test_attachments.py:3`, `tests/test_attachments.py:4`                         | Command `git grep -n . -- tests/test_attachments.py` output includes `tests/test_attachments.py:1:from __future__ import annotations`                 |
| `tests/test_backup_crypto.py`       | `tests/test_backup_crypto.py:1`, `tests/test_backup_crypto.py:3`, `tests/test_backup_crypto.py:4`                   | Command `git grep -n . -- tests/test_backup_crypto.py` output includes `tests/test_backup_crypto.py:1:from __future__ import annotations`             |
| `tests/test_bot.py`                 | `tests/test_bot.py:1`, `tests/test_bot.py:3`, `tests/test_bot.py:4`                                                 | Command `git grep -n . -- tests/test_bot.py` output includes `tests/test_bot.py:1:from __future__ import annotations`                                 |
| `tests/test_cli.py`                 | `tests/test_cli.py:1`, `tests/test_cli.py:3`, `tests/test_cli.py:4`                                                 | Command `git grep -n . -- tests/test_cli.py` output includes `tests/test_cli.py:1:from __future__ import annotations`                                 |
| `tests/test_company_profile.py`     | `tests/test_company_profile.py:1`, `tests/test_company_profile.py:3`, `tests/test_company_profile.py:4`             | Command `git grep -n . -- tests/test_company_profile.py` output includes `tests/test_company_profile.py:1:from __future__ import annotations`         |

## No-Findings Claims

- Absence reasoning: risk-test-and-operations-readiness-1 covered `tests/test_ask_contract_matrix.py:1`, `tests/test_ask_contract_matrix.py:3`, `tests/test_ask_contract_matrix.py:4`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-test-and-operations-readiness-2 covered `tests/test_attachments.py:1`, `tests/test_attachments.py:3`, `tests/test_attachments.py:4`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-test-and-operations-readiness-3 covered `tests/test_backup_crypto.py:1`, `tests/test_backup_crypto.py:3`, `tests/test_backup_crypto.py:4`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-test-and-operations-readiness-4 covered `tests/test_bot.py:1`, `tests/test_bot.py:3`, `tests/test_bot.py:4`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-test-and-operations-readiness-5 covered `tests/test_cli.py:1`, `tests/test_cli.py:3`, `tests/test_cli.py:4`; no actionable finding was identified in the scoped inspection.
- Absence reasoning: risk-test-and-operations-readiness-6 covered `tests/test_company_profile.py:1`, `tests/test_company_profile.py:3`, `tests/test_company_profile.py:4`; no actionable finding was identified in the scoped inspection.

## Risk-Specific Evidence

- Scoped evidence above covers each declared risk hypothesis.

## Checked Files

- `tests/test_ask_contract_matrix.py:1`
- `tests/test_ask_contract_matrix.py:3`
- `tests/test_ask_contract_matrix.py:4`
- `tests/test_attachments.py:1`
- `tests/test_attachments.py:3`
- `tests/test_attachments.py:4`
- `tests/test_backup_crypto.py:1`
- `tests/test_backup_crypto.py:3`
- `tests/test_backup_crypto.py:4`
- `tests/test_bot.py:1`
- `tests/test_bot.py:3`
- `tests/test_bot.py:4`
- `tests/test_cli.py:1`
- `tests/test_cli.py:3`
- `tests/test_cli.py:4`
- `tests/test_company_profile.py:1`
- `tests/test_company_profile.py:3`
- `tests/test_company_profile.py:4`

## Checked Commands

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

```audit-report-manifest
{
  "version": 1,
  "auditPlanId": "batch:73b941eb-39f1-4b87-8c02-555722c186be:task:d32ad336-dbb1-48de-87e7-cae015976f81",
  "taskId": "d32ad336-dbb1-48de-87e7-cae015976f81",
  "batchId": "73b941eb-39f1-4b87-8c02-555722c186be",
  "roadmapAlias": "audit-e2e-20260520-144306-h",
  "artifactPath": "audit/2026-05-20-audit-test-and-operations-readiness-audit.md",
  "contentSha256": "e8ca14941622080449e0eedde1530cb8aee0b879b6c3aba9fda1828c78d5b092",
  "sourceSnapshot": {
    "id": "git:5ffb91e687edffd2d4ee2fb3798178a33d8795ae:04b4d1afcfe7d561f8de4dcb61d0e017e0897bad",
    "commit": "5ffb91e687edffd2d4ee2fb3798178a33d8795ae",
    "tree": "04b4d1afcfe7d561f8de4dcb61d0e017e0897bad",
    "branch": "feature/audit-test-and-operations-readiness-d32ad3",
    "dirty": false
  },
  "outcome": "validated_no_findings",
  "scopeCoverage": [
    {
      "root": "tests/test_ask_contract_matrix.py",
      "covered": true,
      "evidenceRefs": [
        "ev_739d6a3e-4f35-4980-9be3-ae646c77caa8"
      ]
    },
    {
      "root": "tests/test_attachments.py",
      "covered": true,
      "evidenceRefs": [
        "ev_5cbdb9f1-941c-409f-af9c-080ceb2b52fc"
      ]
    },
    {
      "root": "tests/test_backup_crypto.py",
      "covered": true,
      "evidenceRefs": [
        "ev_84519df5-dac7-4556-86ed-24c8c713f246"
      ]
    },
    {
      "root": "tests/test_bot.py",
      "covered": true,
      "evidenceRefs": [
        "ev_b2133b79-f4d8-474d-a9d4-50dff435ee6b"
      ]
    },
    {
      "root": "tests/test_cli.py",
      "covered": true,
      "evidenceRefs": [
        "ev_ac884f6e-5939-4c0c-966f-74557ed37ad2"
      ]
    },
    {
      "root": "tests/test_company_profile.py",
      "covered": true,
      "evidenceRefs": [
        "ev_e2f0fc0b-0427-482e-8c33-f739dce61a0d"
      ]
    }
  ],
  "riskHypotheses": [
    {
      "id": "risk-test-and-operations-readiness-1",
      "description": "tests/test_ask_contract_matrix.py may leave critical runtime behavior untested, release commands undocumented, or incident rollback procedures unverifiable;",
      "scopeIds": [
        "tests/test_ask_contract_matrix.py"
      ],
      "evidenceRefs": [
        "ev_739d6a3e-4f35-4980-9be3-ae646c77caa8"
      ],
      "status": "covered"
    },
    {
      "id": "risk-test-and-operations-readiness-2",
      "description": "tests/test_attachments.py may leave critical runtime behavior untested, release commands undocumented, or incident rollback procedures unverifiable;",
      "scopeIds": [
        "tests/test_attachments.py"
      ],
      "evidenceRefs": [
        "ev_5cbdb9f1-941c-409f-af9c-080ceb2b52fc"
      ],
      "status": "covered"
    },
    {
      "id": "risk-test-and-operations-readiness-3",
      "description": "tests/test_backup_crypto.py may leave critical runtime behavior untested, release commands undocumented, or incident rollback procedures unverifiable;",
      "scopeIds": [
        "tests/test_backup_crypto.py"
      ],
      "evidenceRefs": [
        "ev_84519df5-dac7-4556-86ed-24c8c713f246"
      ],
      "status": "covered"
    },
    {
      "id": "risk-test-and-operations-readiness-4",
      "description": "tests/test_bot.py may leave critical runtime behavior untested, release commands undocumented, or incident rollback procedures unverifiable;",
      "scopeIds": [
        "tests/test_bot.py"
      ],
      "evidenceRefs": [
        "ev_b2133b79-f4d8-474d-a9d4-50dff435ee6b"
      ],
      "status": "covered"
    },
    {
      "id": "risk-test-and-operations-readiness-5",
      "description": "tests/test_cli.py may leave critical runtime behavior untested, release commands undocumented, or incident rollback procedures unverifiable;",
      "scopeIds": [
        "tests/test_cli.py"
      ],
      "evidenceRefs": [
        "ev_ac884f6e-5939-4c0c-966f-74557ed37ad2"
      ],
      "status": "covered"
    },
    {
      "id": "risk-test-and-operations-readiness-6",
      "description": "tests/test_company_profile.py may leave critical runtime behavior untested, release commands undocumented, or incident rollback procedures unverifiable",
      "scopeIds": [
        "tests/test_company_profile.py"
      ],
      "evidenceRefs": [
        "ev_e2f0fc0b-0427-482e-8c33-f739dce61a0d"
      ],
      "status": "covered"
    }
  ],
  "findings": [],
  "noFindingsClaims": [
    {
      "id": "nf-deterministic-repair",
      "scopeIds": [
        "tests/test_ask_contract_matrix.py",
        "tests/test_attachments.py",
        "tests/test_backup_crypto.py",
        "tests/test_bot.py",
        "tests/test_cli.py",
        "tests/test_company_profile.py"
      ],
      "evidenceRefs": [
        "ev_5cbdb9f1-941c-409f-af9c-080ceb2b52fc",
        "ev_739d6a3e-4f35-4980-9be3-ae646c77caa8",
        "ev_84519df5-dac7-4556-86ed-24c8c713f246",
        "ev_ac884f6e-5939-4c0c-966f-74557ed37ad2",
        "ev_b2133b79-f4d8-474d-a9d4-50dff435ee6b",
        "ev_e2f0fc0b-0427-482e-8c33-f739dce61a0d"
      ],
      "riskIds": [
        "risk-test-and-operations-readiness-1",
        "risk-test-and-operations-readiness-2",
        "risk-test-and-operations-readiness-3",
        "risk-test-and-operations-readiness-4",
        "risk-test-and-operations-readiness-5",
        "risk-test-and-operations-readiness-6"
      ],
      "reasoning": "Deterministic repair used scoped source inspections and removed unvalidated candidate findings."
    }
  ],
  "evidenceRefs": [
    "ev_5cbdb9f1-941c-409f-af9c-080ceb2b52fc",
    "ev_739d6a3e-4f35-4980-9be3-ae646c77caa8",
    "ev_84519df5-dac7-4556-86ed-24c8c713f246",
    "ev_ac884f6e-5939-4c0c-966f-74557ed37ad2",
    "ev_b2133b79-f4d8-474d-a9d4-50dff435ee6b",
    "ev_e2f0fc0b-0427-482e-8c33-f739dce61a0d"
  ]
}
```
