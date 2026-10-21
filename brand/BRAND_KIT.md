# Padlet brand kit (for the transcription app)

Pulled from padlet.com on 2026-10-21 with Claude in Chrome, signed into a personal account. Chrome was in OS dark mode, so the app chrome was measured in dark. Boards and post cards render light either way.

Tags used below:

- **M** = measured. Computed style read off a live element.
- **CSS** = read from Padlet's own Tailwind build (`padlet.net/ui/assets/tailwind-_3xh4Llp.css`). These are real values, but I didn't see every one on screen.
- **I** = inferred from screenshots or naming. Treat as a guess.

Pages used:

- `/dashboard/make` = dashboard, dark
- `/gallery` = gallery
- the "Chores To Do" board (`/gallery/chores-to-do-h7a6v3wgcrvc`) = board
- that board's Share panel = share panel
- `arcade.padlet.com` = arcade
- `/` and `/auth/login`, logged out, text only via TinyFish = marketing

## 1. Colors

Padlet runs one Tailwind palette. Every family has a 0 to 1000 scale. Neutrals plus a single accent cover most screens. Saturated color goes into content: board wallpapers, layout thumbnails, emoji.

### Neutrals (CSS, the dark values also M on dashboard)

| Role | Light mode | Dark mode |
|---|---|---|
| Page bg | `#ffffff` light-ui-100 | `#111111` dark-ui-100 (M) |
| Raised surface (cards, buttons, list groups) | `#f5f6f7` light-ui-200 | `#242527` dark-ui-200 (M) |
| Hover / pressed | `#ececec` light-ui-300 | `#323335` dark-ui-300 |
| Strong fill (icon button) | `#e0e0e0` light-ui-400 | `#3c3d40` grey-700 (M) |
| Text primary | `#111111` | `#ffffff` (M) |
| Text secondary | `rgba(0,0,0,.54)` | `rgba(255,255,255,.7)` (M, nav links, meta) |
| Text tertiary | `rgba(0,0,0,.38)` | `rgba(255,255,255,.5)` (M, separators) |
| Text disabled / divider | `rgba(29,29,29,.2)` | `rgba(255,255,255,.2)` (M) |
| Modal scrim | I: `rgba(17,17,17,.6)` | `rgba(36,37,39,.8)` (M, share panel) |

Grey scale (CSS): 0 `#fbfbfb`, 50 `#f5f6f7`, 100 `#ebecef`, 200 `#ced0d4`, 300 `#b2b4b9`, 400 `#94969b`, 500 `#75777c`, 600 `#545559`, 700 `#3c3d40`, 800 `#242527`, 900 `#111`.

### Accent and brand

| Role | Hex | Where it shows up |
|---|---|---|
| Accent, dark mode (active nav, "+ Make", selected sidebar item) | `#fec006` canary-500 | M, dashboard |
| Accent tint, dark mode | `rgba(254,192,6,.1)` | M, dashboard |
| Accent, light mode | `#9466e8` grape-500 (hover `#8b00f9` grape-600) | I. The CSS ships `modal-overlay-grape-*` and canary as a pair, which points to grape being the light-mode accent. I couldn't toggle themes to confirm. |
| Padlet pink (logo link color, brand moments) | `#ff4081` padlet-pink-500, dark `#c80764` | M (logo `<a>` color), CSS |
| Legacy brand pink | `#fe2e9a` | `msapplication-tilecolor` on login page meta |
| Danger | `#ff2010` danger-100, scarlet-500 `#f44336` | CSS |
| Success badge ("New") | bg `#004e00` park-800, white text | M, dashboard |
| Info / link blue | `#0e78db` oceanic-600 | CSS |

The other families (CSS) mostly color content and layout thumbnails, not UI:

- scarlet: 100 `#ffdada`, 500 `#f44336`, 900 `#7c0000`
- tangerine: 100 `#ffe9c8`, 500 `#ff833e`, 900 `#913d00`
- canary: 100 `#fff4ce`, 400 `#ffd54f`, 500 `#fec006`
- park: 100 `#deffdd`, 500 `#3dc731`, 800 `#004e00`
- oceanic: 100 `#bbeaff`, 500 `#3992de`, 800 `#00418e`
- grape: 100 `#eed8ff`, 500 `#9466e8`, 800 `#520085`
- teal: 100 `#ccfbf1`, 500 `#14b8a6`

