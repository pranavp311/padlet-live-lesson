# Live Lesson: plan

A teacher talks; the screen shows a live transcript and diagrams drawn from what they say. At the end, the lesson exports as JSON that Padlet Boards, Sandbox and Arcade (Piper 2) could consume.

Take-home scope: a demoable core (streaming transcription + live diagrams) and a polished, Padlet-native UI. Padlet integrations are mocked.

## Demo script (what success looks like)

1. Teacher clicks **Start lesson**. GPU warms while a short countdown runs; no speech is lost.
2. Teacher explains photosynthesis. Words appear within ~0.5 s; each sentence settles into clean text ~1 s later.
3. After two or three sentences, a flow diagram draws itself beside the transcript and grows as the explanation continues.
4. Teacher moves on to graphing y = x² − 2x + 1. The photosynthesis diagram is filed into the transcript at its timestamp; a graph appears.
5. Teacher clicks **End lesson**. A summary view shows sections, key terms and diagrams, with **Send to Board / Arcade / Sandbox** buttons that produce the payloads.

## Architecture

```
Browser (Next.js, TS)
  mic → AudioWorklet (16 kHz PCM16 mono, 80–160 ms frames)
      → WebSocket ───────────────► Modal: STT class (L4, Nemotron streaming 0.6B)
      ◄── partial / final JSON ───┘
  final sentence → /api/clean   → fast LLM (OpenRouter)  → cleaned sentence
  final sentence → /api/diagram → Jev router (draw? which kind? subject?)
                                   └ only if drawable → fast LLM, one schema per kind → diagram ops
  ops → spec store → renderer by kind:
        flow / cycle / timeline → Mermaid    graph → Mafs    molecule → SmilesDrawer
  End lesson → /api/export → one LLM pass over the whole transcript → lesson.json
```

Decisions and why:

