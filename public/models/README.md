# Card detection model

`cards.onnx` is `model.onnx` from https://huggingface.co/sroot/lgd-cards-gen3
(YOLO11s, 52 playing-card classes), licensed **AGPL-3.0** because it is a
fine-tune of Ultralytics YOLO11. Class order: see `CARD_CODES` in
`services/recognition/yolo.ts`. If you deploy this app publicly, AGPL-3.0 §13
requires offering users the corresponding source of the deployed service.
