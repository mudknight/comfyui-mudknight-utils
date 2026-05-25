---
title: "Workflows"
weight: 3
---

## SDXL
![sdxl](/assets/workflows/illustrious.png)

This workflow generates a base image, upscales it, and details the face. A second FastDetailer node can be used to detail eyes, or you could use the NestedDetailer node to detail both in the same node.

## Anima
![anima](/assets/workflows/anima.png)

This simple workflow is all that's really necessary for Anima. The base gen can go up to 1.5x scale without distortion and above that with the highres lora. Detailing isn't necessary with anima and will generally give worse results than not detailing at all.

This workflow also features a bypassed `Load Image to Latent` node that can be enabled to do image to image generation (without a mask) or inpainting (with a mask that functions as a latent mask.)

{{< callout type="info" >}}
This workflow uses the RDBT lora at 50% strength for stabilization. Download it and update the path if you'd like to use it.
{{< /callout >}}
