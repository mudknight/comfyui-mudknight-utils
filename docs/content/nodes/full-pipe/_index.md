---
title: "Full Pipe"
weight: 2
---

### Full Pipe Concept
A full pipe can either be made with the `Loader (full-pipe)` node or manually with `Full Pipe Loader`. The pipe functions as the only necessary connection between discrete sections of a workflow, storing all necessary data.

The main differences between easy use pipes and full pipes are:
- Full pipes store additional information, like `ckpt_name`, `positive_text`, and `negative_text`
- Easy use's pipe in node takes ~5 seconds to run, compared to full pipe in which is almost instantaneous.
- Less ambiguity with the seed input.
- Pipe nodes can be used independently, without relying on the loader node (but you'll need to use a `Full Pipe Loader` node).

### Loader (full-pipe)
Loads a selected checkpoint, sets CLIP skip, sets a seed, and optionally applies a LoRA stack from the input.

### Prompt (full-pipe)
This is a combined positive and negative prompt box that lets you use pre-defined prompt text. Features include:
- Accepts LoRA syntax
- Ignores `#` commented lines
- Automatically applies quality tags, embeddings, style tags, character tags, and preset tags from Preset Manager.
- Splits quality tags+embeddings, style tags, character tags, and the main prompt into separate conditionings and then concatenates the conditionings.

### Base (full-pipe)
This is the base image generation node. By default it will use an empty latent with the dimensions defined by the node, but it also has an `image` input and `denoise` parameter for img2img generation.

### Upscale (full-pipe)
This is an upscaling node that will upscale using lanczos and an upscale model (or none) to a target scale value and then resample the image.

### Save (full-pipe)
This node saves the image with the ComfyUI workflow and A1111 metadata. I use a tool on my images that pulls the A1111 prompt (since pulling a prompt from a comfy workflow isn't standardized in any way), so that's the main focus of the node.
