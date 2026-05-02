#!/usr/bin/env python3

import torch
import nodes
import comfy.samplers
import comfy.sample
from . import common
from .resolution import ResolutionSelector

KSAMPLER_INPUTS = {
    "sampler_name": (
        comfy.samplers.KSampler.SAMPLERS,
        {"default": "euler_ancestral_cfg_pp"}
    ),
    "scheduler": (
        list(comfy.samplers.KSampler.SCHEDULERS) + ["align_your_steps"],
        {"default": "karras"}
    ),
    "steps": ("INT", {
        "default": 20,
        "min": 1,
        "max": 10000
    }),
    "cfg": ("FLOAT", {
        "default": 1.5,
        "min": 0.0,
        "max": 100.0,
        "step": 0.1,
        "round": 0.01
    }),
    "denoise": ("FLOAT", {
        "default": 1.0,
        "min": 0.0,
        "max": 1.0,
        "step": 0.01
    }),
}


class BaseNode:
    """
    Custom base generation node that creates images from either empty
    latent or an optional input image. Exposes sampler, scheduler,
    steps, CFG, denoise, width, and height parameters.
    """

    @classmethod
    def INPUT_TYPES(cls):
        resolution_selector = ResolutionSelector

        return {
            "required": {
                "full_pipe": ("FULL_PIPE",),
                **KSAMPLER_INPUTS,
                "resolution": (
                    list(resolution_selector.RESOLUTIONS.keys()),
                    {"default": "832x1216 (2:3)"}
                ),
                "portrait": ("BOOLEAN", {"default": True}),
                "batch_size": ("INT", {
                    "default": 1,
                    "min": 1,
                }),
            },
            "optional": {
                "image": ("IMAGE",),
            },
            "hidden": {"extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = ("FULL_PIPE", "IMAGE",)
    RETURN_NAMES = ("full_pipe", "image",)
    OUTPUT_NODE = True
    FUNCTION = "generate"
    CATEGORY = "mudknight/custom"

    def generate(
            self, full_pipe, sampler_name, scheduler, steps, cfg,
            denoise, resolution, portrait, batch_size=1,
            image=None, extra_pnginfo=None):
        """Generate image from latent using sampling."""

        # Unpack full_pipe
        model = full_pipe.get("model")
        vae = full_pipe.get("vae")
        positive = full_pipe.get("positive")
        negative = full_pipe.get("negative")
        seed = full_pipe.get("seed")
        latent = full_pipe.get("latent")

        # Determine latent source — encoded once, reused for all samples
        if image is not None:
            # Scale image to target resolution
            scale_node = common.Node("ImageScaleToTotalPixels")
            scaled_image = scale_node.function(image, "lanczos", 1, 1)[0]

            # Encode to latent
            vae_encode = common.Node("VAEEncode")
            latent = vae_encode.function(vae, scaled_image)[0]
        elif latent is not None:
            pass
        else:
            # Get resolution
            width, height = ResolutionSelector().get_resolution(
                resolution, portrait)
            # Create empty latent
            empty_latent = common.Node("EmptyLatentImage")
            latent = empty_latent.function(width, height, 1)[0]
            # Override denoise to 1 if no input image
            denoise = 1.0

        # Sample batch_size times, incrementing seed each iteration
        vae_decode = common.Node("VAEDecode")
        decoded_images = []
        for i in range(batch_size):
            sampled_latent = common.sample_latent(
                model, positive, negative, seed + i, sampler_name,
                scheduler, steps, cfg, denoise, latent
            )
            decoded_images.append(
                vae_decode.function(vae, sampled_latent)[0]
            )

        # Concatenate all decoded images into a single batch tensor
        batch = torch.cat(decoded_images, dim=0)

        # Pack back into full_pipe with the full image batch
        full_pipe_in = common.Node("FullPipeIn")
        result = full_pipe_in.function(full_pipe, image=batch)[0]

        return common.return_preview(
            (result, batch),
            batch,
            extra_pnginfo
        )


class UpscaleNode:
    """
    Custom upscale node that scales an image and processes it through
    sampling. Exposes sampler, scheduler, steps, CFG, denoise, and
    scale factor parameters.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "full_pipe": ("FULL_PIPE",),
                **KSAMPLER_INPUTS,
                "scheduler": (
                    KSAMPLER_INPUTS["scheduler"][0],
                    {"default": "align_your_steps"}
                ),
                "upscale_model": (common.get_upscale_model_list(),),
                "scale_by": ("FLOAT", {
                    "default": 2.0,
                    "min": 0.01,
                    "max": 8.0,
                    "step": 0.01
                }),
                "batch_size": ("INT", {
                    "default": 1,
                    "min": 1,
                }),
            },
            "optional": {
                "image": ("IMAGE",),
            },
            "hidden": {"extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = ("FULL_PIPE", "IMAGE",)
    RETURN_NAMES = ("full_pipe", "image",)
    FUNCTION = "upscale"
    CATEGORY = "mudknight/custom"

    def upscale(
            self, full_pipe, sampler_name, scheduler, steps, cfg,
            denoise, upscale_model, scale_by, batch_size=1,
            image=None, extra_pnginfo=None):
        """Upscale and sample image."""
        # Unpack full_pipe
        model = full_pipe.get("model")
        vae = full_pipe.get("vae")
        positive = full_pipe.get("positive")
        negative = full_pipe.get("negative")
        seed = full_pipe.get("seed")

        # Use pipe image if no input image provided
        if image is None:
            image = full_pipe.get("image")

        # Scale image once — reused for all samples
        if upscale_model != "none":
            image_scale = common.Node("CombinedUpscaleNode")
            scaled_image = image_scale.function(
                image, upscale_model, scale_by, 'lanczos')[0]
        else:
            image_scale = common.Node("ImageScaleBy")
            scaled_image = image_scale.function(
                image, "lanczos", scale_by)[0]

        # Encode to latent once — reused for all samples
        vae_encode = common.Node("VAEEncode")
        latent = vae_encode.function(vae, scaled_image)[0]

        # Sample batch_size times, incrementing seed each iteration
        vae_decode = common.Node("VAEDecode")
        decoded_images = []
        for i in range(batch_size):
            sampled_latent = common.sample_latent(
                model, positive, negative, seed + i, sampler_name,
                scheduler, steps, cfg, denoise, latent
            )
            decoded_images.append(
                vae_decode.function(vae, sampled_latent)[0]
            )

        # Concatenate all decoded images into a single batch tensor
        batch = torch.cat(decoded_images, dim=0)

        # Pack back into full_pipe with the full image batch
        full_pipe_in = common.Node("FullPipeIn")
        result = full_pipe_in.function(full_pipe, image=batch)[0]

        return common.return_preview(
            (result, batch),
            batch,
            extra_pnginfo
        )


NODE_CLASS_MAPPINGS = {
    "UpscaleNode": UpscaleNode,
    "BaseNode": BaseNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "UpscaleNode": "Upscale (full-pipe)",
    "BaseNode": "Base (full-pipe)",
}