### Boards: where the character comes from (second pass, 2026-10-21)

Padlet's UI chrome is neutral; the personality lives on the board. Pages: the user's "database isolation debate" board, its settings panel and composer (opened, nothing saved), and gallery boards in wall, columns, timeline, canvas, map and sandbox layouts. Screenshots `08`–`22`.

- **Wallpaper is the board's identity (M).** Every board sits on a full-bleed wallpaper. The picker (`10`–`12`) has 5 tabs: solid colours (3 per hue: pastel, mid, deep), gradients, textures and patterns (graph paper, cork, wood, denim, stars), photos, and art and illustrations. A pastel solid is the calmest choice; the Persepolis board uses peach `#fde1b9` (sampled from screenshot). The user's own board uses a deep grape wallpaper `#3a2276` scattered with flat confetti shapes (triangles, dots, zigzags) at low contrast (`08`).
- **Chrome tints itself from the wallpaper (M).** Header pills are `rgba(<wallpaper hue>, .1)` with `backdrop-filter: blur(12px)`, 32px tall, radius 12 (graph-paper board: `rgba(23,100,130,.1)`; grape board: `rgba(187,168,240,.1)`). Meta text is tinted too (`rgba(8,33,43,.7)` on graph paper). Section headers take a darker shade of the wallpaper (`#2e1c5f` on grape).
- **Post colours (M).** The composer offers White, Red, Yellow, Green, Blue, Purple (`13`). Light boards render them as the 100 tints: `#ffdada`, `#fff4ce`, `#deffdd`, `#bbeaff`, `#eed8ff` (sandbox board, `21`). Dark boards render them deep: `#980000`, `#bb4f00`, `#004e00`, `#00418e`, `#520085`, with a darker shade for the attachment strip (`19`). Cards are 256px wide (380 on sandbox), radius 12, no border.
- **Attribution chip (M).** Sandbox cards carry a small chip bottom-left in a deeper tint of the card (`#ffeba4` on yellow).
- **Canvas connectors (M, visual).** Canvas boards join posts with soft curved white arrows straight on the wallpaper (`15`). Sandbox diagrams use pastel sticky notes and warm yellow arrows (`22`).
- **Primary action (M).** The board's "+ Post" button is the one filled CTA: `#4fd6df` teal, black 14px label, radius 20, 56px tall, `0 4px 8px rgba(0,0,0,.16)`. It floats bottom-right.
- **Board header (M).** Emoji avatar at 48px, meta 12px, title 24/600, description 14px, all straight on the wallpaper with no container.
- **Microcopy (M).** The 404 page: a warm line ending "hello, beautiful" over a full-width illustrated landscape. Personality stays in empty and error states; buttons stay literal.

## 2. Typography

- **UI font.** `"Inter var", Inter, sans-serif` (M, every page). Self-hosted at `padlet.net/fonts/inter/subset/inter-latin.woff2`. Use Inter from Google Fonts or rsms.me.
- **Post body default.** Board articles fall back to `Roboto, -apple-system, system-ui, "Segoe UI", ...` (M), though post titles and text still render in Inter. Board owners can pick other fonts. The gallery's "Diary of a Ghost" board uses `"Average Mono"`.
- Loaded but unused on the pages I visited: Open Sans, Plus Jakarta Sans 600, Quill Sans Display 600.
- **Weights.** 400 for body, 600 for every heading, nav link and button label (M). I never saw 700 in the product UI.
- **Tracking.** Slightly negative everywhere.

Type scale (CSS class, then size/line-height/tracking; M marks the ones I saw rendered):

