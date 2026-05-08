# Transfer Manifest

Date: 2026-05-08
Local source: `C:\Users\apron\source\botIntevra`
Remote host path: `/srv/aif-handoff/projects/botIntevra`
AIF project path: `/home/www/botIntevra`

## Source Selection

The transfer source is the current working tree, not only committed Git
history. This is required because the local `botIntevra` checkout contains
modified and untracked project work.

Selection command:

```powershell
git -C C:\Users\apron\source\botIntevra ls-files --cached --modified --others --exclude-standard
```

The selected file list was sorted and de-duplicated before archive creation.

## Selection Summary

- Selected files: 215.
- `.env.example`: included as a non-secret configuration template.
- `.git/`: excluded.
- Root `.env` and secret-like `.env.*` files: none selected.
- Python caches, `.pytest_cache`, and `.venv`: none selected.
- Local persistent `data/` directory and SQLite files: absent from the local
  source scan, so no runtime data files were selected.

## Dirty Worktree Handling

The selected set includes tracked, modified, and untracked files that Git does
not ignore. This intentionally preserves the current local working-copy state.

No dirty or untracked project file was excluded manually in this run. Exclusions
come from Git ignore rules plus the absence of local runtime data/secrets.

## Secret Boundary

No secret values were read. Secret-bearing runtime files are not part of the
selected transfer set. Runtime secrets remain pending external provisioning on
the remote host.
