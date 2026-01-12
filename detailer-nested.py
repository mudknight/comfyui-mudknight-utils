#!/usr/bin/env python3

"""
Nested detailer for ComfyUI that processes faces and eyes hierarchically.
"""
import comfy.samplers
import torch
from . import common
from .detailer import (
    get_ultralytics_model_list,
    UPSCALE_METHODS,
    SEED_INPUT,
    DETAILER_INPUTS,
    uncrop_image_by_bbox,
)

upscale_model_list = common.get_upscale_model_list()


def calculate_upscale_dimensions(width, height, max_megapixels=1.5):
    """
    Calculate 2x upscaled dimensions that are divisible by 8 and under limit.

    Args:
        width: Original width
        height: Original height
        max_megapixels: Maximum megapixels (e.g., 1.5 for 1.5MP)

    Returns:
        Tuple of (new_width, new_height)
    """
    max_pixels = int(max_megapixels * 1_048_576)

    # Start with 2x upscale
    new_width = width * 2
    new_height = height * 2

    # Make divisible by 8
    new_width = (new_width // 8) * 8
    new_height = (new_height // 8) * 8

    # Scale down if over pixel limit
    total_pixels = new_width * new_height
    if total_pixels > max_pixels:
        scale = (max_pixels / total_pixels) ** 0.5
        new_width = int((new_width * scale) // 8) * 8
        new_height = int((new_height * scale) // 8) * 8

    # Ensure minimum size
    new_width = max(64, new_width)
    new_height = max(64, new_height)

    return new_width, new_height


def bbox_overlap_percentage(bbox1, bbox2):
    """
    Calculate what percentage of bbox2 overlaps with bbox1.

    Args:
        bbox1: Tuple of (x, y, width, height) - parent bbox
        bbox2: Tuple of (x, y, width, height) - child bbox

    Returns:
        Float between 0 and 1 representing overlap percentage
    """
    x1, y1, w1, h1 = bbox1
    x2, y2, w2, h2 = bbox2

    # Calculate intersection
    x_left = max(x1, x2)
    y_top = max(y1, y2)
    x_right = min(x1 + w1, x2 + w2)
    y_bottom = min(y1 + h1, y2 + h2)

    if x_right < x_left or y_bottom < y_top:
        return 0.0

    intersection_area = (x_right - x_left) * (y_bottom - y_top)
    bbox2_area = w2 * h2

    return intersection_area / bbox2_area if bbox2_area > 0 else 0.0


def detect_all_bboxes(image, detector, threshold):
    """
    Detect all bounding boxes with a detector.

    Returns:
        List of tuples: [(bbox, confidence), ...]
        where bbox is (x, y, width, height)
    """
    bbox_detector_node = common.Node("BboxDetectorSEGS")
    segs_result = bbox_detector_node.function(
        detector, image, threshold, 10, 3.0, 10, "all"
    )
    segs = segs_result[0]

    if not segs or len(segs[1]) == 0:
        return []

    results = []
    for seg in segs[1]:
        # Create temp SEGS with just this segment
        temp_segs = (segs[0], [seg])

        # Convert to mask
        mask_node = common.Node("SegsToCombinedMask")
        mask = mask_node.function(temp_segs)[0]

        # Get bbox from mask
        mask_indices = torch.nonzero(mask)
        if mask_indices.size(0) == 0:
            continue

        y_min, x_min = torch.min(mask_indices[:, 1:], dim=0)[0]
        y_max, x_max = torch.max(mask_indices[:, 1:], dim=0)[0]

        x = x_min.item()
        y = y_min.item()
        width = (x_max - x_min).item()
        height = (y_max - y_min).item()

        confidence = seg.confidence

        print(
            f"Detected bbox: x={x}, y={y}, w={width}, h={height}, conf={confidence}")

        results.append(((x, y, width, height), confidence))

    return results


def crop_image_by_bbox(image, bbox):
    """
    Crop image using bbox coordinates.

    Args:
        image: Image tensor (B, H, W, C)
        bbox: Tuple of (x, y, width, height)

    Returns:
        Cropped image tensor
    """
    x, y, width, height = bbox
    return image[:, y:y+height, x:x+width, :]


def upscale_and_sample(
    crop_image, model, vae, positive, negative, seed, steps, cfg,
    sampler, scheduler, denoise, context_padding, max_megapixels
):
    """
    Upscale image 2x with lanczos and sample.

    Args:
        crop_image: Cropped image tensor
        model: ComfyUI model
        vae: VAE
        positive: Positive conditioning
        negative: Negative conditioning
        seed: Random seed
        steps: Sampling steps
        cfg: CFG value
        sampler: Sampler name
        scheduler: Scheduler name
        denoise: Denoise strength
        context_padding: Context padding ratio
        max_megapixels: Maximum megapixels for upscale

    Returns:
        Full resolution sampled image
    """
    orig_h = crop_image.shape[1]
    orig_w = crop_image.shape[2]

    # Calculate upscale dimensions
    new_w, new_h = calculate_upscale_dimensions(
        orig_w, orig_h, max_megapixels
    )

    # Upscale with lanczos
    scale_node = common.Node("ImageScale")
    upscaled = scale_node.function(
        crop_image, "lanczos", new_w, new_h, "disabled"
    )[0]

    # Encode to latent
    vae_encode = common.Node("VAEEncode")
    latent = vae_encode.function(vae, upscaled)[0]

    # Apply context padding mask if needed
    context_padding_pixels = int(
        min(new_w, new_h) * (context_padding / 2)
    )
    context_padding_pixels = (context_padding_pixels // 8) * 8

    if context_padding_pixels > 0:
        inset_x = min(context_padding_pixels, new_w // 2)
        inset_y = min(context_padding_pixels, new_h // 2)

        inset_mask = torch.zeros(
            (1, new_h, new_w),
            dtype=torch.float32,
            device=crop_image.device
        )
        inset_mask[
            :,
            inset_y:new_h - inset_y,
            inset_x:new_w - inset_x
        ] = 1.0

        set_mask_node = common.Node("SetLatentNoiseMask")
        latent = set_mask_node.function(latent, inset_mask)[0]

    # Sample
    sampled_latent = common.sample_latent(
        model, positive, negative, seed, sampler,
        scheduler, steps, cfg, denoise, latent
    )

    # Decode
    vae_decode = common.Node("VAEDecode")
    decoded = vae_decode.function(vae, sampled_latent)[0]

    return decoded


def pad_crops_transparent(crops, device, dtype):
    """Pad crops to same size with transparent pixels for batching."""
    if not crops:
        return torch.zeros((1, 64, 64, 4), dtype=dtype, device=device)

    max_h = max(c.shape[1] for c in crops)
    max_w = max(c.shape[2] for c in crops)

    padded = []
    for crop in crops:
        # Ensure RGBA format
        if crop.shape[-1] == 3:
            alpha = torch.ones(
                (crop.shape[0], crop.shape[1], crop.shape[2], 1),
                dtype=dtype,
                device=device
            )
            crop = torch.cat([crop, alpha], dim=3)

        h, w = crop.shape[1], crop.shape[2]
        if h < max_h or w < max_w:
            pad_h = max_h - h
            pad_w = max_w - w
            pad_top = pad_h // 2
            pad_bottom = pad_h - pad_top
            pad_left = pad_w // 2
            pad_right = pad_w - pad_left

            # Pad with transparent pixels (RGBA = [0, 0, 0, 0])
            padded_crop = torch.nn.functional.pad(
                crop,
                (0, 0, pad_left, pad_right, pad_top, pad_bottom),
                mode='constant',
                value=0
            )
            padded.append(padded_crop)
        else:
            padded.append(crop)

    return torch.cat(padded, dim=0)


class NestedDetailerNode:
    """
    Hierarchical detailer: faces -> eyes -> composition.
    """

    @classmethod
    def INPUT_TYPES(cls):
        model_list = get_ultralytics_model_list()

        return {
            "required": {
                # Detection models
                "face_model": (model_list,),
                "eyes_pair_model": (model_list,),
                "eye_single_model": (model_list,),
                # Detection threshold (shared)
                "threshold": ("FLOAT", {
                    "default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "Detection threshold for all models"
                }),
                # Core inputs
                "image": ("IMAGE",),
                "model": ("MODEL",),
                "vae": ("VAE",),
                "positive": ("CONDITIONING",),
                "negative": ("CONDITIONING",),
                # Seed
                **SEED_INPUT,
                # Shared sampler parameters
                "cfg": ("FLOAT", {
                    "default": 1.5, "min": 0.0, "max": 100.0, "step": 0.1
                }),
                "sampler": (
                    comfy.samplers.KSampler.SAMPLERS,
                    {"default": "euler_ancestral_cfg_pp"}
                ),
                "scheduler": (
                    list(comfy.samplers.KSampler.SCHEDULERS) +
                    ["align_your_steps"],
                    {"default": "align_your_steps"}
                ),
                # Face processing
                "face_steps": ("INT", {
                    "default": 20, "min": 1, "max": 10000
                }),
                "face_denoise": ("FLOAT", {
                    "default": 0.4, "min": 0.0, "max": 1.0, "step": 0.01
                }),
                # Eye processing
                "eye_steps": ("INT", {
                    "default": 20, "min": 1, "max": 10000
                }),
                "eye_denoise": ("FLOAT", {
                    "default": 0.4, "min": 0.0, "max": 1.0, "step": 0.01
                }),
                # Upscale parameters
                "upscale_method": (UPSCALE_METHODS,),
                "max_scale": ("FLOAT", {
                    "default": 1.5,
                    "min": 0.1,
                    "max": 10.0,
                    "step": 0.1,
                    "tooltip": "Maximum megapixels for upscaled images"
                }),
                # Detailer parameters
                **DETAILER_INPUTS,
            },
            "hidden": {"extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = ("IMAGE", "IMAGE")
    RETURN_NAMES = ("image", "detailed_faces")
    FUNCTION = "process"
    CATEGORY = "detailer"

    def process(
        self, face_model, eyes_pair_model, eye_single_model,
        threshold, image, model, vae, positive, negative, seed,
        cfg, sampler, scheduler, face_steps, face_denoise,
        eye_steps, eye_denoise, upscale_method, max_scale,
        feather, context_padding, extra_pnginfo=None
    ):
        """Process image with nested face/eye detection."""
        # Load detectors
        provider = common.Node("UltralyticsDetectorProvider")
        face_detector = provider.function(face_model)[0]
        eyes_pair_detector = provider.function(eyes_pair_model)[0]
        eye_single_detector = provider.function(eye_single_model)[0]

        # Detect all bboxes on original image
        face_bboxes = detect_all_bboxes(image, face_detector, threshold)
        eye_pair_bboxes = detect_all_bboxes(
            image, eyes_pair_detector, threshold
        )
        eye_single_bboxes = detect_all_bboxes(
            image, eye_single_detector, threshold
        )

        if not face_bboxes:
            placeholder = torch.zeros(
                (1, 1, 1, 4), dtype=image.dtype, device=image.device
            )
            return common.return_preview(
                (image, placeholder),
                placeholder,
                extra_pnginfo
            )

        # For each face, find matching eyes
        face_eye_pairs = []
        for face_bbox, face_conf in face_bboxes:
            # Find eye pairs within this face (>=50% overlap)
            matching_pairs = [
                (bbox, conf) for bbox, conf in eye_pair_bboxes
                if bbox_overlap_percentage(face_bbox, bbox) >= 0.5
            ]

            # Use highest confidence eye pair if found
            if matching_pairs:
                matching_pairs.sort(key=lambda x: x[1], reverse=True)
                eye_bboxes = [matching_pairs[0][0]]
            else:
                # Try single eyes
                matching_singles = [
                    (bbox, conf) for bbox, conf in eye_single_bboxes
                    if bbox_overlap_percentage(face_bbox, bbox) >= 0.5
                ]
                eye_bboxes = [bbox for bbox, conf in matching_singles]

            face_eye_pairs.append((face_bbox, eye_bboxes))

        # Process each face
        final_faces_full_res = []
        final_faces_downscaled = []

        for face_bbox, eye_bboxes in face_eye_pairs:
            # Crop and upscale face
            face_crop = crop_image_by_bbox(image, face_bbox)
            face_upscaled = upscale_and_sample(
                face_crop, model, vae, positive, negative, seed,
                face_steps, cfg, sampler, scheduler, face_denoise,
                context_padding, max_scale
            )

            # Calculate scale factor for eye bbox mapping
            orig_w = face_bbox[2]
            orig_h = face_bbox[3]
            new_w = face_upscaled.shape[2]
            new_h = face_upscaled.shape[1]
            scale_x = new_w / orig_w
            scale_y = new_h / orig_h

            # Process eyes in upscaled face
            for eye_bbox in eye_bboxes:
                # Convert eye bbox from image space to upscaled face space
                eye_x_rel = eye_bbox[0] - face_bbox[0]
                eye_y_rel = eye_bbox[1] - face_bbox[1]
                eye_w = eye_bbox[2]
                eye_h = eye_bbox[3]

                # Scale to upscaled face coordinates
                eye_x_scaled = int(eye_x_rel * scale_x)
                eye_y_scaled = int(eye_y_rel * scale_y)
                eye_w_scaled = int(eye_w * scale_x)
                eye_h_scaled = int(eye_h * scale_y)

                eye_bbox_scaled = (
                    eye_x_scaled, eye_y_scaled,
                    eye_w_scaled, eye_h_scaled
                )

                # Crop, upscale, and sample eye
                eye_crop = crop_image_by_bbox(
                    face_upscaled, eye_bbox_scaled
                )
                eye_upscaled = upscale_and_sample(
                    eye_crop, model, vae, positive, negative, seed + 1,
                    eye_steps, cfg, sampler, scheduler, eye_denoise,
                    context_padding, max_scale
                )

                # Downscale eye back to face resolution
                scale_node = common.Node("ImageScale")
                eye_downscaled = scale_node.function(
                    eye_upscaled, upscale_method,
                    eye_w_scaled, eye_h_scaled, "disabled"
                )[0]

                # Composite eye back into upscaled face
                face_upscaled = uncrop_image_by_bbox(
                    face_upscaled, eye_downscaled, eye_bbox_scaled, feather
                )

            # Store full resolution face for preview
            final_faces_full_res.append(face_upscaled)

            # Downscale to original face size for compositing
            scale_node = common.Node("ImageScale")
            face_downscaled = scale_node.function(
                face_upscaled, upscale_method, orig_w, orig_h, "disabled"
            )[0]
            final_faces_downscaled.append(face_downscaled)

        # Composite downscaled faces back into image
        final_image = image
        for face_crop, (face_bbox, _) in zip(
            final_faces_downscaled, face_eye_pairs
        ):
            final_image = uncrop_image_by_bbox(
                final_image, face_crop, face_bbox, feather
            )

        # Create padded batch of full resolution faces with transparency
        face_batch = pad_crops_transparent(
            final_faces_full_res, image.device, image.dtype
        )

        return common.return_preview(
            (final_image, face_batch),
            face_batch,
            extra_pnginfo
        )


class NestedDetailerPipeNode(NestedDetailerNode):
    """Nested detailer with full_pipe input/output."""

    @classmethod
    def INPUT_TYPES(cls):
        base_inputs = super().INPUT_TYPES()

        # Remove standalone core inputs and seed
        for key in ["image", "model", "vae", "positive", "negative",
                    "seed"]:
            if key in base_inputs["required"]:
                del base_inputs["required"][key]

        # Add pipe input at the start
        pipe_inputs = {
            "required": {
                "full_pipe": ("FULL_PIPE",),
                **base_inputs["required"]
            },
            "hidden": base_inputs["hidden"]
        }

        return pipe_inputs

    RETURN_TYPES = ("FULL_PIPE", "IMAGE", "IMAGE")
    RETURN_NAMES = ("full_pipe", "image", "detailed_faces")

    def process(
        self, full_pipe, face_model, eyes_pair_model, eye_single_model,
        threshold, cfg, sampler, scheduler, face_steps, face_denoise,
        eye_steps, eye_denoise, upscale_method, max_scale, feather,
        context_padding, extra_pnginfo=None
    ):
        """Process using full_pipe."""
        # Extract from pipe
        image = full_pipe.get("image")
        model = full_pipe.get("model")
        vae = full_pipe.get("vae")
        positive = full_pipe.get("positive")
        negative = full_pipe.get("negative")
        seed = full_pipe.get("seed", 0)

        # Validate
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

        # Call parent process
        result = super().process(
            face_model, eyes_pair_model, eye_single_model,
            threshold, image, model, vae, positive, negative, seed,
            cfg, sampler, scheduler, face_steps, face_denoise,
            eye_steps, eye_denoise, upscale_method, max_scale,
            feather, context_padding, extra_pnginfo
        )

        if isinstance(result, dict):
            final_image, face_batch = result["result"]
        else:
            final_image, face_batch = result

        # Update pipe
        new_pipe = full_pipe.copy()
        new_pipe["image"] = final_image

        return common.return_preview(
            (new_pipe, final_image, face_batch),
            face_batch,
            extra_pnginfo
        )


NODE_CLASS_MAPPINGS = {
    "NestedDetailerNode": NestedDetailerNode,
    "NestedDetailerPipeNode": NestedDetailerPipeNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NestedDetailerNode": "Nested Detailer",
    "NestedDetailerPipeNode": "Nested Detailer (full-pipe)",
}
