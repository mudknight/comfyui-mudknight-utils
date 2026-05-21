#!/usr/bin/env python3

"""
Custom ComfyUI node for face/object detection and detailing.
Combines bbox detection, cropping, upscaling, and inpainting into a single
node.
"""
import comfy.samplers
import nodes
import torch
from . import common

UPSCALE_METHODS = [
    "lanczos", "bilinear", "bicubic", "area", "nearest-exact"
]

upscale_model_list = common.get_upscale_model_list()

CORE_INPUTS = {
    # Core inputs
    "image": ("IMAGE",),
    "model": ("MODEL",),
    "vae": ("VAE",),
    "positive": ("CONDITIONING",),
    "negative": ("CONDITIONING",),
}

# The seed is broken out here for convenience, since the pipe nodes don't
# have a seed parameter.
SEED_INPUT = {
    "seed": ("INT", {
        "default": 0, "min": 0, "max": 0xffffffffffffffff}),
}

KSAMPLER_INPUTS = {
    # KSampler parameters
    "steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
    "cfg": ("FLOAT", {
        "default": 1.5, "min": 0.0, "max": 100.0, "step": 0.1}),
    "sampler": (
        comfy.samplers.KSampler.SAMPLERS,
        {"default": "euler_ancestral_cfg_pp"}
        ),
    "scheduler": (
        list(comfy.samplers.KSampler.SCHEDULERS) + ["align_your_steps"],
        {"default": "align_your_steps"}
        ),
    "denoise": ("FLOAT", {
        "default": 0.4, "min": 0.0, "max": 1.0, "step": 0.01}),
}

UPSCALER_INPUTS = {
    # Upscale method
    "upscale_method": (UPSCALE_METHODS,),
    # Upscale model
    "upscale_model": (upscale_model_list,),
}

DETAILER_INPUTS = {
    # Feather mask parameter (uniform)
    "feather": ("FLOAT", {
        "default": 0.2, "min": 0, "max": 1,
        "tooltip": "Percentage of image to feather when uncropping"}),
    "context_padding": ("FLOAT", {
        "default": 0.1, "min": 0, "max": 1,
        "tooltip": "Percentage of image to use for context from edge"}),
}


def crop_image_by_mask(image, mask, padding=0, upscale_factor=1):
    """
    Crops an image based on the bounding box of a provided mask.
    """
    # mask shape is typically [B, H, W]
    mask_indices = torch.nonzero(mask)
    if mask_indices.size(0) == 0:
        return image, mask, (0, 0, image.shape[2], image.shape[1])

    y_min, x_min = torch.min(mask_indices[:, 1:], dim=0)[0]
    y_max, x_max = torch.max(mask_indices[:, 1:], dim=0)[0]

    # Apply padding
    x_min = max(0, x_min.item() - padding)
    y_min = max(0, y_min.item() - padding)
    x_max = min(image.shape[2], x_max.item() + padding)
    y_max = min(image.shape[1], y_max.item() + padding)

    width = x_max - x_min
    height = y_max - y_min

    crop = image[:, y_min:y_max, x_min:x_max, :]
    bbox = (x_min, y_min, width, height)

    return crop, mask[:, y_min:y_max, x_min:x_max], bbox


