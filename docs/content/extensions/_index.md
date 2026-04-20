---
title: "Extensions"
weight: 3
---

### Tag Autocomplete
![autocomplete](/assets/autocomplete.png)
This was originally just for the Preset Manager, but I now consider it an upgrade from the [pythongosssss/ComfyUI-Custom-Scripts](https://github.com/pythongosssss/ComfyUI-Custom-Scripts) autocomplete extension. Features include:

- Count-based sorting
- Color coding based on tag category
- Redirect tag aliases (`looking_aside` -> `looking_to_the_side`)
- Preset Manager tags merged
- Thumbnails for LoRAs, embeddings, and Preset Manager characters. LoRA and embedding thumbnails pull from image previews from [LoRA Manager](https://github.com/willmiao/ComfyUI-Lora-Manager).
- Custom tag sources
- Tag blacklist

### Preset Manager Button
![preset manager button](/assets/preset-manager-button.png)
The node pack automatically adds a button to the left of the ComfyUI Manager button, that brings up a web interface for managing prompt presets used in the `Prompt (full-pipe)` node.

### Full Pipe Previews
![full pipe preview](/assets/preview.png)
This adds previews of the completed image to in-pack generation nodes when execution finishes, replacing the live preview.

### Preview File Sizes
![filesize preview](/assets/filesize-preview.png)
This adds a label to the bottom right of an image preview, showing the filesize of the image.

### Keyboard shortcuts
- Alt+Up/Down will increment/decrement the batch count by 1
- Shift+Alt+Up/Down will double/halve the batch count

### Node Runtime
![runtime](/assets/runtime.png)
This shows how long nodes take to execute. Code taken from `comfyui-easy-use`.

### Line Numbers
![line numbers](/assets/line-numbers.png)
Adds line numbers to the left side of all textarea inputs when focused.
