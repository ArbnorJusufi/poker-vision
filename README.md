# Poker Vision

An Expo/React Native Texas Hold'em showdown calculator. Capture the five-card
board, add any number of players, enter each two-card hand, and calculate the
winner or split-pot share entirely on-device.

## Run

```bash
npm install
npm start
```

Use `npm test` for the poker-engine test suite and `npm run typecheck` for
strict TypeScript validation.

## Optional AI second opinion

Recognition is on-device by default. Users can optionally connect their **own**
AI account from the home screen ("Connect AI") for a second opinion on a hard
photo. Nothing is configured on the server and the app owner pays nothing:

- **Sign in with OpenRouter** (OAuth PKCE, browser only): the user signs in and
  approves the app, OpenRouter returns a key tied to *their* account and usage is
  billed to their credits. The key is exchanged on the home page (`/?code=`),
  so it works on any static host without special routing.
- **Own API key** for Claude, OpenAI or Gemini. The key is kept in this
  browser's `localStorage` and is sent only to that provider (Anthropic's
  browser-access header is set; Gemini's key travels in a header, not the URL).
- **Sign in with ChatGPT** is shown as pending. OpenAI only enables it for
  remotely hosted apps it has approved; submit the interest form at
  <https://developers.openai.com/siwc/quickstart> and switch it on afterwards.
  Claude and Gemini do not allow third-party apps to sign in with a consumer
  account, so they are key-only (or via OpenRouter).

After a capture, "Check with AI" sends only that photo, asks for a JSON card
list and compares it with the on-device reading. The AI never overrides the
result silently: the user taps "Use the AI's reading" and still confirms.
Code: `services/ai/` (request building, parsing, agreement; unit tested),
`screens/AiScreen.tsx`, `components/AiCheck.tsx`. Default models live in
`services/ai/types.ts` and can be changed in AI settings.

## Look and feel

The UI follows the editorial style of pokerlistings.com: white cards on a pale
canvas, near-black hero and footer, Inter type, and a red-orange accent
(`constants/theme.ts`). Green stays reserved for "confident / winner" and the
camera overlays keep their own dark palette (`overlay`).

## Card recognition

