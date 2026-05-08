#!/usr/bin/env python3
"""
Inpainting nodes for ComfyUI. Provides a two-pass inpainting workflow:
  1. Downscale to 1MP, sample with mask as latent noise mask.
  2. Upscale to original resolution (optionally with a model),
     composite inpainted region onto original image, blur the mask,
     and run a second low-denoise sample to blend and add detail.
"""

import torch
import torch.nn.functional as F
import comfy.samplers
from . import common


def _resize_to_megapixel(width, height):
    """Return (w, h) scaled to ~1MP, rounded to multiples of 8."""
    aspect = width / height
    target = 1_048_576
    new_h = (target / aspect) ** 0.5
    new_w = aspect * new_h
    return int(round(new_w / 8) * 8), int(round(new_h / 8) * 8)


def _scale_image(image, width, height):
    """Scale image tensor [B,H,W,C] to (width, height) via lanczos."""
    scale = common.Node("ImageScale")
    return scale.function(image, "lanczos", width, height, "disabled")[0]


def _scale_mask(mask, width, height):
    """
    Scale mask tensor [B,H,W] to (width, height).
    Uses bilinear interpolation (lanczos unavailable in F.interpolate).
    """
    m = mask.unsqueeze(1).float()
    m = F.interpolate(
        m, size=(height, width), mode="bilinear", align_corners=False
    )
    return m.squeeze(1)


def _set_latent_mask(latent, mask):
    """Attach a noise mask to a latent dict."""
    set_mask = common.Node("SetLatentNoiseMask")
    return set_mask.function(latent, mask)[0]


def _gaussian_blur_mask(mask, radius):
    """
    Apply a gaussian blur to a mask tensor [B,H,W].
    Kernel size is derived from radius; sigma is radius / 3.
    """
    if radius <= 0:
        return mask

    # Kernel size must be odd
    ks = int(radius) * 2 + 1

    # Build 1-D gaussian kernel
    sigma = radius / 3.0
    coords = torch.arange(ks, dtype=torch.float32, device=mask.device)
    coords -= ks // 2
    kernel_1d = torch.exp(-(coords ** 2) / (2 * sigma ** 2))
    kernel_1d /= kernel_1d.sum()

    # Outer product -> 2-D kernel [1, 1, ks, ks]
    kernel_2d = kernel_1d.unsqueeze(0) * kernel_1d.unsqueeze(1)
    kernel_2d = kernel_2d.unsqueeze(0).unsqueeze(0)

    # [B, H, W] -> [B, 1, H, W]
    m = mask.unsqueeze(1).float()
    padding = ks // 2
    m = F.conv2d(m, kernel_2d, padding=padding)
    return m.squeeze(1).clamp(0.0, 1.0)


def _upscale_image(image, upscale_model, target_w, target_h):
    """
    Upscale image with an optional model, then lanczos-resize to
    (target_w, target_h).
    """
    if upscale_model != "none":
        loader = common.Node("UpscaleModelLoader")
        model_obj = loader.function(upscale_model)[0]
        upscale = common.Node("ImageUpscaleWithModel")
        image = upscale.function(model_obj, image)[0]

    return _scale_image(image, target_w, target_h)