def uncrop_image_by_bbox(
    full_img, crop_img, bbox, feather=0.0, use_square=True
):
    """
    Composites a cropped image back into the original full image.
    """
    x, y, w, h = bbox

    # Validate bbox dimensions
    if w <= 0 or h <= 0:
        print(f"Warning: Invalid bbox dimensions ({w}x{h}), skipping uncrop")
        return full_img

    target = full_img.clone()

    # Extract the actual region from the full image to get true dimensions
    original_region = target[:, y:y+h, x:x+w, :]
    actual_h, actual_w = original_region.shape[1], original_region.shape[2]

    # Ensure crop matches the ACTUAL region size (not bbox size)
    if crop_img.shape[1] != actual_h or crop_img.shape[2] != actual_w:
        import nodes
        scaler = nodes.ImageScale()
        crop_img = scaler.upscale(
            crop_img, "bicubic", actual_w, actual_h, "disabled"
        )[0]

    # Create feather mask with actual dimensions
    mask = torch.ones((1, actual_h, actual_w, 1), device=full_img.device)
    if feather > 0:
        feather_pix = int(min(actual_w, actual_h) * (feather / 2))
        if feather_pix > 0:
            for i in range(feather_pix):
                v = i / feather_pix
                mask[:, i, :, :] *= v
                mask[:, -(i + 1), :, :] *= v
                mask[:, :, i, :] *= v
                mask[:, :, -(i + 1), :] *= v

    # Composite - now all dimensions match
    blended = crop_img * mask + original_region * (1 - mask)
    target[:, y:y+actual_h, x:x+actual_w, :] = blended

    return target


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


def resize_to_megapixel(width, height):
    # Calculate aspect ratio
    aspect_ratio = width / height

    # Calculate new dimensions maintaining aspect ratio at 1MP
    target_pixels = 1_048_576
    new_height = (target_pixels / aspect_ratio) ** 0.5
    new_width = aspect_ratio * new_height

    # Round to nearest multiple of 8
    new_width = round(new_width / 8) * 8
    new_height = round(new_height / 8) * 8

    return int(new_width), int(new_height)


