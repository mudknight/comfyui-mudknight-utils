#!/usr/bin/env python3

import nodes
import comfy.samplers
import comfy.sample
from . import common

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


def detect_model_type(model):
    """ Detect model type (SDXL, SD1, SVD) based on latent channels. """
    model_type = "SDXL"  # Default

    try:
        if hasattr(model.model, 'latent_format'):
            latent_channels = model.model.latent_format.latent_channels
            if latent_channels == 16:
                model_type = "SDXL"
            elif latent_channels == 4:
                # Check if it's SVD by looking at model structure
                if (hasattr(model.model, 'is_temporal') or
                        'svd' in str(type(model.model)).lower()):
                    model_type = "SVD"
                else:
                    model_type = "SD1"
    except Exception:
        # Fallback to SDXL if detection fails
        pass

    return model_type


def sample_latent(
        model, positive, negative, seed, sampler_name,
        scheduler, steps, cfg, denoise, latent):
    """ Sample a latent using the specified parameters. """

    # Create sampler
    sampler_select = common.Node("KSamplerSelect")
    sampler = sampler_select.function(sampler_name)[0]

    # Create scheduler
    if scheduler == "align_your_steps":
        model_type = detect_model_type(model)
        ays_scheduler = common.Node("AlignYourStepsScheduler")
        sigmas = ays_scheduler.function(model_type, steps, denoise)[0]
    else:
        scheduler_node = common.Node("BasicScheduler")
        sigmas = scheduler_node.function(
            model, scheduler, steps, denoise)[0]

    # Sample
    sampler_custom = common.Node("SamplerCustom")
    sampled_latent = sampler_custom.function(
        model, True, seed, cfg, positive, negative,
        sampler, sigmas, latent
    )[0]

    return sampled_latent


class BaseNode:
    """
    Custom base generation node that creates images from either empty
    latent or an optional input image. Exposes sampler, scheduler,
    steps, CFG, denoise, width, and height parameters.
    """

    @classmethod
    def INPUT_TYPES(cls):
        resolution_selector = nodes.NODE_CLASS_MAPPINGS[
            "ResolutionSelector"]

        return {
            "required": {
                "full_pipe": ("FULL_PIPE",),
                **KSAMPLER_INPUTS,
                "resolution": (
                    list(resolution_selector.RESOLUTIONS.keys()),
                    {"default": "832x1216 (2:3)"}
                ),
                "portrait": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "image": ("IMAGE",),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("FULL_PIPE", "IMAGE",)
    RETURN_NAMES = ("full_pipe", "image",)
    OUTPUT_NODE = True
    FUNCTION = "generate"
    CATEGORY = "mudknight/custom"

    def generate(
            self, full_pipe, sampler_name, scheduler, steps, cfg,
            denoise, resolution, portrait, image=None, prompt=None,
            extra_pnginfo=None):
        """Generate image from latent using sampling."""

        # Unpack full_pipe
        model = full_pipe.get("model")
        vae = full_pipe.get("vae")
        positive = full_pipe.get("positive")
        negative = full_pipe.get("negative")
        seed = full_pipe.get("seed")

        # Get resolution
        resolution_selector = common.Node("ResolutionSelector")
        width, height = resolution_selector.function(
            resolution, portrait)

        # Determine latent source
        if image is not None:
            # Scale image to target resolution
            scale_node = common.Node("ImageScaleToTotalPixels")
            scaled_image = scale_node.function(image, "lanczos", 1, 1)[0]

            # Encode to latent
            vae_encode = common.Node("VAEEncode")
            latent = vae_encode.function(vae, scaled_image)[0]
        else:
            # Create empty latent
            empty_latent = common.Node("EmptyLatentImage")
            latent = empty_latent.function(width, height, 1)[0]
            # Override denoise to 1 if no input image
            denoise = 1.0

        # Sample latent
        sampled_latent = sample_latent(
            model, positive, negative, seed, sampler_name,
            scheduler, steps, cfg, denoise, latent
        )

        # Decode
        vae_decode = common.Node("VAEDecode")
        decoded_image = vae_decode.function(vae, sampled_latent)[0]

        # Pack back into full_pipe
        full_pipe_in = common.Node("FullPipeIn")
        result = full_pipe_in.function(full_pipe, image=decoded_image)[0]

        # Generate preview
        preview = common.Node("PreviewImage")
        preview_result = preview.function(decoded_image)

        return {
            "ui": preview_result.get("ui", {}),
            "result": (result, decoded_image,)
        }


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
            },
            "optional": {
                "image": ("IMAGE",),
            }
        }

    RETURN_TYPES = ("FULL_PIPE", "IMAGE",)
    RETURN_NAMES = ("full_pipe", "image",)
    FUNCTION = "upscale"
    CATEGORY = "mudknight/custom"

    def upscale(
            self, full_pipe, sampler_name, scheduler, steps, cfg,
            denoise, upscale_model, scale_by, image=None):
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

        # Scale image
        if upscale_model != "none":
            image_scale = common.Node("CombinedUpscaleNode")
            scaled_image = image_scale.function(
                image, upscale_model, scale_by, 'lanczos')[0]
        else:
            image_scale = common.Node("ImageScaleBy")
            scaled_image = image_scale.function(
                image, "lanczos", scale_by)[0]

        # Encode to latent
        vae_encode = common.Node("VAEEncode")
        latent = vae_encode.function(vae, scaled_image)[0]

        # Sample latent
        sampled_latent = sample_latent(
            model, positive, negative, seed, sampler_name,
            scheduler, steps, cfg, denoise, latent
        )

        # Decode
        vae_decode = common.Node("VAEDecode")
        decoded_image = vae_decode.function(vae, sampled_latent)[0]

        # Pack back into full_pipe
        full_pipe_in = common.Node("FullPipeIn")
        result = full_pipe_in.function(full_pipe, image=decoded_image)[0]

        # Generate preview
        preview = common.Node("PreviewImage")
        preview_result = preview.function(decoded_image)

        return {
            "ui": preview_result.get("ui", {}),
            "result": (result, decoded_image,)
        }