def inpaint(
        image, mask, model, vae, positive, negative, seed,
        inpaint_sampler, inpaint_scheduler, inpaint_steps,
        inpaint_cfg, inpaint_denoise,
        detail_sampler, detail_scheduler, detail_steps,
        detail_cfg, detail_denoise,
        upscale_model, blur_radius):
    """
    Core two-pass inpainting routine shared by both node classes.

    Pass 1:
      - Downscale image + mask to ~1MP.
      - Encode, set mask as latent noise mask, sample.
      - Decode result.

    Pass 2:
      - Upscale pass-1 result to original resolution.
      - Apply original mask to extract inpainted region.
      - Composite onto original image.
      - Blur original mask, set as latent noise mask on composited image.
      - Encode, sample, decode.

    Returns the final decoded image tensor [B,H,W,C].
    """
    # Ensure mask is [B, H, W]
    if mask.dim() == 2:
        mask = mask.unsqueeze(0)

    orig_h = image.shape[1]
    orig_w = image.shape[2]

    # --- Pass 1: sample at 1MP ---

    mp_w, mp_h = _resize_to_megapixel(orig_w, orig_h)

    small_image = _scale_image(image, mp_w, mp_h)
    small_mask = _scale_mask(mask, mp_w, mp_h)

    vae_encode = common.Node("VAEEncode")
    latent = vae_encode.function(vae, small_image)[0]
    latent = _set_latent_mask(latent, small_mask)

    sampled = common.sample_latent(
        model, positive, negative, seed,
        inpaint_sampler, inpaint_scheduler, inpaint_steps,
        inpaint_cfg, inpaint_denoise, latent
    )

    vae_decode = common.Node("VAEDecode")
    pass1_image = vae_decode.function(vae, sampled)[0]

    # --- Upscale pass-1 result to original resolution ---

    upscaled = _upscale_image(pass1_image, upscale_model, orig_w, orig_h)

    # --- Composite: apply original mask, blend onto original image ---

    # Expand mask to [B, H, W, 1] for broadcasting with [B, H, W, C]
    mask_4d = mask.unsqueeze(-1).clamp(0.0, 1.0)

    composited = upscaled * mask_4d + image * (1.0 - mask_4d)

    # --- Pass 2: detail/blend at original resolution ---

    blurred_mask = _gaussian_blur_mask(mask, blur_radius)

    latent2 = vae_encode.function(vae, composited)[0]
    latent2 = _set_latent_mask(latent2, blurred_mask)

    sampled2 = common.sample_latent(
        model, positive, negative, seed,
        detail_sampler, detail_scheduler, detail_steps,
        detail_cfg, detail_denoise, latent2
    )

    final_image = vae_decode.function(vae, sampled2)[0]

    return final_image


_SAMPLERS = comfy.samplers.KSampler.SAMPLERS
_SCHEDULERS = list(comfy.samplers.KSampler.SCHEDULERS) + ["align_your_steps"]

# Sampler inputs for the first (inpainting) pass
_INPAINT_SAMPLER_INPUTS = {
    "inpaint_sampler": (_SAMPLERS, {"default": "euler_ancestral_cfg_pp"}),
    "inpaint_scheduler": (_SCHEDULERS, {"default": "karras"}),
    "inpaint_steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
    "inpaint_cfg": ("FLOAT", {
        "default": 1.5, "min": 0.0, "max": 100.0,
        "step": 0.1, "round": 0.01,
    }),
    "inpaint_denoise": ("FLOAT", {
        "default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01,
    }),
}

# Sampler inputs for the second (detail/blend) pass
_DETAIL_SAMPLER_INPUTS = {
    "detail_sampler": (_SAMPLERS, {"default": "euler_ancestral_cfg_pp"}),
    "detail_scheduler": (_SCHEDULERS, {"default": "karras"}),
    "detail_steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
    "detail_cfg": ("FLOAT", {
        "default": 1.5, "min": 0.0, "max": 100.0,
        "step": 0.1, "round": 0.01,
    }),
    "detail_denoise": ("FLOAT", {
        "default": 0.2, "min": 0.0, "max": 1.0, "step": 0.01,
    }),
}

# Upscale/blur inputs shared by both node classes
_UPSCALE_INPUTS = {
    "upscale_model": (common.get_upscale_model_list(),),
    "blur_radius": ("INT", {
        "default": 20,
        "min": 0,
        "max": 512,
        "step": 1,
        "tooltip": "Gaussian blur radius applied to mask before pass 2.",
    }),
}


