# Lesson transcription tool: Padlet integration brief

Research notes for the implementation agent. Gathered on 2026-10-21 by browsing Padlet while signed in, recording the network calls the web app makes, and reading padlet.help and docs.padlet.dev. Nothing was built or saved in Padlet.

## The product idea

A teacher hits record at the start of a lesson. The tool:

1. Transcribes the lesson live.
2. Shows students something visual while the teacher speaks (a board that fills in as the lesson goes).
3. At the end, saves the full transcript and turns it into review material: an Arcade game, and possibly a revision slide set in Sandbox.

This is a take-home for Padlet, so we assume it's built as if inside Padlet. Public API limits don't apply. Internal endpoints below are fair game as a reference for data shapes.

## Why Padlet would want it

- Padlet already auto-captions uploaded audio and video in 30+ languages. Video captions are editable, audio captions aren't.
- The help center's Accessibility FAQ says: "Padlet doesn't support uploading or downloading transcripts for posts at the moment," and that they're working on better transcript support. This tool fills that gap.
- Accessibility (live captions for deaf and hard-of-hearing students), catch-up material for absent students, and it sends board users into Arcade.

## Recommended scope

1. **Core.** Record, transcribe live, save the full transcript.
2. **Live visual.** A board (Timeline or Columns layout) that gets one post per key point or topic while the teacher talks.
3. **End output.** Transcript → Arcade game (Sequencing or Flashcards fit a lesson recap best).
4. **Stretch goal.** Sandbox revision deck. There's no generator to call, so it's much more work (see below).

## Arcade: game creation

Host: `https://arcade.padlet.com`. The UI flow has 4 steps: Topic → Game types → Game ideas → Build.

### Step 1: Topic

The UI has:
- A free-text textarea. No `maxLength`.
- A grade picker: Any grade, Kindergarten, 1st to 12th grade, Higher ed. The value seen was `higher_ed`.
- One optional attachment, either a file (PDF, JPG, PNG, DOCX) or a link (website or YouTube). Adding one hides the other option.

The request, as captured:

```json
POST /api/arcade/orchestrate
{
  "topic": "<free text>",
  "grade": "higher_ed",
  "attachment": null,
  "allowedGenerationTypes": [
    "multiple-choice-v2", "word-search", "crossword", "short-answer", "matching",
    "sorting", "sequencing", "flashcards", "fill-in-the-blank", "memory-tiles"
  ]
}
→ { "nextStep": "customization" }
```

### Step 2: Game type

The user picks one of the 10 types above, or "Suggest a game".

### Step 3: Game ideas

The AI returns 3 ideas. The user can edit an idea's title, description and type before building.

```json
POST /api/v3/suggestions
{ "topic": "...", "grade": "higher_ed", "type": "sequencing", "attachment": null, "allowedGenerationTypes": [ ... ] }
→ {
  "suggestions": [
    { "id": "1", "title": "Trace the Photosynthesis Pathway",
      "description": "Arrange the six steps from carbon dioxide and water entering the plant to glucose and oxygen being produced.",
      "activityType": "sequencing" }
  ]
}
```

### Step 4: Build

Not called. This shape was read from Arcade's client JS:

```js
POST /api/arcade/generate          // streamed response body
{
  tool: <looked up from activityType>,
  input: {
    topic: suggestion.title,
    grade: inputs.gradeLevel,
    details: suggestion.description,
    userPrompt?: <derived from the original prompt + description>
  },
  file:                              // optional
    { type: "text", text, mimeType } // plain text is supported internally
    | { type: "gs_uri", uri, mimeType }, // uploaded file stored in Google Cloud Storage
  locale
}
```

Key point: `file: { type: "text" }` means a transcript can go in as plain text. The UI only accepts PDF, JPG, PNG and DOCX, but the generator itself takes text. A text upload path isn't exposed in the UI.

### A finished game's data

Captured from a public Matching game, `GET /api/spa/game/starting-state`:

