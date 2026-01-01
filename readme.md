# ComfyUI mudknight utils

Nodes to clean up your workflow.

![full workflow](assets/workflow-full.png)

I designed these nodes as an alternative to the `comfyui-easy-use` pipe system. I like easy-use nodes in concept, but I don't like how long it takes to use `pipe-in`, which ruins their flexibility.

I also designed FastDetailer as an alternative to FaceDetailer, with the self-explanatory goal of making a detailer that's faster.

## Dependencies
This node pack requires the following node packs:

- [ComfyUI-Impact-Pack](https://github.com/ltdrdata/ComfyUI-Impact-Pack)
- [ComfyUI-Impact-Subpack](https://github.com/ltdrdata/ComfyUI-Impact-Subpack)

## Nodes

### Full Pipe
A full pipe can either be made with the `Loader (full-pipe)` node or manually with `full pipe pack`. The pipe functions as the only necessary connection between discrete sections of a workflow, storing all necessary data.

The main differences between easy use pipes and full pipes are:
- Full pipes store additional information, like `ckpt_name`, `positive_text`, and `negative_text`
- Easy use's pipe in node takes ~5 seconds to run, compared to full pipe in which is almost instantaneous.
- Less ambiguity with the seed input.
- Pipe nodes can be used independently, without relying on the loader node (but you'll need to use a `Full Pipe Pack` node).

### Loader (full-pipe)
Loads a selected checkpoint, sets CLIP skip, sets a seed, and optionally applies a LoRA stack from the input.

### Prompt from Presets (full-pipe)
This is a combined positive and negative prompt box that lets you use pre-defined prompt text. Features include:
- Accepts LoRA syntax
- Ignores `#` commented lines
- Auto-expands character tags that are defined in `config/characters.jsonc`, along with `top` and `bottom` to use the defined portions of their default outfit.
- Lets you select between pre-defined style presets defined in `config/styles.jsonc`
- Automatically applies quality tags and embeddings when enabled for model families as defined in `config/models.jsonc`
- Splits quality tags+embeddings, style tags, character tags, and the main prompt into separate conditionings and then concatenates the conditionings.

### Base (full-pipe)
This is the base image generation node. By default it will use an empty latent with the dimensions defined by the node, but it also has an `image` input and `denoise` parameter for img2img generation.

### Upscale (full-pipe)
This is an upscaling node that uses simple lanczos scaling and sampling. I've never found that an upscale model is necessary, so it's not included in the node.

### FastDetailer
The FastDetailer nodes are an alternative to FaceDetailer that are intended to be faster and more detailed, at the (potential) cost of cohesion with the rest of the image. It simply crops a region, upscales it to 1MP, samples the image, scales it back down to its original size, and uncrops it. The `bbox_fallback` model will run if no SEGS were detected with the primary model, with the use-case to be used with models like `full_eyes_detect_v1.pt` and `Eyes.pt` as a fallback if only one eye is detected.

`FastDetailer (full-pipe)` uses `full_pipe`, as the name implies.

These nodes currently depend on other nodes from impact-pack and easy-use. I'd like to move away from these in the future.

### Save (full-pipe)
This node saves the image with the ComfyUI workflow and A1111 metadata. I use a tool on my images that pulls the A1111 prompt (since pulling a prompt from a comfy workflow isn't standardized in any way), so that's the main focus of the node. This uses the `Image Saver` node internally.

## Extensions

### Character Editor
The node pack automatically adds a button to the left of the ComfyUI Manager button, that brings up a web interface for managing the `characters.jsonc` file used in the `Prompt from Presets (full-pipe)` node. This is a work-in-progress, and I'd like to include the other config files in the future and improve organization.
