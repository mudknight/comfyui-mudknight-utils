---
title: "FastDetailer"
weight: 3
---

### FastDetailer
The FastDetailer nodes are an alternative to FaceDetailer that are intended to be faster and more detailed, at the (potential) cost of cohesion with the rest of the image. It simply crops a region, upscales it to 1MP, samples the image, scales it back down to its original size, and uncrops it. 

The `bbox_fallback` model will run if no SEGS were detected with the primary model, with the use-case to be used with models like `full_eyes_detect_v1.pt` and `Eyes.pt` as a fallback if only one eye is detected.
