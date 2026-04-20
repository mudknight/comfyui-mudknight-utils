---
title: "Full Pipe"
weight: 2
---

### Full Pipe Concept
![test](/assets/anima-workflow.png)

The idea of the full pipe nodes is to have a single connection between nodes and allow for easy inlining within full pipes through dedicated nodes and subgraphs. The above example shows a simple workflow for anima adding the `CLIP NegPip` node to the pipe via a subgraph and adding a lora with the `Load LoRA (full-pipe)` node.

These were made as an alternative to [ComfyUI-Easy-Use](https://github.com/yolain/ComfyUI-Easy-Use) pipe nodes, with the intention of being faster and storing metadata info in the pipe.

### Loader (full-pipe)
Loads a selected checkpoint, sets CLIP skip, sets a seed, and optionally applies a LoRA stack from the input.

### Split Loader (full-pipe)
Same as the loader node, but loads separate diffusion, CLIP, and VAE models.

### Prompt (full-pipe)
This is a combined positive and negative prompt box that lets you use pre-defined prompt text. Features include:
- Accepts LoRA syntax
- Ignores `#` commented lines
- Automatically applies quality tags, embeddings, style tags, character tags, and preset tags from Preset Manager.
- Splits quality tags+embeddings, style tags, character tags, and the main prompt into separate conditionings and then concatenates the conditionings.

### Simple Prompt (full-pipe)
This is a simpler version of the prompt node, made primarily for anima. It keeps the lora syntax and commenting, but omits the rest of the features. There's a setting at the bottom of the node to convert the negative prompt to negpip, which requires the `CLIP NegPip` node from [ComfyUI-ppm](https://github.com/pamparamm/ComfyUI-ppm).

### Base (full-pipe)
This is the base image generation node. By default it will use an empty latent with the dimensions defined by the node, but it also has an `image` input and `denoise` parameter for img2img generation.

### Upscale (full-pipe)
This is an upscaling node that will upscale using lanczos and an upscale model (or none) to a target scale value and then resample the image.

### Save (full-pipe)
This node saves the image with the ComfyUI workflow and A1111 metadata. I use a tool on my images that pulls the A1111 prompt (since pulling a prompt from a comfy workflow isn't standardized in any way), so that's the main focus of the node.
