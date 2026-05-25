---
type: how-to
updated: 2026-05-25
---

# Use voice input (push-to-talk)

Speak a prompt into a **Claude** session instead of typing it. SupaWorkspace
captures your voice while you hold a key, transcribes it **locally** (nothing
leaves your machine), and drops the text into the session — un-sent — so you can
review and edit it before pressing Enter.

> Voice input targets Claude sessions only. Shell sessions are intentionally out
> of scope: a misheard shell command is dangerous, whereas Claude tolerates the
> imperfect phrasing of speech.

## Hold to talk

1. Focus a Claude session (the target is locked the moment you press the key, so
   a notification stealing focus mid-sentence won't redirect your words).
2. Hold **Ctrl+Shift+M**. A pulsing **listening** badge appears on that pane's
   header.
3. Speak, then release the key. Capture stops and transcription runs.
4. The transcript appears in a review box at the bottom of the pane:
   - Edit it if needed.
   - Press **Enter** (or click **Insert**) to drop the text into Claude's input
     line — still **un-submitted**. Press Enter in the terminal to send it.
   - Press **Esc** (or click **Discard**) to throw it away.

If a capture is unclear, too quiet, or silent, you'll see a brief note
(`unclear — retry`, `nothing heard`) and nothing is inserted.

## Rebind the hold-key

The default is `Ctrl+Shift+M`. To change it, update the `voice.pushToTalkKey`
field in app settings (`settings:update`); the new chord takes effect the next
time the app starts. Avoid chords already used by built-in shortcuts (e.g.
`Ctrl+W`, `Ctrl+F`) — those are reserved and will be flagged.

## Install the speech model

Local transcription needs the whisper.cpp binding and a model:

1. Install the in-memory binding yourself: `pnpm add smart-whisper`. It is **not**
   a declared dependency — bundling it would compile whisper.cpp from source on
   every `pnpm install` and break the no-native-compile clean-install guarantee.
   The app loads it lazily and degrades gracefully when it is absent.
2. Place a multilingual model at `<userData>/models/ggml-base.bin`
   (the `userData` path is logged on boot as `[supa] userData = …`). The
   `ggml-base` multilingual model (~150 MB) handles mixed French/English; you
   can swap in `small`/`medium` for higher accuracy.

Until both are present, the listening badge reports `voice model missing` and no
audio is captured beyond the permission prompt.

## Privacy

- Audio is processed **in memory** and the buffer is zeroed immediately after
  transcription — it is never written to disk.
- Transcription is fully local (whisper.cpp); no audio or text is sent to any
  server.
- The microphone is only live while you hold the key (push-to-talk), never
  always-listening.

> Implementation note: capture currently uses a `ScriptProcessorNode`. A future
> change will migrate it to an `AudioWorklet`.

## See also

- [Configure Claude settings](./configure-claude-settings.md)
- [Manage workspaces](./manage-workspaces.md)