def process_segs(
        image, model, vae,
        positive, negative, seed, steps, cfg, sampler, scheduler,
        denoise, upscale_method, upscale_model, feather,
        context_padding, segs):
    """Process segments with optional context padding via inset mask."""
    processed_crops = []
    crops = []
    bboxes = []

    # Iterate through all detected segments
    for seg in segs[1]:
        # Create a temporary SEGS with just this segment
        temp_segs = (segs[0], [seg])

        # Step 2: Convert single SEG to mask
        mask_node = common.Node("SegsToCombinedMask")
        mask = mask_node.function(temp_segs)[0]

        # Step 3: Crop image from mask
        crop_image, _, bbox = crop_image_by_mask(image, mask, padding=10)

        if upscale_model != "none":
            # Step 4: Upscale cropped image with model
            upscale_model_loader_node = common.Node("UpscaleModelLoader")
            upscale_model_obj = upscale_model_loader_node.function(
                    upscale_model)[0]

            upscale_node = common.Node("ImageUpscaleWithModel")
            upscaled_image = upscale_node.function(
                    upscale_model_obj, crop_image)[0]
        else:
            upscaled_image = crop_image

        # Step 5: Scale cropped image
        # Use regular ImageScale instead of ImageScaleToTotalPixels to set
        # dimensions to multiples of 8, otherwise the image won't stitch
        # back in correctly.
        nw, nh = resize_to_megapixel(crop_image.shape[2], crop_image.shape[1])
        scale_node = common.Node("ImageScale")
        scaled_image = scale_node.function(
                upscaled_image, upscale_method, nw, nh, 0)[0]

        # Step 6: Encode to latent
        vae_encode = nodes.VAEEncode()
        latent = vae_encode.encode(vae, scaled_image)[0]

        # Step 6.5: Apply inset latent noise mask if context padding > 0
        context_padding_pixels = (
                int(min(nw, nh) * (context_padding / 2)) // 8) * 8
        if context_padding_pixels > 0:
            # Get dimensions of scaled image
            img_height = scaled_image.shape[1]
            img_width = scaled_image.shape[2]

            # Calculate inset amount (can't exceed half the dimension)
            inset_x = min(context_padding_pixels, img_width // 2)
            inset_y = min(context_padding_pixels, img_height // 2)

            # Create inset mask - only the center region gets sampled
            inset_mask = torch.zeros(
                (1, img_height, img_width),
                dtype=torch.float32,
                device=image.device
            )
            inset_mask[
                :,
                inset_y:img_height - inset_y,
                inset_x:img_width - inset_x
            ] = 1.0

            # Set the noise mask on the latent
            set_mask_node = common.Node("SetLatentNoiseMask")
            latent = set_mask_node.function(latent, inset_mask)[0]

        # Step 7: KSampler - Get sampler object
        sampled_latent = common.sample_latent(
            model, positive, negative, seed, sampler,
            scheduler, steps, cfg, denoise, latent)

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

        # Store the processed crop, bbox, and mask
        processed_crops.append(resized_image)
        bboxes.append(bbox)
        crops.append(decoded_image)

    return (processed_crops, crops, bboxes)


def pad_crops(image, crops):
    # Pad crops for batching
    if len(crops) > 0:
        max_height = max(crop.shape[1] for crop in crops)
        max_width = max(crop.shape[2] for crop in crops)

        padded_crops = []
        for crop in crops:
            # Ensure we are working with RGBA [B, H, W, 4]
            if crop.shape[-1] == 3:
                alpha = torch.ones(
                    (crop.shape[0], crop.shape[1], crop.shape[2], 1),
                    dtype=crop.dtype,
                    device=crop.device
                )
                crop = torch.cat([crop, alpha], dim=3)

            h, w = crop.shape[1], crop.shape[2]
            if h < max_height or w < max_width:
                pad_h = max_height - h
                pad_w = max_width - w

                # Center the padding
                pad_top = pad_h // 2
                pad_bottom = pad_h - pad_top
                pad_left = pad_w // 2
                pad_right = pad_w - pad_left

                # Pad with transparent pixels (RGBA = [0, 0, 0, 0])
                padded = torch.nn.functional.pad(
                    crop,
                    (0, 0, pad_left, pad_right, pad_top, pad_bottom),
                    mode='constant',
                    value=0
                )
                padded_crops.append(padded)
            else:
                padded_crops.append(crop)

        cropped_batch = torch.cat(padded_crops, dim=0)
    else:
        # Consistent 4-channel placeholder prevents (1, 1, 5) error
        cropped_batch = torch.zeros(
                (1, 64, 64, 4), dtype=image.dtype, device=image.device
                )

    return cropped_batch


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
                # Detection parameters
                "threshold": ("FLOAT", {
                    "default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "Detection threshold"}),
                # Core inputs
                **CORE_INPUTS,
                # KSampler parameters
                **SEED_INPUT,
                **KSAMPLER_INPUTS,
                # Upscale parameters
                **UPSCALER_INPUTS,
                # Detection parameters
                **DETAILER_INPUTS,
            },
        }

    RETURN_TYPES = ("IMAGE", "IMAGE")
    RETURN_NAMES = ("image", "cropped_image")
    FUNCTION = "process"
    CATEGORY = "detailer"
    DESCRIPTION = ("Crops, upscales, samples, downscales, "
                   "and uncrops the detected bbox")

    def process(self, bbox_model, fallback_model, threshold, image, model, vae,
                positive, negative, seed, steps, cfg, sampler, scheduler,
                denoise, upscale_method, upscale_model, feather,
                context_padding):
        """Main processing function."""

        # Handle batched images
        batch_size = image.shape[0]

        if batch_size == 1:
            # Single image - process normally
            return self._process_single_image(
                bbox_model, fallback_model, image, model, vae,
                positive, negative, seed, steps, cfg, sampler, scheduler,
                denoise, upscale_method, upscale_model, threshold, feather,
                context_padding, extra_pnginfo
            )
        else:
            # Batch processing - process each image separately
            all_final_images = []
            all_cropped_images = []

            for i in range(batch_size):
                # Extract single image from batch
                single_image = image[i:i+1]

                # Process it
                result = self._process_single_image(
                bbox_model, fallback_model, single_image, model, vae,
                positive, negative, seed + i, steps, cfg, sampler,
                scheduler, denoise, upscale_method, upscale_model,
                threshold, feather, context_padding
                )

                # Handle both dict and tuple returns
                if isinstance(result, dict):
                    final_img, cropped_img = result["result"]
                else:
                    final_img, cropped_img = result

                all_final_images.append(final_img)
                all_cropped_images.append(cropped_img)

            # Combine batches
            final_batch = torch.cat(all_final_images, dim=0)

            # Pad cropped images to same size for batching
            padded_crops_batch = pad_crops(image, all_cropped_images)

            return common.return_preview(
                (final_batch, padded_crops_batch),
                padded_crops_batch
            )

    def _process_single_image(
            self, bbox_model, fallback_model, image, model, vae,
            positive, negative, seed, steps, cfg, sampler, scheduler,
            denoise, upscale_method, upscale_model, threshold, feather,
            context_padding):
        """Process a single image (batch size must be 1)."""

        # Create placeholder for early returns
        placeholder = torch.zeros(
            (1, 1, 1, 3), dtype=image.dtype, device=image.device
        )

        # Create the primary bbox detector
        ultralytics_provider = common.Node("UltralyticsDetectorProvider")
        bbox_detector = ultralytics_provider.function(bbox_model)[0]

        # Create fallback detector if not "none"
        bbox_fallback = None
        if fallback_model != "none":
            fallback_provider = common.Node("UltralyticsDetectorProvider")
            bbox_fallback = fallback_provider(fallback_model)[0]

        # Detect bounding boxes
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

        # Process segments
        processed_crops, crops, bboxes = process_segs(
            image, model, vae,
            positive, negative, seed, steps, cfg, sampler, scheduler,
            denoise, upscale_method, upscale_model, feather,
            context_padding, segs
        )

        if not processed_crops:
            return (image, placeholder)

        padded_crops_batch = pad_crops(image, crops)

        final_image = image
        for processed_crop, bbox in zip(processed_crops, bboxes):
            final_image = uncrop_image_by_bbox(
                final_image, processed_crop, bbox, feather=feather
            )

        return common.return_preview(
            (final_image, padded_crops_batch,),
            padded_crops_batch
        )


class MaskDetailerNode:
    """Single node that handles detection,
    crop, detail, and uncrop operations."""

    @classmethod
    def INPUT_TYPES(cls):

        return {
            "required": {
                # Core inputs
                **CORE_INPUTS,
                "mask": ("MASK",),
                # KSampler parameters
                **SEED_INPUT,
                **KSAMPLER_INPUTS,
                # Upscale method
                **UPSCALER_INPUTS,
                # Detection parameters
                **DETAILER_INPUTS,
            },
            "hidden": {"extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = ("IMAGE", "IMAGE")
    RETURN_NAMES = ("image", "cropped_image")
    FUNCTION = "process"
    CATEGORY = "detailer"
    DESCRIPTION = ("Crops, upscales, samples, downscales, "
                   "and uncrops the detected bbox")

    def process(self, image, mask, model, vae, positive, negative, seed, steps,
                cfg, sampler, scheduler, denoise, upscale_method,
                upscale_model, feather, context_padding, extra_pnginfo=None):
        """Main processing function."""

        # Generate SEGS from mask
        mask_to_segs = common.Node("MaskToSEGS")
        segs = mask_to_segs.function(mask, False, 3.0, False, 10, False)[0]

        # If still no detections, return original image
        if not segs or len(segs[1]) == 0:
            return (image, None)

        processed_crops, crops, bboxes = process_segs(
            image, model, vae, positive, negative, seed, steps, cfg, sampler,
            scheduler, denoise, upscale_method, upscale_model, feather,
            context_padding, segs)

        # Pad all crops to the same size so they can be batched
        padded_crops_batch = pad_crops(image, crops)

        # Step 11: Uncrop all processed regions back onto the original image
        final_image = image

        for processed_crop, bbox in zip(
                processed_crops, bboxes):
            # Parameters: original_image, crop_image, bbox, border_blending,
            # use_square_mask, optional_mask
            final_image = uncrop_image_by_bbox(
                final_image, processed_crop, bbox, feather=feather
            )

        return common.return_preview(
            (final_image, padded_crops_batch,),
            padded_crops_batch
        )


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
                # Detection parameters
                "threshold": ("FLOAT", {
                    "default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "Detection threshold"}),
                # Full pipe input
                "full_pipe": ("FULL_PIPE",),
                # KSampler parameters
                **KSAMPLER_INPUTS,
                # Upscale method
                **UPSCALER_INPUTS,
                # Detection parameters
                **DETAILER_INPUTS,
            },
        }

    RETURN_TYPES = ("FULL_PIPE", "IMAGE", "IMAGE")
    RETURN_NAMES = ("full_pipe", "image", "cropped_image")
    FUNCTION = "process_pipe"
    CATEGORY = "detailer"
    DESCRIPTION = ("Crops, upscales, samples, downscales, "
                   "and uncrops the detected bbox")

    def process_pipe(self, bbox_model, fallback_model, threshold, full_pipe,
                     steps, cfg, sampler, scheduler, denoise, upscale_method,
                     upscale_model, feather, context_padding):
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
        result = self.process(
            bbox_model, fallback_model, threshold, image, model_checkpoint,
            vae, positive, negative, seed, steps, cfg, sampler, scheduler,
            denoise, upscale_method, upscale_model, feather, context_padding
        )

        # Handle both dict (with preview) and tuple (no preview) returns
        if isinstance(result, dict):
            final_image, cropped_image = result["result"]
        else:
            final_image, cropped_image = result

        # Create updated pipe with new image
        new_pipe = full_pipe.copy()
        new_pipe["image"] = final_image

        return common.return_preview(
            (new_pipe, final_image, cropped_image),
            cropped_image
        )


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
                **KSAMPLER_INPUTS,
                # Upscale method
                **UPSCALER_INPUTS,
                # Detection parameters
                **DETAILER_INPUTS,
            },
            "optional": {
                "image": ("IMAGE",),
            },
        }

    RETURN_TYPES = ("FULL_PIPE", "IMAGE", "IMAGE")
    RETURN_NAMES = ("full_pipe", "image", "cropped_image")
    FUNCTION = "process_pipe"
    CATEGORY = "detailer"
    DESCRIPTION = ("Crops, upscales, samples, downscales, "
                   "and uncrops the detected bbox")

    def process_pipe(self, full_pipe, mask, steps, cfg, sampler,
                     scheduler, denoise, upscale_method, upscale_model,
                     feather, context_padding,
                     image=None):
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
        result = self.process(
            image, mask, model, vae,
            positive, negative, seed, steps, cfg, sampler, scheduler,
            denoise, upscale_method, upscale_model, feather,
            context_padding,
        )

        # Handle both dict (with preview) and tuple (no preview) returns
        if isinstance(result, dict):
            final_image, cropped_image = result["result"]
        else:
            final_image, cropped_image = result

        # Create updated pipe with new image
        new_pipe = full_pipe.copy()
        new_pipe["image"] = final_image

        return common.return_preview(
            (new_pipe, final_image, cropped_image),
            cropped_image
        )


NODE_CLASS_MAPPINGS = {
    "DetailerNode": DetailerNode,
    "DetailerPipeNode": DetailerPipeNode,
    "MaskDetailerNode": MaskDetailerNode,
    "MaskDetailerPipeNode": MaskDetailerPipeNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DetailerNode": "FastDetailer",
    "DetailerPipeNode": "FastDetailer (full-pipe)",
    "MaskDetailerNode": "FastMaskDetailer",
    "MaskDetailerPipeNode": "FastMaskDetailer (full-pipe)",
}