| Token | Size / LH / tracking | Use |
|---|---|---|
| heading-1-large | 48 / 64 / -0.022em | marketing hero |
| heading-1 | 34 / 43 / -0.021em | page title "Make a padlet" (M, 600) |
| heading-2 | 24 / 32 / -0.019em | board title (M, 24/30, 600) |
| heading-3 | 20 / 26 / -0.0005em | panel title "Share this board", column header (M, 600) |
| heading-4 / body | 17 / 24 / -0.013em | section headings (600), post title (600), list rows (400) (M) |
| body-posts | 17 / 26 | post body text |
| body-small | 14 / 20 / -0.006em | nav links, buttons, captions (M) |
| body-extra-small | 12 / 17 | meta ("Gallery · 1mo"), badges (M) |
| body-tiny | 10 / 14 / +0.01em | micro labels |

## 3. Radii (M unless noted)

Corners are big and soft. Anything a user clicks has a rounded corner.

| Value | Where |
|---|---|
| 6px | small badge ("New"), column header inner |
| 8px | post overflow "⋮" button |
| 12px | post card, nav button, header pill buttons (Slideshow/Share), sidebar item, list row |
| 16px | recipe card, import buttons, post card on stream layout |
| 20px | layout thumbnail outer frame |
| 24px | layout tile button, side panel / drawer |
| 9999px | avatar, round icon buttons |

The Tailwind scale (CSS) also has xs 1px, sm 2px, md 6px, lg 8px, xl 12px, 2xl 16px and 3xl 24px.

## 4. Shadows (CSS, the starred ones also M)

Light surfaces barely use shadow. Dark surfaces use none and separate by fill.

| Token | Value |
|---|---|
| elevation-1 * | `0 0.5px 1px rgba(0,0,0,.2)` (post card) |
| elevation-2 | `0 4px 8px rgba(0,0,0,.16)` |
| elevation-3 | `0 8px 16px rgba(0,0,0,.16)` |
| elevation-4 | `0 16px 32px rgba(0,0,0,.32)` |
| elevation-5 | `0 32px 64px rgba(0,0,0,.4)` |
| side-panel * | `4px 4px 0 0 rgba(0,0,0,.25), 0 8px 16px 0 rgba(0,0,0,.16)` (share panel) |

## 5. Spacing

Base unit is 4px (`--spacing: .25rem`, CSS). Measured values:

- 4: tile padding
- 8: card inner padding, row padding
- 12: button horizontal padding
- 16: panel horizontal padding
- 20: grid gap between layout tiles
- 32: gap between board columns
- 24 and 16: dashboard gutters

Header height is about 64px. Controls are 32px (compact header) or 40px (standard), M.

## 6. Components

**Primary nav (dashboard, M).** Logo crane at the left, then text links in 14px/600 at 70% white, separated by `/` slashes. The active or "Make" link turns canary. Right side has a 32px rounded-12 icon button (`#3c3d40`) and a 32px round avatar. No bar background. The nav sits on the page color.

