#!/usr/bin/env python3

"""
Custom ComfyUI node for face/object detection and detailing.
Combines bbox detection, cropping, upscaling, and inpainting into a single
node.
"""
import comfy.samplers
import folder_paths
import nodes
import torch
import os
from . import common

UPSCALE_DIR = os.path.join(folder_paths.models_dir, "upscale_models")


# Global lists for input types
SAMPLER_NAMES = comfy.samplers.KSampler.SAMPLERS

SCHEDULER_NAMES = list(comfy.samplers.KSampler.SCHEDULERS)
SCHEDULER_NAMES.append("align_your_steps")

UPSCALE_METHODS = [
    "lanczos", "bilinear", "bicubic", "area", "nearest-exact"
]

upscale_model_list = common.get_upscale_model_list()


def get_ultralytics_model_list():
    """Get list of available Ultralytics models."""
    try:
        from nodes import NODE_CLASS_MAPPINGS
        UltralyticsProvider = NODE_CLASS_MAPPINGS.get(
            "UltralyticsDetectorProvider")
        if UltralyticsProvider and hasattr(UltralyticsProvider, 'INPUT_TYPES'):
            input_types = UltralyticsProvider.INPUT_TYPES()
            if ('required' in input_types and
                    'model_name' in input_types['required']):
                return input_types['required']['model_name'][0]
    except Exception:
        pass
    return ["bbox/face_yolov8m.pt"]