```
game: {
  activityType: "matching", grade: "K", topic, description, subject, locale, visibility,
  presenceEnabled, leaderboardVisibility, ...
  activityContent: {
    data: {
      title, instructions, locale, background_image_query,
      block_pairs: [
        { set_a: { text: "Circle", audio_string: "Circle", audio_type: "tts", audio_locale: "en" },
          set_b: { image_query: "A filled blue circle" } }
      ]
    },
    meta: { imageMap: { "<image_query>": "<generated image URL>" } }
  }
}
```

Images are generated from text `image_query` strings, and audio comes from text-to-speech.

### Game types

The help center lists Multiple Choice, Matching, Flashcards, Memory Tiles, Sorting, Sequencing, Fill in the Blank, Word Search and Crossword. The UI also shows Short answer. All types support a leaderboard. "Live Activity" (off by default) shows players' status live (joined, playing, finished, left), which is useful for an in-class review game.

### Minimum input for our tool

`{ topic: <lesson title or summary>, grade, gameType, file: { type: "text", text: <transcript> } }`. Skipping the ideas step is fine. Default to Sequencing ("put the lesson in order") or Flashcards (key terms).

## Sandbox: revision slide set

### What it is

- Internally a padlet with `viz: "whiteboard"`. The canvas is built on tldraw.
- A sandbox is a deck of **cards**. Card limits by plan: Neon 20, Platinum, Team, Classroom and Schools 100. `whiteboard_frame_limit: 100` was seen on an example.
- Each card holds free-placed objects: text, shapes, sticky notes, drawings, media.
- Media objects are ordinary posts ("wishes") with canvas coordinates. From `GET /api/10/wishes?wall_hashid=...`:
  `{ headline, subject, body, attachment, attachments, position: { left, top }, width, wall_section_hashid, sort_index, ... }`
- Drawings and text boxes did **not** appear in the posts endpoint. Where tldraw shapes are stored wasn't found.

### Features to reuse

- **Slideshow / presentation mode.** A "Slideshow" button, or `?play=1` on the sandbox URL, flips through cards in order.
- **Linking.** Any object can link to another card. The Jeopardy and quiz examples use this. A "check yourself" card can link to the answer card.
- Per-card templates and card backgrounds, plus a sandbox-wide theme.
- PDF export puts one card per page.
- "Import PDF" and "Import from Google Slides" buttons on the make page. **Not verified** whether they produce a sandbox, or one card per page.

### What's missing

There's no AI or prompt-based sandbox creation. A template click creates an empty canvas. Padlet's MCP server also says Sandbox support is incomplete. Building a deck means writing tldraw objects onto cards.

### Proposed deck shape

```json
[
  { "title": "Photosynthesis inputs", "bullets": ["Carbon dioxide", "Water", "Sunlight via chlorophyll"], "image": null },
  { "title": "Check yourself", "question": "What are the outputs?", "linksTo": "answer-card" }
]
```

One card per lesson topic, 3 to 5 key points each.

## Other Padlet features worth knowing

| Feature | Notes |
|---|---|
| Board layouts | Wall, Columns, Table, Timeline, Map. Timeline or Columns fit the live view |
| Live board updates | Boards update live for viewers. This is general knowledge of Padlet, not tested in this session |
| AI recipes | "Custom board" takes `I am a...` plus a free-text `I want to create...` prompt and generates a board. Could be fed a transcript summary. "Class activity creator" only takes subject, topic and grade |
| AI speech | Text-to-speech audio posts, 30+ languages |
| Caption translation | Captions already come in 30+ languages, which could give multilingual transcripts |
| Public API (`api.padlet.dev`) | Paid plan only. Just 4 endpoints: get board, create post, get post attachment, get current user. It can't create boards |
| Padlet MCP (`mcp.padlet.com`) | Works on free plans, OAuth login. Creates boards, adds posts and sections, connects posts, sets layout. Client docs: padlet.com/auth.md. In-app AI sidebar retires 2026-11-06 in favour of MCP |

## Not verified

- The Arcade Build step itself (not clicked) and the exact `tool` values that `activityType` maps to.
- Where Sandbox stores tldraw shapes, and how Import PDF / Google Slides maps into cards.
- The in-board post composer: whether there's a native audio-recorder post type.
- The test account has hit its padlet quota ("Upgrade to continue making padlets"), so a demo that creates boards or sandboxes needs a paid or fresh account.
