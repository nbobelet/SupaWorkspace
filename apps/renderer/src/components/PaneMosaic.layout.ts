// Single-mode wraps a bare TerminalPane (no MosaicWindow). Must stay edge-to-edge
// with the layout slot — any padding here desyncs FitAddon's measurement from
// the visible bordered area of TerminalPane and bleeds content past the wrapper.
export const SINGLE_MODE_WRAPPER_CLASS = 'h-full w-full'
