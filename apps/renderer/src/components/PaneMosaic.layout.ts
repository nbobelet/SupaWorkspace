// Single-mode wraps a bare TerminalPane (no MosaicWindow). Must stay edge-to-edge
// with the layout slot — any padding here desyncs FitAddon's measurement from
// the visible bordered area of TerminalPane and bleeds content past the wrapper.
//
// Grid-vs-single slot sizing divergence: in grid/split modes react-mosaic gives
// each tile an explicit absolute box (top/left/width/height in %), so the slot's
// height never depends on percentage resolution up the flex chain. The single
// path has no such authority — it just fills its flex parent. That parent (the
// `flex-1 overflow-hidden` slot in App.tsx) is a flex item whose default
// `min-height: auto` lets it grow to its content's intrinsic min instead of
// shrinking to the available box ("block-size: auto = collapse silencieux").
// When that happens `h-full` resolves against a stale/short height and the
// FitAddon measures a clipped box → the intermittent single-view bottom-row crop.
//
// `min-h-0` / `min-w-0` on this wrapper is the lowest controllable point on the
// flex chain before TerminalPane: it lets the wrapper shrink-to-fit its flex
// parent so `h-full`/`w-full` resolve against the real visible box the
// ResizeObserver/FitAddon should measure, instead of a collapsed one. Token-driven
// Tailwind utilities only — no inline sizing, no magic-number height.
export const SINGLE_MODE_WRAPPER_CLASS = 'h-full w-full min-h-0 min-w-0'