class DetailerNode:
    """Single node that handles detection,
    crop, detail, and uncrop operations."""

    @classmethod
    def INPUT_TYPES(cls):
        model_list = get_ultralytics_model_list()
        fallback_list = ["none"] + model_list

        return {
            "required": {
                # Detection models at the top
                "bbox_model": (model_list,),
                "fallback_model": (fallback_list,),
                # Core inputs
                "image": ("IMAGE",),
                "model": ("MODEL",),
                "vae": ("VAE",),
                "positive": ("CONDITIONING",),
                "negative": ("CONDITIONING",),
                # KSampler parameters
                "seed": ("INT", {
                    "default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
                "cfg": ("FLOAT", {
                    "default": 1.5, "min": 0.0, "max": 100.0, "step": 0.1}),
                "sampler": (
                    SAMPLER_NAMES,
                    {"default": "euler_ancestral_cfg_pp"}
                    ),
                "scheduler": (
                    SCHEDULER_NAMES,
                    {"default": "align_your_steps"}
                    ),
                "denoise": ("FLOAT", {
                    "default": 0.4, "min": 0.0, "max": 1.0, "step": 0.01}),
                # Upscale method
                "upscale_method": (UPSCALE_METHODS,),
                # Upscale model
                "upscale_model": (upscale_model_list,),
                # Detection parameters
                "threshold": ("FLOAT", {
                    "default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),
                # Feather mask parameter (uniform)
                "feather": ("FLOAT", {"default": 0.25, "min": 0, "max": 1}),
                # Edge erosion to remove artifacts
                "edge_erosion": ("INT", {"default": 10, "min": 0, "max": 100}),
            }
        }

    RETURN_TYPES = ("IMAGE", "IMAGE")
    RETURN_NAMES = ("image", "cropped_image")
    FUNCTION = "process"
    CATEGORY = "detailer"
    DESCRIPTION = ("Crops, upscales, samples, downscales, "
                   "and uncrops the detected bbox")

    def process(self, bbox_model, fallback_model, image, model, vae,
                positive, negative, seed, steps, cfg, sampler, scheduler,
                denoise, upscale_method, upscale_model, threshold, feather,
                edge_erosion):
        """Main processing function."""

        # Create placeholder for early returns
        placeholder = torch.zeros((1, 1, 1, 3), dtype=image.dtype,
                                  device=image.device)

        # Create the primary bbox detector
        ultralytics_provider = common.Node("UltralyticsDetectorProvider")
        bbox_detector = ultralytics_provider.function(bbox_model)[0]

        # Create fallback detector if not "none"
        bbox_fallback = None
        if fallback_model != "none":
            fallback_provider = common.Node("UltralyticsDetectorProvider")
            bbox_fallback = fallback_provider(fallback_model)[0]

        # Step 1: Detect bounding boxes
        # (using default values for dilation, crop_factor, drop_size)
        bbox_detector_node = common.Node("BboxDetectorSEGS")
        segs_result = bbox_detector_node.function(
            bbox_detector, image, threshold, 10, 3.0, 10, "all"
        )
        segs = segs_result[0]

        # If no detections and fallback is available, try fallback
        if (not segs or len(segs[1]) == 0) and bbox_fallback is not None:
            segs_result = bbox_detector_node.function(
                bbox_fallback, image, threshold, 10, 3.0, 10, "all"
            )
            segs = segs_result[0]

        # If still no detections, return original image
        if not segs or len(segs[1]) == 0:
            return (image, placeholder)

        # We'll process each segment and collect the results
        processed_crops = []
        eroded_crops = []
        bboxes = []

        # Iterate through all detected segments
        for seg in segs[1]:
            # Create a temporary SEGS with just this segment
            temp_segs = (segs[0], [seg])

            # Step 2: Convert single SEG to mask
            mask_node = common.Node("SegsToCombinedMask")
            mask = mask_node.function(temp_segs)[0]

            # Step 4: Crop image from mask
            crop_node = common.Node("easy imageCropFromMask")
            crop_result = crop_node.function(image, mask, 1, 1, 1)
            crop_image = crop_result[0]
            bbox = crop_result[2]

            # Skip if cropped image is already 1MP
            # Add a toggle for this, disable it for now
            # if (crop_image.shape[1] * crop_image.shape[2] > 1_000_000):
            #     continue

            if upscale_model != "none":
                # Step 4.5 Upscale cropped image with model
                upscale_model_loader_node = common.Node("UpscaleModelLoader")
                upscale_model_obj = upscale_model_loader_node.function(
                        upscale_model)[0]

                upscale_node = common.Node("ImageUpscaleWithModel")
                upscaled_image = upscale_node.function(
                        upscale_model_obj, crop_image)[0]
            else:
                upscaled_image = crop_image

            # Step 5: Scale cropped image
            scale_node = common.Node("ImageScaleToTotalPixels")
            scaled_image = scale_node.function(
                    upscaled_image, upscale_method, 1)[0]

            # Step 6: Encode to latent
            vae_encode = nodes.VAEEncode()
            latent = vae_encode.encode(vae, scaled_image)[0]

            # Step 7: KSampler - Get sampler object
            sampler_select = common.Node("KSamplerSelect")
            sampler_obj = sampler_select.function(sampler)[0]

            # Create scheduler (use AlignYourSteps if selected,
            # otherwise BasicScheduler)
            if scheduler == "align_your_steps":
                # Detect model type based on latent channels
                model_type = "SDXL"  # Default
                try:
                    # Check model config for latent format
                    if hasattr(model.model, 'latent_format'):
                        latent_channels = (
                                model.model.
                                latent_format.latent_channels)
                        if latent_channels == 16:
                            model_type = "SDXL"
                        elif latent_channels == 4:
                            # Check if it's SVD by looking at model structure
                            if hasattr(model.model, 'is_temporal') \
                                    or 'svd' in str(type(model.model)).lower():
                                model_type = "SVD"
                            else:
                                model_type = "SD1"
                except:
                    # Fallback to SDXL if detection fails
                    model_type = "SDXL"

                ays_scheduler = common.Node("AlignYourStepsScheduler")
                sigmas = ays_scheduler.function(
                    model_type,
                    steps,
                    denoise
                )[0]
            else:
                scheduler_node = common.Node("BasicScheduler")
                sigmas = scheduler_node.function(
                    model, scheduler, steps, denoise)[0]

            # Sample
            sampler_custom = common.Node("SamplerCustom")
            sampled_latent = sampler_custom.function(
                model, True, seed, cfg, positive, negative,
                sampler_obj, sigmas, latent
            )[0]

            # Step 8: Decode latent
            vae_decode = nodes.VAEDecode()
            decoded_image = vae_decode.decode(vae, sampled_latent)[0]

            # Step 9: Get original crop size
            orig_height = crop_image.shape[1]
            orig_width = crop_image.shape[2]

            # Step 10: Scale back to original crop size
            image_scale = nodes.ImageScale()
            resized_image = image_scale.upscale(
                decoded_image, upscale_method,
                orig_width, orig_height, "disabled"
            )[0]

            # Step 10.5: Create eroded mask to remove edge artifacts
            bbox_inset_and_crop = common.Node("BBoxInsetAndCrop")
            eroded_image, eroded_bbox = bbox_inset_and_crop.function(
                    resized_image, bbox, edge_erosion)

            # Store the processed crop, bbox, and mask for later compositing
            processed_crops.append(resized_image)
            eroded_crops.append(eroded_image)
            bboxes.append(eroded_bbox)

        if not processed_crops:
            return (image, placeholder)

        # Pad all crops to the same size so they can be batched
        if len(processed_crops) > 0:
            # Find the maximum dimensions for both outputs
            max_height = max(crop.shape[1] for crop in processed_crops)
            max_width = max(crop.shape[2] for crop in processed_crops)

            # Pad eroded crops
            padded_eroded = []
            for crop in processed_crops:
                h, w = crop.shape[1], crop.shape[2]
                if h < max_height or w < max_width:
                    pad_h = max_height - h
                    pad_w = max_width - w
                    padded = torch.nn.functional.pad(
                        crop, (0, 0, 0, pad_w, 0, pad_h),
                        mode='constant', value=0
                    )
                    padded_eroded.append(padded)
                else:
                    padded_eroded.append(crop)

            eroded_samples_batch = torch.cat(padded_eroded, dim=0)
        else:
            eroded_samples_batch = image[:0]

        # Step 11: Uncrop all processed regions back onto the original image
        final_image = image
        uncrop_node = common.Node("easy imageUncropFromBBOX")

        for eroded_image, bbox in zip(
                eroded_crops, bboxes):
            # Parameters: original_image, crop_image, bbox, border_blending,
            # use_square_mask, optional_mask
            final_image = uncrop_node.function(
                final_image, eroded_image, bbox, feather, True, None
            )[0]

        return (final_image, eroded_samples_batch)


class MaskDetailerNode:
    """Single node that handles detection,
    crop, detail, and uncrop operations."""

    @classmethod
    def INPUT_TYPES(cls):

        return {
            "required": {
                # Core inputs
                "image": ("IMAGE",),
                "mask": ("MASK",),
                "model": ("MODEL",),
                "vae": ("VAE",),
                "positive": ("CONDITIONING",),
                "negative": ("CONDITIONING",),
                # KSampler parameters
                "seed": ("INT", {
                    "default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
                "cfg": ("FLOAT", {
                    "default": 1.5, "min": 0.0, "max": 100.0, "step": 0.1}),
                "sampler": (
                    SAMPLER_NAMES,
                    {"default": "euler_ancestral_cfg_pp"}
                    ),
                "scheduler": (
                    SCHEDULER_NAMES,
                    {"default": "align_your_steps"}
                    ),
                "denoise": ("FLOAT", {
                    "default": 0.4, "min": 0.0, "max": 1.0, "step": 0.01}),
                # Upscale method
                "upscale_method": (UPSCALE_METHODS,),
                # Upscale model
                "upscale_model": (upscale_model_list,),
                # Detection parameters
                "threshold": ("FLOAT", {
                    "default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),
                # Feather mask parameter (uniform)
                "feather": ("FLOAT", {"default": 0.25, "min": 0, "max": 1}),
                # Edge erosion to remove artifacts
                "edge_erosion": ("INT", {"default": 10, "min": 0, "max": 100}),
            }
        }

    RETURN_TYPES = ("IMAGE", "IMAGE")
    RETURN_NAMES = ("image", "cropped_image")
    FUNCTION = "process"
    CATEGORY = "detailer"
    DESCRIPTION = ("Crops, upscales, samples, downscales, "
                   "and uncrops the detected bbox")

    def process(self, image, mask, model, vae,
                positive, negative, seed, steps, cfg, sampler, scheduler,
                denoise, upscale_method, upscale_model, threshold, feather,
                edge_erosion):
        """Main processing function."""

        # Generate SEGS from mask
        mask_to_segs = common.Node("MaskToSEGS")
        segs = mask_to_segs.function(mask, False, 3.0, False, 10, False)[0]

        # If still no detections, return original image
        if not segs or len(segs[1]) == 0:
            return (image, None)

        # We'll process each segment and collect the results
        processed_crops = []
        eroded_crops = []
        bboxes = []

        # Iterate through all detected segments
        for seg in segs[1]:
            # Create a temporary SEGS with just this segment
            temp_segs = (segs[0], [seg])

            # Step 2: Convert single SEG to mask
            mask_node = common.Node("SegsToCombinedMask")
            mask = mask_node.function(temp_segs)[0]

            # Step 4: Crop image from mask
            crop_node = common.Node("easy imageCropFromMask")
            crop_result = crop_node.function(image, mask, 1, 1, 1)
            crop_image = crop_result[0]
            bbox = crop_result[2]

            if upscale_model != "none":
                # Step 4.5 Upscale cropped image with model
                upscale_model_loader_node = common.Node("UpscaleModelLoader")
                upscale_model_obj = upscale_model_loader_node.function(
                        upscale_model)[0]

                upscale_node = common.Node("ImageUpscaleWithModel")
                upscaled_image = upscale_node.function(
                        upscale_model_obj, crop_image)[0]
            else:
                upscaled_image = crop_image

            # Step 5: Scale cropped image
            scale_node = common.Node("ImageScaleToTotalPixels")
            scaled_image = scale_node.function(
                    upscaled_image, upscale_method, 1)[0]

            # Step 6: Encode to latent
            vae_encode = nodes.VAEEncode()
            latent = vae_encode.encode(vae, scaled_image)[0]

            # Step 7: KSampler - Get sampler object
            sampler_select = common.Node("KSamplerSelect")
            sampler_obj = sampler_select.function(sampler)[0]

            # Create scheduler (use AlignYourSteps if selected,
            # otherwise BasicScheduler)
            if scheduler == "align_your_steps":
                # Detect model type based on latent channels
                model_type = "SDXL"  # Default
                try:
                    # Check model config for latent format
                    if hasattr(model.model, 'latent_format'):
                        latent_channels = (
                                model.model.
                                latent_format.latent_channels)
                        if latent_channels == 16:
                            model_type = "SDXL"
                        elif latent_channels == 4:
                            # Check if it's SVD by looking at model structure
                            if hasattr(model.model, 'is_temporal') \
                                    or 'svd' in str(type(model.model)).lower():
                                model_type = "SVD"
                            else:
                                model_type = "SD1"
                except:
                    # Fallback to SDXL if detection fails
                    model_type = "SDXL"

                ays_scheduler = common.Node("AlignYourStepsScheduler")
                sigmas = ays_scheduler.function(
                    model_type,
                    steps,
                    denoise
                )[0]
            else:
                scheduler_node = common.Node("BasicScheduler")
                sigmas = scheduler_node.function(
                    model, scheduler, steps, denoise)[0]

            # Sample
            sampler_custom = common.Node("SamplerCustom")
            sampled_latent = sampler_custom.function(
                model, True, seed, cfg, positive, negative,
                sampler_obj, sigmas, latent
            )[0]

            # Step 8: Decode latent
            vae_decode = nodes.VAEDecode()
            decoded_image = vae_decode.decode(vae, sampled_latent)[0]

            # Step 9: Get original crop size
            orig_height = crop_image.shape[1]
            orig_width = crop_image.shape[2]

            # Step 10: Scale back to original crop size
            image_scale = nodes.ImageScale()
            resized_image = image_scale.upscale(
                decoded_image, upscale_method,
                orig_width, orig_height, "disabled"
            )[0]

            # Step 10.5: Create eroded mask to remove edge artifacts
            bbox_inset_and_crop = common.Node("BBoxInsetAndCrop")
            eroded_image, eroded_bbox = bbox_inset_and_crop.function(
                    resized_image, bbox, edge_erosion)

            # Store the processed crop, bbox, and mask for later compositing
            processed_crops.append(resized_image)
            eroded_crops.append(eroded_image)
            bboxes.append(eroded_bbox)

        # Pad all crops to the same size so they can be batched
        if len(processed_crops) > 0:
            # Find the maximum dimensions for both outputs
            max_height = max(crop.shape[1] for crop in processed_crops)
            max_width = max(crop.shape[2] for crop in processed_crops)

            # Pad eroded crops
            padded_eroded = []
            for crop in processed_crops:
                h, w = crop.shape[1], crop.shape[2]
                if h < max_height or w < max_width:
                    pad_h = max_height - h
                    pad_w = max_width - w
                    padded = torch.nn.functional.pad(
                        crop, (0, 0, 0, pad_w, 0, pad_h),
                        mode='constant', value=0
                    )
                    padded_eroded.append(padded)
                else:
                    padded_eroded.append(crop)

            eroded_samples_batch = torch.cat(padded_eroded, dim=0)
        else:
            eroded_samples_batch = None

        # Step 11: Uncrop all processed regions back onto the original image
        final_image = image
        uncrop_node = common.Node("easy imageUncropFromBBOX")

        for eroded_image, bbox in zip(
                eroded_crops, bboxes):
            # Parameters: original_image, crop_image, bbox, border_blending,
            # use_square_mask, optional_mask
            final_image = uncrop_node.function(
                final_image, eroded_image, bbox, feather, True, None
            )[0]

        return (final_image, eroded_samples_batch)


class DetailerPipeNode(DetailerNode):
    """Detailer node that works with full_pipe input/output."""

    @classmethod
    def INPUT_TYPES(cls):
        model_list = get_ultralytics_model_list()
        fallback_list = ["none"] + model_list

        return {
            "required": {
                # Detection models at the top
                "bbox_model": (model_list,),
                "fallback_model": (fallback_list,),
                # Full pipe input
                "full_pipe": ("FULL_PIPE",),
                # KSampler parameters
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
                "cfg": ("FLOAT", {
                    "default": 1.5, "min": 0.0, "max": 100.0, "step": 0.1}),
                "sampler": (
                    SAMPLER_NAMES,
                    {"default": "euler_ancestral_cfg_pp"}
                    ),
                "scheduler": (
                    SCHEDULER_NAMES,
                    {"default": "align_your_steps"}
                    ),
                "denoise": ("FLOAT", {
                    "default": 0.4, "min": 0.0, "max": 1.0, "step": 0.01}),
                # Upscale method
                "upscale_method": (UPSCALE_METHODS,),
                # Upscale model
                "upscale_model": (upscale_model_list,),
                # Detection parameters
                "threshold": ("FLOAT", {
                    "default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),
                # Feather mask parameter (uniform)
                "feather": ("FLOAT", {"default": 0.25, "min": 0, "max": 1}),
                # Edge erosion to remove artifacts
                "edge_erosion": ("INT", {"default": 10, "min": 0, "max": 100}),
            }
        }

    RETURN_TYPES = ("FULL_PIPE", "IMAGE", "IMAGE")
    RETURN_NAMES = ("full_pipe", "image", "cropped_image")
    FUNCTION = "process_pipe"
    CATEGORY = "detailer"
    DESCRIPTION = ("Crops, upscales, samples, downscales, "
                   "and uncrops the detected bbox")

    def process_pipe(self, bbox_model, fallback_model, full_pipe, steps, cfg,
                     sampler, scheduler, denoise, upscale_method,
                     upscale_model, threshold, feather, edge_erosion):
        """Process using full_pipe input and return updated pipe."""
        # Extract values from pipe
        image = full_pipe.get("image")
        model_checkpoint = full_pipe.get("model")
        vae = full_pipe.get("vae")
        positive = full_pipe.get("positive")
        negative = full_pipe.get("negative")
        seed = full_pipe.get("seed", 0)

        # Validate required fields
        if image is None:
            raise ValueError("full_pipe must contain 'image'")
        if model_checkpoint is None:
            raise ValueError("full_pipe must contain 'model'")
        if vae is None:
            raise ValueError("full_pipe must contain 'vae'")
        if positive is None:
            raise ValueError("full_pipe must contain 'positive'")
        if negative is None:
            raise ValueError("full_pipe must contain 'negative'")

        # Call parent class process method
        final_image, cropped_image = self.process(
            bbox_model, fallback_model, image, model_checkpoint, vae, positive,
            negative, seed, steps, cfg, sampler, scheduler, denoise,
            upscale_method, upscale_model, threshold, feather, edge_erosion
        )

        # Create updated pipe with new image
        new_pipe = full_pipe.copy()
        new_pipe["image"] = final_image

        return (new_pipe, final_image, cropped_image)


class MaskDetailerPipeNode(MaskDetailerNode):
    """Detailer node that works with full_pipe input/output."""

    @classmethod
    def INPUT_TYPES(cls):

        return {
            "required": {
                # Full pipe input
                "full_pipe": ("FULL_PIPE",),
                "mask": ("MASK",),
                # KSampler parameters
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
                "cfg": ("FLOAT", {
                    "default": 1.5, "min": 0.0, "max": 100.0, "step": 0.1}),
                "sampler": (
                    SAMPLER_NAMES,
                    {"default": "euler_ancestral_cfg_pp"}
                    ),
                "scheduler": (
                    SCHEDULER_NAMES,
                    {"default": "align_your_steps"}
                    ),
                "denoise": ("FLOAT", {
                    "default": 0.4, "min": 0.0, "max": 1.0, "step": 0.01}),
                # Upscale method
                "upscale_method": (UPSCALE_METHODS,),
                # Upscale model
                "upscale_model": (upscale_model_list,),
                # Detection parameters
                "threshold": ("FLOAT", {
                    "default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),
                # Feather mask parameter (uniform)
                "feather": ("FLOAT", {"default": 0.25, "min": 0, "max": 1}),
                # Edge erosion to remove artifacts
                "edge_erosion": ("INT", {"default": 10, "min": 0, "max": 100}),
            },
            "optional": {
                "image": ("IMAGE",),
            }
        }

    RETURN_TYPES = ("FULL_PIPE", "IMAGE", "IMAGE")
    RETURN_NAMES = ("full_pipe", "image", "cropped_image")
    FUNCTION = "process_pipe"
    CATEGORY = "detailer"
    DESCRIPTION = ("Crops, upscales, samples, downscales, "
                   "and uncrops the detected bbox")

    def process_pipe(self, full_pipe, mask, steps, cfg, sampler,
                     scheduler, denoise, upscale_method, upscale_model,
                     threshold, feather, edge_erosion, image=None):
        """Process using full_pipe input and return updated pipe."""
        # Extract values from pipe
        if image is None:
            image = full_pipe.get("image")
        model = full_pipe.get("model")
        vae = full_pipe.get("vae")
        positive = full_pipe.get("positive")
        negative = full_pipe.get("negative")
        seed = full_pipe.get("seed", 0)

        # Validate required fields
        if image is None:
            raise ValueError("full_pipe must contain 'image'")
        if model is None:
            raise ValueError("full_pipe must contain 'model'")
        if vae is None:
            raise ValueError("full_pipe must contain 'vae'")
        if positive is None:
            raise ValueError("full_pipe must contain 'positive'")
        if negative is None:
            raise ValueError("full_pipe must contain 'negative'")

        # Call parent class process method
        final_image, cropped_image = self.process(
            image, mask, model, vae, positive,
            negative, seed, steps, cfg, sampler, scheduler, denoise,
            upscale_method, upscale_model, threshold, feather, edge_erosion
        )

        # Create updated pipe with new image
        new_pipe = full_pipe.copy()
        new_pipe["image"] = final_image

        return (new_pipe, final_image, cropped_image)


NODE_CLASS_MAPPINGS = {
    "DetailerNode": DetailerNode,
    "DetailerPipeNode": DetailerPipeNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DetailerNode": "Detailer (All-in-One)",
    "DetailerPipeNode": "Detailer (Pipe)"
}
