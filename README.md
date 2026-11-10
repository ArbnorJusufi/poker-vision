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

Camera and photo-library capture are implemented. Recognition is isolated
behind `services/CardRecognitionService.ts`; the default adapter deliberately
returns the manual card picker because this repository does not bundle a
trained 52-card detection model. A TFLite/CoreML adapter can be registered with
`CardRecognitionService.setAdapter()` without changing screens or game logic.

The manual picker validates all cards globally and prevents duplicates.
