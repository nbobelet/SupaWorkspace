---
type: explanation
updated: 2026-05-24
status: snapshot
---

# Retrospective — 2026-05-24

Two-part retrospective produced by the SupaTeam council (Opti · Lisa · Miguel, with input from C3-PO, Hops, Thess, Tony). Part 1 is the council owning its **own** process errors during the session that produced this document. Part 2 fixes the **project** lessons drawn from SupaTerminal's first 13 days. Companion to `AUDIT-2026-05-19.md` (doc inventory) and `HEALTH.md` (doc telemetry).

Grounding for Part 2: 143 commits, 2026-05-11 → 2026-05-24, 61 `feat` / 26 `fix` / 12 `test` / 3 `docs` / 6 `chore` / 3 `refactor` / 2 `build`, one tag (`v0.2.0`), four sub-apps.

---

## Part 1 — What the council got wrong (process self-critique)

The council was asked to _reflect_ on the existing project. It instead chained into designing a **net-new** product. That is worth recording because the council reproduced, in its own conduct, the exact anti-pattern it was diagnosing.

| #   | Error                                                                                    | Root cause                                                                                                       | Fix going forward                                                                                                    |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Chained `/supa-conception` off a one-letter reply (`b`) without re-confirming **intent** | Over-eager post-offer handoff: parsed the choice, skipped "do you actually want to _design_, or just _reflect_?" | After any offer, confirm intent in one line before launching a generative skill — never auto-chain on a bare token.  |
| 2   | Grill drifted to "what is the net-new product / North Star"                              | Scope creep: the ask was "learn from the existing project", not "scope a new one"                                | Re-read the literal ask before grilling. "Thinking about this project" = reflection on the existing repo, full stop. |
| 3   | Too many questions; user interrupted twice                                               | Interrogation fatigue — questions kept coming after the first signal of friction                                 | Treat the first interrupt as a hard stop. Two interrupts = the path is wrong, not the wording.                       |
| 4   | Breadth/drift over depth                                                                 | Same failure mode as the project under review                                                                    | The diagnosis applies to the diagnostician: depth-before-breadth is a process rule, not just a code rule.            |

**Meta-lesson:** the team must apply its own findings to itself. A retrospective that drifts into greenfield design is the process equivalent of shipping a fourth sub-app before the terminal core is hard.

---

## Part 2 — Project lessons (SupaTerminal, first 13 days)

### Cadence — burst, not flow

| Window          | Commits | Phase                    |
| --------------- | ------- | ------------------------ |
| 2026-05-11 → 12 | 51      | bootstrap sprint         |
| 2026-05-13 → 18 | 3       | gap (unbounded appetite) |
| 2026-05-19 → 21 | 83      | mega-sprint              |
| 2026-05-24      | 6       | reactive fix trickle     |

Stop-start with no WIP limit. `fix:feat = 26:61 ≈ 0.43` — acceptable in aggregate, but the fix cluster is concentrated late, meaning bugs were **discovered reactively**, not prevented.

### The recurring bug family

A single root cause produced a stream of late papercuts: re-focus active tab, OSC 133 session state, single-click folder navigation, kanban drag jitter, accordion expand-on-activate, todo composer scroll. All are **interaction-state** bugs — the renderer never modelled session/focus state as a machine; each bug was patched locally, so the debt resurfaced elsewhere.

### Lessons, by domain

- **Product (C3-PO)** — feature sprawl, no kill-ritual. Four sub-apps (Dashboard / Explorer / TODO / Notes) were built before the terminal core was hardened. Decide the North Star (terminal-first vs IDE-lite) _before_ the first line; defer sub-apps to Next, not Now.
- **Technical (Tony)** — foundations are sound (Zod boundary, sandboxed renderer, design-token live re-theme). The gap: **no renderer session-state machine and no centralized focus manager**. Modelling these up front would have killed 4-5 of the papercuts at once. OSC 133 state arrived as a late fix, not an initial design — a sign the state model was retrofitted.
- **Quality (Thess)** — strong discipline (a regression test per fix; 58 test files), but inverted: tests written _after_ the bug, never before. High escape rate, thin e2e (8 specs), no interaction-state test matrix.
- **Delivery (Hops)** — release process is a ghost: one tag (`v0.2.0`) against a `releasev5.zip` sitting in the repo root, no signed artifacts, no SBOM, Windows packaging friction (Developer Mode + winCodeSign). A binary in git is a smell.

### What to do differently on the next product

1. **Depth before breadth** — harden one vertical slice (terminal core) to a Definition of Done that _includes a UX interaction pass_ before adding the second surface.
2. **Model interaction state up front** — a session-lifecycle state machine + a central focus manager on day one.
3. **Test before bug** — an interaction-state test matrix (active-tab re-click, inactive session, default-state workspace) ahead of the feature, plus visual regression on the terminal pane.
4. **Decide the North Star first** — terminal-first vs IDE-lite, written down, with explicit kill-criteria per sub-app.
5. **Tag-driven release** — CI on `v*`, signed artifacts, SBOM; keep binaries out of git.
6. **Premortem before each mega-sprint** — "what will break after this sprint?" would have surfaced the interaction-state family before it shipped.

---

## Linked

- `AUDIT-2026-05-19.md` — documentation inventory and drift
- `HEALTH.md` — documentation telemetry (`apps/*` vs `docs/*` commit ratio)
- `CONVENTIONS.md` — commit and doc conventions
