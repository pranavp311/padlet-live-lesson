# Padlet features and integrations

Captured on 2026-10-21 from the signed-in Padlet web app (network calls and client JS), padlet.help and docs.padlet.dev. Internal endpoints are listed as a reference for data shapes.

## Arcade

Host: `https://arcade.padlet.com`. The UI flow has 4 steps: Topic → Game types → Game ideas → Build.

### Step 1: Topic

The UI has:
- A free-text textarea. No `maxLength`.
- A grade picker: Any grade, Kindergarten, 1st to 12th grade, Higher ed. The value seen was `higher_ed`.
- One optional attachment, either a file (PDF, JPG, PNG, DOCX) or a link (website or YouTube). Adding one hides the other option.

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

`file: { type: "text" }` means a transcript can go in as plain text. The UI only accepts PDF, JPG, PNG and DOCX, and doesn't expose a text upload.

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

### Game types and live play

The help center lists Multiple Choice, Matching, Flashcards, Memory Tiles, Sorting, Sequencing, Fill in the Blank, Word Search and Crossword. The UI also shows Short answer. All types support a leaderboard. "Live Activity" (off by default) shows each player's status live: joined, playing, finished or left.

## Sandbox

### Structure

- Internally a padlet with `viz: "whiteboard"`. The canvas is built on tldraw.
- A sandbox is a deck of **cards**. Card limits by plan: Neon 20, Platinum, Team, Classroom and Schools 100. `whiteboard_frame_limit: 100` was seen on an example.
- Each card holds free-placed objects: text, shapes, sticky notes, drawings, media.
- Media objects are ordinary posts ("wishes") with canvas coordinates. From `GET /api/10/wishes?wall_hashid=...`:
  `{ headline, subject, body, attachment, attachments, position: { left, top }, width, wall_section_hashid, sort_index, ... }`
- Drawings and text boxes did **not** appear in the posts endpoint. Where tldraw shapes are stored wasn't found.
- There's no AI or prompt-based creation. A template click creates an empty canvas.

### Features

- **Slideshow mode.** A "Slideshow" button, or `?play=1` on the sandbox URL, flips through cards in order.
- **Linking.** Any object can link to another card. The Jeopardy and quiz examples use this.
- Per-card templates and card backgrounds, plus a sandbox-wide theme.
- PDF export puts one card per page.
- "Import PDF" and "Import from Google Slides" buttons on the make page. **Not verified** whether they produce a sandbox, or one card per page.

## Other features

| Feature | Notes |
|---|---|
| Auto-captions | Uploaded audio and video get captions in 30+ languages. Video captions are editable, audio captions aren't. Padlet's FAQ says transcripts can't be uploaded or downloaded yet |
| Board layouts | Wall, Columns, Table, Timeline, Map |
| Live board updates | Boards update live for viewers. General knowledge of Padlet, not tested |
| AI recipes | "Custom board" takes `I am a...` plus a free-text `I want to create...` prompt and generates a board. "Class activity creator" only takes subject, topic and grade |
| AI speech | Text-to-speech audio posts, 30+ languages |
| Public API (`api.padlet.dev`) | Paid plan only. Just 4 endpoints: get board, create post, get post attachment, get current user. It can't create boards |
| Padlet MCP (`mcp.padlet.com`) | Works on free plans, OAuth login. Creates boards, adds posts and sections, connects posts, sets layout. Sandbox support is incomplete. Client docs: padlet.com/auth.md |

## Not verified

- The Arcade Build step itself and the exact `tool` values that `activityType` maps to.
- Where Sandbox stores tldraw shapes, and how Import PDF / Google Slides maps into cards.
- Whether boards have a native audio-recorder post type.
- The test account has hit its padlet quota, so creating boards or sandboxes needs a paid or fresh account.
