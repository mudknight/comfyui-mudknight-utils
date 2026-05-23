import torch
import numpy as np
from . import common


class OpenCVDenoise:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "device": (["CPU", "GPU"], {
                    "default": "GPU",
                    "tooltip": ("GPU highly recommended, "
                                "CPU limited to single-core")
                    }),
                "sigma_r": ("FLOAT", {
                    "default": 0.01,
                    "step": 0.01,
                    "round": 0.01,
                    "tooltip": (
                        "0.01 is recommended, higher values will filter more "
                        "noise at the expense of detail.")
                }),
                "sigma_color": ("FLOAT", {
                    "default": 8,
                    "step": 0.1,
                    "round": 0.1,
                    "tooltip": (
                        "8 is recommended, higher values cause more gradient "
                        "banding")
                }),
                "bilateral_diameter": ("INT", {
                    "default": 128,
                    "min": 0,
                    "max": 256,
                    "tooltip": (
                        "Pixel neighbourhood diameter for the bilateral "
                        "filter. 128 or 256 are recommended — higher values "
                        "produce better smoothing but are significantly "
                        "slower.")
                }),
            },
            "optional": {
                "full_pipe": ("FULL_PIPE",),
                "image": ("IMAGE",),
            }
        }

    RETURN_TYPES = ("FULL_PIPE", "IMAGE")
    RETURN_NAMES = ("full_pipe", "image")
    FUNCTION = "run"
    CATEGORY = "image/filter"
    DESCRIPTION = (
        "Denoises an image using OpenCV's edge-preserving filter followed "
        "by a bilateral filter. Reduces noise while preserving edges and "
        "fine detail. GPU is strongly recommended for reasonable performance."
    )

    def run(self, device, sigma_r, sigma_color, bilateral_diameter,
            full_pipe=None, image=None):
        # Handle input image from direct input or pipe
        if image is None and full_pipe is not None:
            image = full_pipe.get("image")

        if image is None:
            raise ValueError("No input image provided "
                             "(checked both input and full_pipe)")

        # Select GPU before importing OpenCV
        import cv2  # deferred import

        if device != "CPU":
            cv2.ocl.setUseOpenCL(True)
        else:
            cv2.ocl.setUseOpenCL(False)

        batch_size = image.shape[0]
        result_images = []

        for i in range(batch_size):
            # Process each image in the batch
            img = image[i].cpu().numpy()
            img_uint8 = (img * 255.0).astype(np.uint8)

            if device != "CPU":
                img_uint8 = cv2.UMat(img_uint8)

            # Apply filters
            processed = cv2.edgePreservingFilter(
                img_uint8, flags=2, sigma_s=128, sigma_r=sigma_r
            )
            processed = cv2.bilateralFilter(
                processed, bilateral_diameter, sigma_color, 60
            )

            if isinstance(processed, cv2.UMat):
                processed = processed.get()

            # Convert back to 0-1 float
            processed_float = processed.astype(np.float32) / 255.0
            result_images.append(processed_float)

        # Stack all processed images back into a single tensor
        result = np.stack(result_images, axis=0)
        result_image = torch.from_numpy(result)

        # Handle pipe output
        if full_pipe is not None:
            new_pipe = full_pipe.copy()
            new_pipe["image"] = result_image
            return (new_pipe, result_image)

        return (None, result_image)


class ImageDifference:
    """
    Calculates the difference between two images. Scales the smaller image
    to the larger using bicubic interpolation if dimensions mismatch.
    """
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image_a": ("IMAGE",),
                "image_b": ("IMAGE",),
                "scale_diff": ("FLOAT", {
                    "default": 1.0, "min": 1.0, "max": 10.0, "step": 0.1,
                    "tooltip": "Multiplies difference to improve visibility"
                }),
                "crop": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Crop around the changed region of the image"
                }),
                "sensitivity": ("FLOAT", {
                    "default": 0.05, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "Sensitivity for cropping"
                }),
                "padding": ("INT", {
                    "default": 20, "min": 0, "max": 512, "step": 1,
                    "tooltip": "Padding around cropped image"
                }),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "process_difference"
    CATEGORY = "image/effects"
    OUTPUT_NODE = True
    DESCRIPTION = (
        "Show the difference between 2 images, with optional cropping "
        "around the detected changed area.")

    def process_difference(self, image_a, image_b, scale_diff, crop,
                           sensitivity, padding):

        # Determine total pixels (H * W)
        size_a = image_a.shape[1] * image_a.shape[2]
        size_b = image_b.shape[1] * image_b.shape[2]

        # Scale smaller to larger if mismatch exists
        if image_a.shape != image_b.shape:
            if size_a >= size_b:
                target_shape = (image_a.shape[1], image_a.shape[2])
                # Permute to [B, C, H, W] for interpolation
                img_to_resize = image_b.permute(0, 3, 1, 2)
                resized = torch.nn.functional.interpolate(
                        img_to_resize, size=target_shape,
                        mode='bicubic', align_corners=False)
                image_b = resized.permute(0, 2, 3, 1)
            else:
                target_shape = (image_b.shape[1], image_b.shape[2])
                img_to_resize = image_a.permute(0, 3, 1, 2)
                resized = torch.nn.functional.interpolate(
                        img_to_resize, size=target_shape,
                        mode='bicubic', align_corners=False)
                image_a = resized.permute(0, 2, 3, 1)

        # Calculate absolute difference
        diff = torch.abs(image_a - image_b)
        diff_out = torch.clamp(diff * scale_diff, 0.0, 1.0)

        if not crop:
            return common.return_preview((diff_out,), diff_out)

        # Masking for crop logic
        mask = torch.max(diff, dim=-1)[0] > sensitivity
        coords = torch.nonzero(mask)

        if coords.size(0) == 0:
            return common.return_preview((diff_out,), diff_out)

        y_min, x_min = torch.min(coords[:, 1]), torch.min(coords[:, 2])
        y_max, x_max = torch.max(coords[:, 1]), torch.max(coords[:, 2])

        h, w = diff_out.shape[1], diff_out.shape[2]
        y_start = max(0, y_min - padding)
        x_start = max(0, x_min - padding)
        y_end = min(h, y_max + padding)
        x_end = min(w, x_max + padding)

        cropped_diff = diff_out[:, y_start:y_end, x_start:x_end, :]

        return common.return_preview((cropped_diff,), cropped_diff)


NODE_CLASS_MAPPINGS = {
    "OpenCVDenoise": OpenCVDenoise,
    "ImageDifference": ImageDifference,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "OpenCVDenoise": "OpenCV Denoise",
    "ImageDifference": "Image Difference",
}