Photos are turned into cards by a trained 52-class YOLO11s detector
(`public/models/cards.onnx`, from
[sroot/lgd-cards-gen3](https://huggingface.co/sroot/lgd-cards-gen3), AGPL-3.0)
running **on-device in the browser** through `onnxruntime-web` (WASM). No
server or API key is involved and photos never leave the device unless the user
turns on the optional AI check above.

- The model finds the rank/suit index in each card corner. A card shows two
  corners and a deck has no duplicates, so detections are merged by card code.
- A sharp photo is read in one pass. If any expected card is missing or read
  with low confidence, detection escalates automatically: sharpened and
  contrast-stretched variants of the image, then overlapping tiles, then
  tiles combined with directional sharpening (for motion blur). Slightly blurry,
  dim or distant photos therefore still work, at the cost of a few extra seconds.
  Heavy blur (roughly a Gaussian blur radius above 4 px on a 1280 px photo) is
  beyond what this model can recover.
- Detected cards fill the slots automatically with a confidence notice. When
  something is missing, conflicts with another player's card, or confidence is
  low, the picker opens with the usable cards pre-selected.
- Pure detection logic lives in `services/recognition/yolo.ts` and is unit
  tested; the browser runner is `services/recognition/onnxWebRecognizer.ts`.
- The ONNX runtime files are copied to `public/ort/` by `npm install`
  (`scripts/copy-ort.mjs`).

Automatic detection currently runs on the **web build** (also when installed
to the iPhone/Android home screen). Native builds (Expo Go) fall back to the
manual picker because `onnxruntime-web` needs a browser; a native adapter can
be registered with `CardRecognitionService.setAdapter()`.

### Scan the whole table

"Scan whole table" on the home screen takes **one photo** of the five board
cards plus every player's two cards. The scan is adaptive and goes slower when
needed: a quick first round measures how large the cards appear, then later
rounds zoom to the size the detector reads best, finally on sharpened images,
and it stops once two consecutive rounds agree on a valid table. Votes from all
passes are combined; low-confidence readings are only used to fill a gap, and
only when their size and position fit the cards already found. A clear photo
takes roughly 10-30 s in the browser and it can be cancelled any time. The cards
are then grouped by position:

- the grouping that keeps one 5-card board and several 2-card hands as
  compact as possible is chosen (exact search up to 17 cards, heuristic above);
- an extra stray card (even card count) is dropped and flagged on the photo;
- players are numbered clockwise from the top of the picture;
- face-down cards are ignored.

The result is never applied silently: the review screen shows the annotated
photo, every group (Board, Player 1, Player 2, ...) as editable cards, and the
doubtful cards listed. Tap a group to correct it, then "Confirm and show
winner". Cards can still be corrected later from "Edit players" on the results
screen.

Limits: a photo showing only a few cards, extreme close-ups, and cards whose
corners are hidden are not reliably read, and a card can occasionally be
misread. Grouping is positional, so players' hands must be visibly separate
from each other and from the board. Grouping logic is in `utils/tableLayout.ts`.

### Cards with the rank and suit printed apart

Many poker apps and illustrations print the rank at the top-left and the suit
at the lower right instead of together in the corner. The detector was trained
on conventional corner indexes and misreads these. A second reader
(`services/recognition/splitIndex.ts`, `splitIndexDetector.ts`) handles them:

1. It finds dark and red glyph blobs that sit on a white card surface (relative
   to the picture's own white level, so dim photos work).
2. It pairs each rank with the suit printed below and to the right of it (the
   suit must be clearly displaced from the rank, so conventional cards are left
   to the standard detector).
3. Each pair is redrawn as a conventional corner index on a model-sized canvas
   (layout tuned against the detector), also sharpened for soft photos, and the
   same model reads it. Rebuilt corners must sit on a mostly white area, so
   chips and artwork are not read as cards.
4. Its readings vote with the standard passes. Where it has read a card
   confidently (50% or more), the standard detector's guesses at that spot are
   ignored, because it misreads this style.

It runs for single photos, the table scan and (every third scan, on a
reduced-size frame) the live scanner. Its readings are real model confidences:
on a small illustration most correct cards score 75-87%, and low-contrast or
tiny glyphs score lower. The table review shows each card's percentage and
flags the doubtful ones. K and A glyphs in some fonts are easily confused.

### Live camera scanner

Opening the camera starts recognition immediately, with no photo needed. The
detector runs continuously on frames from the live `<video>` and draws what it
sees on top of the preview:

- **Boxes** around each detected card index with the value and confidence
  (for example `K♠ 87%`). Green is confident (60% or more), yellow uncertain
  (35-60%), red recognition failed (below 35%, shown from 20%). Boxes follow the
  cards as they move; a card is dropped after a few scans that should have seen
  it, so the view does not flicker or keep ghosts.
- **Counter** such as `3/5 cards` for the board, or `7 cards - 1 player` in
  table mode, and a banner. When everything required is recognised and stable,
  the counter, guide frame and shutter turn green ("All 5 cards detected").
- **Capture stays available while scanning.** If the live view is not complete,
  capture asks "Capture anyway?" with what is missing. On capture a
  full-resolution photo is taken and the full recognition pipeline (the
  escalating passes above) runs on it.
- **Confirmation.** The final reading is compared with what the live view had
  seen ("Live preview and photo agree on all 5 cards" or the differences) and
  shown with the photo and a confidence dot per card ("seen live", "photo
  only", "set by you"). Cards can be corrected before confirming; the table
  scan has the same review with editable groups.

How it stays responsive and modular:

- Inference runs in a **Web Worker** (`public/workers/inference.worker.js`),
  so the UI thread is never blocked. The model is loaded once and shared by
  live scanning and photo recognition.
- `LiveScanner` (`services/recognition/liveScanner.ts`) is one sequential loop:
  a single scan in flight, a short rest between scans, unchanged video frames
  skipped. Scans alternate between the whole frame and zoomed windows (sized
  from the cards already measured), and between plain and mildly sharpened
  views while something is missing. Soft video is why the enhancement exists,
  but strong sharpening hurts on already-crisp frames, so only a mild one is used.
- `LiveTracker` (`live.ts`) smooths confidence and boxes over scans.
- The camera UI only depends on `LiveScanService` and the `LiveEngine`,
  `FrameSource` and `LiveRenderer` interfaces. Swapping the ML model means
  providing another `LiveEngine` (and decoder); `CardCapture`, the overlay and
  the confirmation screens do not change.
- Leaving the camera stops the loop, clears the tracker and releases the
  rendering canvas; the `<video>` is unmounted and `expo-camera` stops the
  stream. The worker stays alive to avoid reloading the model.

Limits: live scanning is **web only** (also when installed to the home screen).
Expo Go has no per-frame vision API, so there the camera shows an
"unavailable" banner and works as capture-then-read. Live scans run about 1-2
per second on a desktop and slower on phones. Dense tables, small or stylised
cards (very small indices, unusual court-card art) and soft video are read
only partly live; capture runs the slower, more thorough pass on the photo, and
the confirmation screen is where remaining mistakes are fixed.

### Camera focus

In the camera, tap anywhere on the preview or press **Focus** to re-trigger
autofocus (a "Focusing..." ring confirms it). `expo-camera` has no focus-point
API, so this refocuses the camera rather than focusing on the tapped spot. It
flips the autofocus mode briefly and restores continuous autofocus; the two
modes mean opposite things on the web and on phones, which `CardCapture`
accounts for. On the web the camera is also now explicitly in continuous
autofocus (the library's default there was locked/manual focus).

Tips for good results: even light, card corners (rank and suit) visible, and
cards not covering each other's corners.

The manual picker validates all cards globally and prevents duplicates.
