# archive/

Frozen content. Lives at the repo root so a contributor cloning the project does not wonder *"what is this folder?"* — the answer is here.

## What goes here

Anything we want to keep in the git history but no longer reference from active code or docs:

- Old bug-report dumps superseded by GitHub issues
- Deprecated architecture sketches
- One-off triage notes
- Migration scratch from major refactors

## What does NOT go here

- Active doc — that lives under `docs/`.
- Source code, even if deprecated — delete it; git remembers.
- Build artifacts — `out/`, `release/`, etc. are gitignored.

## Rules

- **Never delete from `archive/`.** Move things in, never out, never erase. The whole point is durability.
- Each subfolder has its own `README.md` (or a leading note) explaining when and why it was archived.
- Path inside `archive/` mirrors the path it came from when sensible — e.g. `bug-reports/` archived as `archive/bug-reports/`.

## Contents

| Subfolder | Origin | Archived | Note |
| --- | --- | --- | --- |
| `bug-reports/` | `bug-reports/` at repo root | 2026-05-19 | Empty placeholder (only `.gitkeep`). Active triage moved to GitHub issues; folder kept for history. |
