#!/usr/bin/env python3

import nodes
import comfy.samplers
import comfy.sample
from . import common


class BaseNode:
    """
    Custom base generation node that creates images from either empty latent
    or an optional input image. Exposes sampler, scheduler, steps, CFG,
    denoise, width, and height parameters.
    """

    @classmethod
    def INPUT_TYPES(cls):
        # Get standard schedulers and add custom option
        schedulers = list(comfy.samplers.KSampler.SCHEDULERS)
        schedulers.append("align_your_steps")

        return {
            "required": {
                "full_pipe": ("FULL_PIPE",),
                "sampler_name": (
                    comfy.samplers.KSampler.SAMPLERS,
                    {"default": "euler_ancestral_cfg_pp"}
                    ),
                "scheduler": (
                    schedulers,
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
                "resolution": (
                    list(nodes.NODE_CLASS_MAPPINGS[
                        "ResolutionSelector"].RESOLUTIONS.keys()),
                    {"default": "832x1216 (2:3)"}
                    ),
                "portrait": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "image": ("IMAGE",),
            }
        }

    RETURN_TYPES = ("FULL_PIPE", "IMAGE",)
    RETURN_NAMES = ("full_pipe", "image",)
    FUNCTION = "generate"
    CATEGORY = "mudknight/custom"

    def generate(
            self, full_pipe, sampler_name,
            scheduler, steps, cfg, denoise, resolution, portrait, image=None):

        # Unpack full_pipe - it's a dictionary, so access directly
        model = full_pipe.get("model")
        vae = full_pipe.get("vae")
        positive = full_pipe.get("positive")
        negative = full_pipe.get("negative")
        seed = full_pipe.get("seed")

        # Get resolution with ResolutionSelector node
        resolution_selector = nodes.NODE_CLASS_MAPPINGS["ResolutionSelector"]()
        width, height = getattr(
                resolution_selector, resolution_selector.FUNCTION)(
                        resolution, portrait)

        # Determine latent source
        if image is not None:
            # Scale image to target megapixels
            scale_node = nodes.NODE_CLASS_MAPPINGS[
                "ImageScaleToTotalPixels"]()
            scaled_image = scale_node.execute(
                image, "lanczos", 1)[0]

            # Encode to latent
            vae_encode = nodes.NODE_CLASS_MAPPINGS["VAEEncode"]()
            latent = vae_encode.encode(pixels=scaled_image, vae=vae)[0]
        else:
            # Create empty latent
            empty_latent = nodes.NODE_CLASS_MAPPINGS["EmptyLatentImage"]()
            latent = empty_latent.generate(width, height, 1)[0]
            # Override the denoise to 1 if no input image
            denoise = 1

        # Create sampler
        sampler_select = nodes.NODE_CLASS_MAPPINGS["KSamplerSelect"]()
        sampler = sampler_select.get_sampler(sampler_name)[0]

        # Create scheduler (use AlignYourSteps if selected,
        # otherwise BasicScheduler)
        if scheduler == "align_your_steps":
            # Detect model type based on latent channels
            model_type = "SDXL"  # Default
            try:
                # Check model config for latent format
                if hasattr(model.model, 'latent_format'):
                    latent_channels = model.model.latent_format.latent_channels
                    if latent_channels == 16:
                        model_type = "SDXL"
                    elif latent_channels == 4:
                        # Check if it's SVD by looking at model structure
                        if hasattr(model.model, 'is_temporal') or \
                                'svd' in str(type(model.model)).lower():
                            model_type = "SVD"
                        else:
                            model_type = "SD1"
            except:
                # Fallback to SDXL if detection fails
                model_type = "SDXL"

            ays_scheduler = nodes.NODE_CLASS_MAPPINGS[
                "AlignYourStepsScheduler"]()
            sigmas = ays_scheduler.get_sigmas(
                model_type,
                steps,
                denoise
            )[0]
        else:
            scheduler_node = nodes.NODE_CLASS_MAPPINGS["BasicScheduler"]()
            sigmas = scheduler_node.get_sigmas(
                model, scheduler, steps, denoise)[0]

        # Sample
        sampler_custom = nodes.NODE_CLASS_MAPPINGS["SamplerCustom"]()
        sampled_latent = sampler_custom.sample(
            model, True, seed, cfg, positive, negative,
            sampler, sigmas, latent
        )[0]

        # Decode
        vae_decode = nodes.NODE_CLASS_MAPPINGS["VAEDecode"]()
        decoded_image = vae_decode.decode(samples=sampled_latent, vae=vae)[0]

        # Pack back into full_pipe using FullPipeIn
        full_pipe_in = nodes.NODE_CLASS_MAPPINGS["FullPipeIn"]()
        result = getattr(full_pipe_in, full_pipe_in.FUNCTION)(
            full_pipe,
            image=decoded_image
        )[0]

        return (result, decoded_image,)


class UpscaleNode:
    """
    Custom upscale node that scales an image and processes it through sampling.
    Exposes sampler, scheduler, steps, CFG, denoise, and scale factor
    parameters.
    """

    @classmethod
    def INPUT_TYPES(cls):
        # Get standard schedulers and add custom option
        schedulers = list(comfy.samplers.KSampler.SCHEDULERS)
        schedulers.insert(0, "align_your_steps")

        return {
            "required": {
                "full_pipe": ("FULL_PIPE",),
                "sampler_name": (
                    comfy.samplers.KSampler.SAMPLERS,
                    {"default": "euler_ancestral_cfg_pp"}
                ),
                "scheduler": (
                    schedulers,
                    {"default": "align_your_steps"}
                ),
                "steps": ("INT", {
                    "default": 10,
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
                    "default": 0.3,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.01
                }),
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
            self, full_pipe, sampler_name, scheduler,
            steps, cfg, denoise, upscale_model, scale_by, image=None):

        # Unpack full_pipe - it's a dictionary, so access directly
        model = full_pipe.get("model")
        vae = full_pipe.get("vae")
        positive = full_pipe.get("positive")
        negative = full_pipe.get("negative")
        seed = full_pipe.get("seed")

        # Only use pipe image if image input is empty
        if image is None:
            image = full_pipe.get("image")

        # Scale image
        if upscale_model != "none":
            image_scale = common.Node("CombinedUpscaleNode")
            scaled_image = image_scale.function(
                    image, upscale_model, scale_by, 'lanczos')[0]
        else:
            image_scale = nodes.NODE_CLASS_MAPPINGS["ImageScaleBy"]()
            scaled_image = image_scale.upscale(image, "lanczos", scale_by)[0]

        # Encode to latent
        vae_encode = nodes.NODE_CLASS_MAPPINGS["VAEEncode"]()
        latent = vae_encode.encode(pixels=scaled_image, vae=vae)[0]

        # Create sampler
        sampler_select = nodes.NODE_CLASS_MAPPINGS["KSamplerSelect"]()
        sampler = sampler_select.get_sampler(sampler_name)[0]

        # Create scheduler (use AlignYourSteps if selected,
        # otherwise BasicScheduler)
        if scheduler == "align_your_steps":
            # Detect model type based on latent channels
            model_type = "SDXL"  # Default
            try:
                # Check model config for latent format
                if hasattr(model.model, 'latent_format'):
                    latent_channels = model.model.latent_format.latent_channels
                    if latent_channels == 16:
                        model_type = "SDXL"
                    elif latent_channels == 4:
                        # Check if it's SVD by looking at model structure
                        if hasattr(model.model, 'is_temporal') or \
                                'svd' in str(type(model.model)).lower():
                            model_type = "SVD"
                        else:
                            model_type = "SD1"
            except:
                # Fallback to SDXL if detection fails
                model_type = "SDXL"

            ays_scheduler = nodes.NODE_CLASS_MAPPINGS[
                    "AlignYourStepsScheduler"]()
            sigmas = ays_scheduler.get_sigmas(
                    model_type,
                    steps,
                    denoise
                    )[0]
        else:
            scheduler_node = nodes.NODE_CLASS_MAPPINGS["BasicScheduler"]()
            sigmas = scheduler_node.get_sigmas(
                    model, scheduler, steps, denoise)[0]

        # Sample
        sampler_custom = nodes.NODE_CLASS_MAPPINGS["SamplerCustom"]()
        sampled_latent = sampler_custom.sample(
                model, True, seed, cfg, positive, negative,
                sampler, sigmas, latent
                )[0]

        # Decode
        vae_decode = nodes.NODE_CLASS_MAPPINGS["VAEDecode"]()
        decoded_image = vae_decode.decode(samples=sampled_latent, vae=vae)[0]

        # Pack back into full_pipe using FullPipeIn
        full_pipe_in = nodes.NODE_CLASS_MAPPINGS["FullPipeIn"]()
        result = getattr(full_pipe_in, full_pipe_in.FUNCTION)(
                full_pipe,
                image=decoded_image
                )[0]

        return (result, decoded_image,)