- **STT: `nvidia/nemotron-speech-streaming-en-0.6b` on Modal.** True cache-aware streaming with partial and final results, punctuation built in, ~7% WER, word boosting for subject terms. Start from `modal-projects/modal-nvidia-asr`; reuse scribe's patterns (CUDA image, weights on the `scribe-models`-style volume, load in `@modal.enter`). Hosted fallback if Modal blocks us: Deepgram Nova-3.
- **Browser connects straight to Modal's websocket.** Audio doesn't pass through Next.js, which can't hold websockets on Vercel anyway.
- **Cleanup on final sentences only**, with the previous 2–3 cleaned sentences as context. Removes fillers, fixes mis-heard terms, never adds content. A slow or failed call keeps the raw text. The full rewrite happens once, at export.
- **Router: Jev (TypeSafe's System One model) decides before any LLM runs.** One call per settled sentence asks three typed questions together: is this drawable (yes/no probability), which `kind` (choice), which `subject` (choice). Vendor-reported 70–500 ms and $0.042 per million input tokens; answers are always one of our options and the probabilities are calibrated, so thresholds mean something. Routing is by diagram shape, not subject: history can be a timeline or a flow. Subject tags the export. Key is in `.env.local` and Modal secret `jev` as `TYPESAFE_API_KEY`. Open fallback with the same interface: SemIf on the STT GPU.
- **Diagrams: LLM emits a typed JSON spec, not Mermaid or code.** Our code builds the Mermaid source and escapes labels, so syntax errors go away and the Padlet theme applies to every diagram. Stable ids let updates patch rather than redraw.
- **LLM calls go through Next.js API routes** so keys stay server-side. OpenRouter key already exists as a Modal secret; copy it to `.env.local`.

## Data shapes

STT websocket, client → server: binary PCM16 frames; text `{"type":"start"|"flush"|"end"}`.

STT websocket, server → client:
```json
{"type":"partial","seg_id":12,"text":"so the derivative of x squared","t0":83.2}
{"type":"final","seg_id":12,"text":"So the derivative of x squared is 2x.","t0":83.2,"t1":86.9}
```

Diagram call result:
```json
{
  "action": "none | create | update | new_topic",
  "confidence": 0.86,
  "topic": "photosynthesis",
  "diagram_id": "d_01",
  "kind": "flow | cycle | timeline | function_graph",
  "title": "Photosynthesis",
  "ops": [
    {"op": "add_node", "id": "sun", "label": "Sunlight", "role": "input"},
    {"op": "add_edge", "id": "e3", "from": "chloroplast", "to": "glucose", "label": "Calvin cycle"}
  ]
}
```
`role` maps to a brand colour in our code. Graph ops: `set_axes`, `add_curve {expr}`, `add_point`; expressions are parsed with mathjs, never `eval`.

Export (`lesson.json`):
```json
{
  "title": "Photosynthesis and quadratics",
  "duration_s": 1260,
  "sections": [{"heading": "...", "start_s": 0, "paragraphs": ["..."], "diagram_ids": ["d_01"]}],
  "key_terms": [{"term": "chlorophyll", "definition": "..."}],
  "diagrams": [{"id": "d_01", "kind": "flow", "spec": {}}],
  "targets": {
    "board":   {"posts": [{"subject": "...", "body": "..."}]},
    "arcade":  {"prompt": "...", "questions": [{"q": "...", "answer": "...", "distractors": ["..."]}]},
    "sandbox": {"cards": [{"title": "...", "body": "...", "diagram_id": "d_01"}]}
  }
}
```

## Diagram trigger rules

- Jev runs on every settled sentence with the previous 2–3 as context. The LLM runs only when Jev says drawable, debounced 1.2 s, one call in flight (latest wins).
- New diagram only when Jev's drawable probability ≥ 0.75 on 2 sentences in a row on one topic; at least 20 s between new diagrams. Updates to the current diagram are allowed anytime. Thresholds get tuned on a recorded lesson.

Jev request (one call, three questions):
```json
{
  "model": "jev-latest",
  "state": "<last 3 settled sentences>",
  "questions": {
    "drawable": {"type": "noul", "instructions": "The teacher is explaining something a simple diagram would make clearer"},
    "kind": {"type": "choice", "instructions": "Best diagram for what is being explained", "criteria": {
      "flow": "steps or cause and effect", "cycle": "a process that repeats",
      "timeline": "events in date order", "graph": "a math function or data plotted on axes",
      "molecule": "a chemical structure", "none": "nothing to draw"}},
    "subject": {"type": "choice", "instructions": "School subject", "criteria": {
      "math": "...", "biology": "...", "chemistry": "...", "physics": "...", "history": "...", "geography": "...", "other": "..."}}
  }
}
```
- Teacher controls: **Draw this** (force from last 60 s), **Pin** (freeze), **Dismiss**.

## Build order

Each step is checked in the running app before the next starts.

1. **Mockup** in Claude Design from the brand kit (`brand/BRAND_KIT.md`). Agree on it before coding.
2. **STT on Modal**: deploy the Nemotron websocket server; test with a recorded WAV from a script, then measure partial latency and cold start.
3. **Next.js shell**: brand tokens, layout from the mockup, mic capture + AudioWorklet, live transcript (partials then finals).
4. **Cleanup** route wired to finals.
5. **Diagrams**: Jev router, spec store, op application, Mermaid + Mafs + SmilesDrawer renderers themed to Padlet, draw-in animation.
6. **End lesson + export**: summary view, `lesson.json` download, mock Send buttons.
7. **Polish pass**: screenshot every state (idle, warming, live, diagram appearing, ended), cut copy, check hierarchy.
8. Stretch: Manim clip for a pinned math diagram, rendered async on Modal; Leaflet map route for geography.

## Measured (21 Oct, `stt/smoke_test.py`, 21.6 s TTS clip, L4)

- Deployed: `wss://pranav-pappu--live-lesson-stt-nemotronasr-webapp.us-east.modal.run/ws`. Code is Modal's `modal-nvidia-asr` example with an L4, 300 s idle shutdown, NeMo pinned to 2.7.3, `exhaustive_batching=True` (a 35.6 s backlog catches up in 7.8 s instead of 23.5 s), and END echoed only after the last audio is processed.
- Cold start 92 s to `Ready`; warm 1.1 s. Text arrives a median 0.57 s (max 1.0 s) behind the audio.
- One error in the clip ("producers today." instead of "producers. Today").
- The server sends **append-only text pieces** (`{"text": " the next words", "is_final": false}`), never revisions. After a ~0.8 s pause it also sends `is_final` with the whole phrase again, lowercase and unpunctuated; appending that duplicated speech, so the client uses it only as a pause signal. A sentence settles at `. ? !` followed by more speech, or at a pause, and the rest on End lesson. The client sends 1.2 s of silence before END so the last words come through.

## Implementation

Next.js (App Router, TS) in `web/`. One page, a state machine: ready → warming → live → ended.

- `lib/mic.ts`: getUserMedia + AudioWorklet, downsample to 16 kHz PCM16, 80 ms frames.
- `lib/stt.ts`: websocket to Modal; frames are buffered until `Ready`, so nothing is lost during a cold start. The Ready screen pings the Modal URL on load to start the GPU early.
- `lib/transcript.ts`: joins text pieces, splits settled sentences.
- `app/api/clean`, `app/api/diagram` (Jev, then LLM only if drawable), `app/api/export`: server routes; keys stay server-side.
- Diagrams: all drawn as our own SVG so live view, thumbnails and the gallery scale the same way: flow laid out by dagre with Padlet sticky-note nodes (the mockup's look; Mermaid couldn't match it), cycle on a circle, timeline, graph sampled with mathjs, molecule via SmilesDrawer. LLM ops are validated before they're applied.
- LLM: `deepseek/deepseek-v4.1-flash` on OpenRouter, reasoning off (benchmarked against Claude Haiku 5.5: same tidy-up speed, diagrams 1.3 s vs 1.8 s median, half the input price; with reasoning on, some replies came back empty).
- Student to-dos: `/api/clean` also asks Jev whether the sentence is a reminder for students; at ≥ 0.7 the LLM extracts `{kind: exam|homework|bring|deadline|other, text, due}`. Shown as pills in the live title row and a To do card at the end; included in `lesson.json`.
- Styling from the approved mockup (`design/`) and `brand/BRAND_KIT.md`.
- Start page is a dashboard of saved lessons; each opens the same summary page as a just-ended lesson. Lessons are saved in the browser's localStorage (`lib/history.ts`): demo storage, one browser only. The production design (Postgres + Lessons API) is on `architecture-scale.excalidraw`.
- Diagrams: ‹ › steps through them in the live panel; clicking any diagram, thumbnail or gallery card opens a full-size viewer (← →, SVG/PNG download). Teachers download the transcript as .txt; the Board/Arcade/Sandbox payloads stay behind "View payload".
- Deploy to Vercel after a local end-to-end check.

## Later: Padlet's own GPUs for speech to text

Modal starts a GPU only when someone connects, so the first teacher after an idle period waits for the cold start (measured 92 s). Fine for the demo, not at Padlet scale. When live lessons reach real volume, move the Nemotron server onto always-on GPUs Padlet runs itself (or reserved capacity), sized to the school-day peak, so no teacher ever waits on a boot. Until then, the Modal mitigations on `architecture-scale.excalidraw` apply: warm GPUs ahead of each timezone's school day, and fall back to hosted STT when the pool is full.

## Risks to check early

- Nemotron cold start (estimated 10–30 s). Mitigation: warm on "Start lesson", buffer audio client-side until `ready`.
- Whether Nemotron's streaming API exposes word timestamps; if not, derive times from frame counts.
- Mermaid's dagre layout reshuffling nodes on update. Prototype in step 5; fall back to our own layout for cycles/timelines.
- False-trigger rate of the Jev router on a real lesson. Test on a recorded lesson transcript; Jev's speed and accuracy figures are vendor-reported only.

## Costs

L4 ≈ $0.80/hr while a container is up; Modal Starter includes $30/month. LLM calls are a few cents per lesson; Jev routing is well under a cent. Nothing paid runs without asking first.