**Buttons (M).**
- Secondary/default: height 40, padding `8px 12px 8px 8px`, radius 16, bg `#242527` (dark) or `#f5f6f7` (light, I), 16px/400 text with a leading 24px icon. Example: "Import PDF".
- Header pill on a board: height 32, padding `1px 12px 1px 10px`, radius 12, translucent bg tinted from the wallpaper (`rgba(168,174,240,.1)`), `backdrop-filter: blur(12px)`, 14px label with a leading outline icon.
- Icon button: 32×32, radius 12, or fully round.
- Primary CTA: I never saw a solid filled primary button in the app itself. The closest are the canary text links. For a "Start transcribing" CTA I'd use the accent fill with `#111` text, radius 12, height 40, 14 to 17px/600. That's an inferred pattern.
- Arcade (separate sub-brand, don't copy): `#ff3f22` pill, Nunito 900 caps.

**Post card (board, M).** 256px wide. bg `#fff`, radius 12, shadow elevation-1, padding `8px 8px 12px`. Title is 17/24, 600, `#111`. A hairline divider separates the title from the reactions row (emoji counts in 14px gray). A "⋮" overflow button sits top-right at `rgba(0,0,0,.54)`. Body text is `rgba(0,0,0,.87)`. This card is the most "Padlet" thing to reuse for transcript chunks.

**Column/section header (board, M).** 40px tall, tinted bg derived from the wallpaper (`#fceccf` cream here), radius 8, title 20px/600 caps-as-typed.

**Board header (M).** Emoji or icon avatar at 48px, then meta (12px, "Gallery + 2 • 8d"), title (24px/600), description (14px secondary). Everything sits on top of the wallpaper with no container.

**Side panel / drawer (share panel, M).** 480px wide, radius 24, bg `#111` (dark), shadow side-panel, inset 16px from the viewport edge. Title row has a close X on the left and a centered 20px/600 title. Section labels are 14px, secondary. Rows are grouped into rounded-16 `#242527` blocks: 24px outline icon, 17px label, chevron on the right for drill-ins, and 1px dividers inset from the left. Top of the panel has 4 quick-action tiles (icon over 12px label, radius 16).

**Cards on dashboard (M).**
- Layout tile: 4px padding with a radius-24 hover frame. Inside is a radius-20 colored frame and a radius-12 preview. The label sits below in 14 to 16px.
- Recipe card: 72px tall, radius 16, bg `#242527`, a 56px illustrated thumbnail at radius 8, a 16px label and an optional "New" badge.

**Gallery card (M).** Image 256×144 with square corners (0 radius here). Title 14/600, meta 12px at 70%.

**Inputs.** Not measured in the main app, since no input was open without signing in or editing. Inferred from Padlet's OzInput component and the share panel: 40px tall, radius 12, filled bg (`#f5f6f7` light / `#242527` dark), no border, a 2px accent focus ring. Arcade's search input (M) is 52px, fully round, white, with a 1px inset ring.

**Badges (M).** 20px tall, padding 0 6px, radius 6, 12px/600. Green `#004e00` with white text for "New".

**Loading.** Skeleton blocks in `#242527` / `#3c3d40`, radius 8 (M, dashboard before data loads). The spinner is a canary arc (gallery screenshot).

## 7. Iconography

Outline icons, roughly 1.5px stroke, rounded caps, 20 to 24px in a 32 to 40px hit area (I, from screenshots). Padlet uses its own icon set ("OzIcon", plus a `wbicons` font). Lucide or Phosphor Regular are the closest public matches. Color follows text color, never the accent, except when the item is active. In the share panel's quick actions the icons are colored (pink, orange, blue, purple), one color per action.

## 8. Logo and imagery

- **Mark.** A multicolour origami crane, an inline 24×24 SVG in the dashboard nav (M): black outline plus seven facets in `#ced0d4`, `#ffd54f`, `#ff833e`, `#53e047`, `#9466e8`, `#ff4081`, `#3992de`. Copied verbatim from the page DOM to `brand/padlet-crane.svg`. Pranav says Padlet has OK'd using it in the take-home. Boards show it top-left next to a small "Padlet" wordmark. Don't redraw it.
- **Illustration.** Line-drawn city/landscape skyline footer (gray strokes on dark). Recipe thumbnails are flat, pastel, hand-drawn style.
- **Content-first.** Boards use full-bleed photo or gradient wallpapers, and the chrome goes translucent over them.
- **Emoji** are used as board avatars and reactions.

## 9. Tone of voice (marketing, dashboard, login)

The copy is warm, cheeky, short and lowercase-friendly. It compliments the reader, sometimes absurdly:

- Dashboard greeting: "Hi Pranav / Gentle reminder: you are beautiful."
- Footer tagline: "Oh wow, you're so beautiful. Just saying!"
- Homepage: "Used by 40 million beautiful people around the world." / "Every single one of them is beautiful."
- Self-deprecating headings: "We have boards", "We have sandboxes", "Thanks to the academy... 🏆".
- Login: "Welcome back to where you belong".

Functional labels are plain verbs in sentence case: "Make a padlet", "Start from scratch", "Copy link to board", "Export PDF", "See examples", "View all". Product nouns are "padlet" (lowercase, for a board), "board", "sandbox", "post", "recipe".

For the transcription app, keep buttons literal ("Start recording", "Copy transcript", "Add to padlet"). Let one line of personality into empty states or success toasts, not into errors.

## 10. Dark mode

Yes. The dashboard and panels follow the OS `prefers-color-scheme` (M: OS was dark, `matchMedia` true). Tailwind ships paired `dark-ui-*` / `light-ui-*` and `dark-text-*` / `light-text-*` tokens, and components use `text-dark-text-100 dark:text-light-text-100`. Post cards stay white in both modes.

## 11. CSS tokens

```css
:root {
  /* type */
  --font-sans: "Inter var", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --fs-h1: 34px;  --lh-h1: 43px;  --ls-h1: -0.021em;
  --fs-h2: 24px;  --lh-h2: 32px;  --ls-h2: -0.019em;
  --fs-h3: 20px;  --lh-h3: 26px;
  --fs-body: 17px; --lh-body: 24px; --ls-body: -0.013em;
  --fs-small: 14px; --lh-small: 20px; --ls-small: -0.006em;
  --fs-xs: 12px;  --lh-xs: 17px;
  --fw-regular: 400; --fw-semibold: 600;

  /* neutrals, light */
  --bg: #ffffff;
  --surface: #f5f6f7;
  --surface-hover: #ececec;
  --surface-strong: #e0e0e0;
  --text: #111111;
  --text-2: rgba(0, 0, 0, 0.54);
  --text-3: rgba(0, 0, 0, 0.38);
  --divider: rgba(29, 29, 29, 0.2);
  --scrim: rgba(17, 17, 17, 0.6);          /* inferred */

  /* accent + brand */
  --accent: #9466e8;                        /* grape-500, light-mode accent is inferred */
  --accent-hover: #8b00f9;
  --accent-tint: rgba(148, 102, 232, 0.1);
  --on-accent: #ffffff;
  --brand-pink: #ff4081;
  --danger: #ff2010;
  --success-bg: #004e00;
  --link: #0e78db;

  /* post card stays light in both modes */
  --card-bg: #ffffff;
  --card-text: rgba(0, 0, 0, 0.87);
  --card-title: #111111;

  /* shape */
  --radius-xs: 6px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-full: 9999px;

  /* elevation */
  --shadow-1: 0 0.5px 1px rgba(0, 0, 0, 0.2);
  --shadow-2: 0 4px 8px rgba(0, 0, 0, 0.16);
  --shadow-3: 0 8px 16px rgba(0, 0, 0, 0.16);
  --shadow-4: 0 16px 32px rgba(0, 0, 0, 0.32);
  --shadow-panel: 4px 4px 0 0 rgba(0, 0, 0, 0.25), 0 8px 16px 0 rgba(0, 0, 0, 0.16);

  /* spacing, 4px base */
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px;
  --control-sm: 32px; --control-md: 40px;

  --ease: cubic-bezier(0.4, 0, 0.2, 1);
  --dur: 150ms;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111111;
    --surface: #242527;
    --surface-hover: #323335;
    --surface-strong: #3c3d40;
    --text: #ffffff;
    --text-2: rgba(255, 255, 255, 0.7);
    --text-3: rgba(255, 255, 255, 0.5);
    --divider: rgba(255, 255, 255, 0.2);
    --scrim: rgba(36, 37, 39, 0.8);
    --accent: #fec006;                      /* canary-500, measured */
    --accent-hover: #ffd54f;
    --accent-tint: rgba(254, 192, 6, 0.1);
    --on-accent: #111111;
  }
}
```

## 12. Gaps

- The logged-out marketing home and the login/signup page render only to signed-out users. The browser session was signed in and redirected to the dashboard. I took copy and meta from a signed-out TinyFish fetch, but measured no visuals.
- I didn't see light-mode app chrome. Light neutrals come from the CSS tokens. The light accent (grape) is a guess.
- No text input was on screen in the main app without starting an edit, so input styles are inferred.
- The logo is now extracted (see section 8). The first pass looked for an `<img>`, but it's an inline SVG.
- The AI pages under `/site/ai` redirect to the homepage. The only AI surface I saw was the "AI recipes" row on the dashboard.

Screenshots are in `screenshots/`.
