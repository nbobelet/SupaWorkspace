---
type: explanation
updated: 2026-05-20
---

# Design system

Rules that every new UI surface in SupaTerminal must follow. Short and prescriptive; no exceptions without updating this file.

---

## Token-only color

All colors come from the `@theme` tokens defined in `apps/renderer/src/styles/index.css`. Use Tailwind utility classes that map to those tokens (`text-fg`, `bg-bg-elevated`, `border-border`, `text-accent`, `bg-accent`, `text-error`, `text-muted`, …).

**Never** use raw hex, `rgb()`, `hsl()`, or the bare class `text-white`. When a badge or surface sits on `bg-accent`, use `text-bg` (the background token) — it re-themes correctly instead of staying locked to white.

```tsx
// ✅
<span className="bg-accent text-bg">3</span>

// ❌
<span className="bg-accent text-white">3</span>
<span style={{ color: '#ffffff' }}>3</span>
```

Available semantic tokens (non-exhaustive):

| Token class            | CSS variable            | Role                       |
| ---------------------- | ----------------------- | -------------------------- |
| `text-fg`              | `--color-fg`            | Primary text               |
| `text-fg-subtle`       | `--color-fg-subtle`     | Secondary text             |
| `text-muted`           | `--color-muted`         | Placeholder / metadata     |
| `bg-bg`                | `--color-bg`            | Page background            |
| `bg-bg-elevated`       | `--color-bg-elevated`   | Card / button surface      |
| `bg-bg-sunken`         | `--color-bg-sunken`     | Inset / well               |
| `border-border`        | `--color-border`        | Default border             |
| `border-border-strong` | `--color-border-strong` | Hover / active border      |
| `text-accent`          | `--color-accent`        | Primary action / highlight |
| `bg-accent`            | `--color-accent`        | Accent fill                |
| `text-error`           | `--color-error`         | Destructive / error        |
| `text-warn`            | `--color-warn`          | Warning                    |

---

## Focus pattern

One focus style, everywhere. Defined globally in `index.css`:

```css
*:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
```

Interactive elements should **not** suppress this. When a component needs to spell it out explicitly (e.g. inside a complex focus-within layout), use the Tailwind utilities:

```
focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
```

For text inputs the equivalent border shift is:

```
focus:border-accent focus:outline-none
```

This replaces the global outline with a border glow so the field shape stays intact. Do not mix both patterns on the same element.

---

## Spacing and size scale (interactive elements)

Buttons and inputs share a single geometric contract:

| Property  | Value       | Tailwind class |
| --------- | ----------- | -------------- |
| Height    | 28 px (h-7) | `h-7`          |
| H-padding | 10 px       | `px-2.5`       |
| Gap       | 6 px        | `gap-1.5`      |
| Radius    | 6 px (md)   | `rounded-md`   |
| Text size | 12 px       | `text-xs`      |
| Weight    | 500         | `font-medium`  |

---

## Button variants

Three variants, all encoded in `apps/renderer/src/components/ui/Button.tsx`:

| Variant   | Border          | Background       | Text          | Use for                   |
| --------- | --------------- | ---------------- | ------------- | ------------------------- |
| `ghost`   | `border-border` | `bg-bg-elevated` | `text-fg`     | Default / neutral actions |
| `primary` | `border-accent` | `bg-accent/10`   | `text-accent` | Confirmative / new        |
| `danger`  | `border-error`  | `bg-error/10`    | `text-error`  | Destructive actions       |

Hover darkens the background tint (`/20`). Disabled uses `opacity-50` + `cursor-not-allowed`.

```tsx
// ✅
<Button variant="primary" onClick={spawn}>New session</Button>
<Button variant="danger" onClick={remove}>Delete</Button>

// ❌ — don't copy-paste button classes; use the primitive
<button className="border-accent bg-accent/10 text-accent ...">
```

---

## Input contract

`FormInput` (`apps/renderer/src/components/ui/FormInput.tsx`) encodes the canonical input shape. **Labelling is the caller's responsibility** — always pair with a `<label htmlFor={id}>` or provide an `aria-label`:

```tsx
// ✅ — explicit label association
<label htmlFor="ws-name" className="text-xs text-fg-subtle">Name</label>
<FormInput id="ws-name" value={name} onChange={...} />

// ✅ — aria-label when no visible label
<FormInput aria-label="Search sessions" placeholder="Search…" />

// ❌ — input with no label
<FormInput placeholder="Name" />
```

---

## Hover and disabled states

- Hover: shift border from `border-border` → `border-border-strong`, or darken background tint by one step.
- Disabled: `disabled:opacity-50 disabled:cursor-not-allowed`. Never hide the element.
- Loading / skeleton: use `animate-pulse bg-bg-elevated` on a placeholder element. Respect `prefers-reduced-motion` (the global CSS rule already strips animations; no per-component workaround needed).

---

## Motion safety

The global `@media (prefers-reduced-motion: reduce)` rule in `index.css` collapses all `transition-duration` and `animation-duration` to `0.01ms`. No per-component `motion-safe:` prefix needed for basic transitions. Reserve `motion-safe:` only for decorative animations that should be entirely absent (not just instant) when motion is off.

---

## Scroll containers

Every scrollable surface wears `supa-scroll` — the single token-driven scrollbar utility defined in `index.css`. Never write per-component `::-webkit-scrollbar` rules or hardcode thumb colors inline.

```tsx
// ✅
<ul className="overflow-y-auto supa-scroll">…</ul>

// ❌
<ul style={{ scrollbarColor: 'rgba(255,255,255,0.2) transparent' }}>…</ul>
```

---

## Accessibility baseline

- All interactive elements reachable by keyboard (`<button>`, `<a>`, `<input>`).
- Icon-only buttons require `aria-label`; decorative icons get `aria-hidden="true"`.
- Focus never removed from interactive elements (no `outline: none` without a replacement).
- Badge counts carry `aria-label` with prose description (e.g. `"3 unread notifications"`).
- Color alone never conveys state — pair color with icon or text.