class InpaintNode:
    """
    Two-pass inpainting node. Takes explicit model/vae/conditioning inputs.

    Pass 1 samples at ~1MP with the mask as a latent noise mask.
    Pass 2 upscales to original resolution, composites the inpainted region,
    then re-samples with a blurred mask for detail and blending.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "mask": ("MASK",),
                "model": ("MODEL",),
                "vae": ("VAE",),
                "positive": ("CONDITIONING",),
                "negative": ("CONDITIONING",),
                "seed": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 0xffffffffffffffff,
                }),
                **_INPAINT_SAMPLER_INPUTS,
                **_DETAIL_SAMPLER_INPUTS,
                **_UPSCALE_INPUTS,
            },
            "hidden": {"extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "process"
    CATEGORY = "mudknight/custom"

    def process(
            self, image, mask, model, vae, positive, negative, seed,
            inpaint_sampler, inpaint_scheduler, inpaint_steps,
            inpaint_cfg, inpaint_denoise,
            detail_sampler, detail_scheduler, detail_steps,
            detail_cfg, detail_denoise,
            upscale_model, blur_radius,
            extra_pnginfo=None):
        """Run two-pass inpainting and return the final image."""
        final = inpaint(
            image, mask, model, vae, positive, negative, seed,
            inpaint_sampler, inpaint_scheduler, inpaint_steps,
            inpaint_cfg, inpaint_denoise,
            detail_sampler, detail_scheduler, detail_steps,
            detail_cfg, detail_denoise,
            upscale_model, blur_radius
        )
        return common.return_preview(
            (final,), final, extra_pnginfo
        )


class InpaintPipeNode:
    """
    Two-pass inpainting node using full_pipe for model/vae/conditioning.
    Accepts an optional image override; falls back to pipe image.
    Outputs updated full_pipe with the final image, plus the image itself.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "full_pipe": ("FULL_PIPE",),
                "mask": ("MASK",),
                **_INPAINT_SAMPLER_INPUTS,
                **_DETAIL_SAMPLER_INPUTS,
                **_UPSCALE_INPUTS,
            },
            "optional": {
                "image": ("IMAGE",),
            },
            "hidden": {"extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = ("FULL_PIPE", "IMAGE",)
    RETURN_NAMES = ("full_pipe", "image",)
    FUNCTION = "process"
    CATEGORY = "mudknight/custom"

    def process(
            self, full_pipe, mask,
            inpaint_sampler, inpaint_scheduler, inpaint_steps,
            inpaint_cfg, inpaint_denoise,
            detail_sampler, detail_scheduler, detail_steps,
            detail_cfg, detail_denoise,
            upscale_model, blur_radius,
            image=None, extra_pnginfo=None):
        """Run two-pass inpainting via full_pipe and return updated pipe."""
        model = full_pipe.get("model")
        vae = full_pipe.get("vae")
        positive = full_pipe.get("positive")
        negative = full_pipe.get("negative")
        seed = full_pipe.get("seed", 0)

        if image is None:
            image = full_pipe.get("image")

        if image is None:
            raise ValueError("No image provided and full_pipe has no image.")

        final = inpaint(
            image, mask, model, vae, positive, negative, seed,
            inpaint_sampler, inpaint_scheduler, inpaint_steps,
            inpaint_cfg, inpaint_denoise,
            detail_sampler, detail_scheduler, detail_steps,
            detail_cfg, detail_denoise,
            upscale_model, blur_radius
        )

        full_pipe_in = common.Node("FullPipeIn")
        updated_pipe = full_pipe_in.function(full_pipe, image=final)[0]

        return common.return_preview(
            (updated_pipe, final), final, extra_pnginfo
        )


NODE_CLASS_MAPPINGS = {
    "InpaintNode": InpaintNode,
    "InpaintPipeNode": InpaintPipeNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "InpaintNode": "Inpaint",
    "InpaintPipeNode": "Inpaint (full-pipe)",
}
