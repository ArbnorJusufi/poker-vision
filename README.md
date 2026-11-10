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
- If fewer cards than expected are found, overlapping image tiles are scanned
  too (helps with photos taken from far away).
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

Tips for good results: even light, card corners (rank and suit) visible, and
cards not covering each other's corners.

The manual picker validates all cards globally and prevents duplicates.
