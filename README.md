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

## Card recognition

Photos are turned into cards by a trained 52-class YOLO11s detector
(`public/models/cards.onnx`, from
[sroot/lgd-cards-gen3](https://huggingface.co/sroot/lgd-cards-gen3), AGPL-3.0)
running **on-device in the browser** through `onnxruntime-web` (WASM). No
server or API key is involved and photos never leave the device.

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

When every card is read confidently the app goes straight to the results.
Otherwise it stays on the annotated photo (each card tagged Board, P1, P2, ...)
with the doubtful cards listed, so you can retake the photo or continue. Cards
can still be corrected afterwards from "Edit players" on the results screen.

Limits: a photo showing only a few cards, extreme close-ups, and cards whose
corners are hidden are not reliably read, and a card can occasionally be
misread. Grouping is positional, so players' hands must be visibly separate
from each other and from the board. Grouping logic is in `utils/tableLayout.ts`.

Tips for good results: even light, card corners (rank and suit) visible, and
cards not covering each other's corners.

The manual picker validates all cards globally and prevents duplicates.
