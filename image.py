import torch
import numpy as np
from . import common


class AutoLevelNode:
    """
    Auto-level an image by finding prevalent near-black and near-white
    pixels and stretching them to pure black and white.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "black_threshold": (
                    "INT",
                    {
                        "default": 30,
                        "min": 0,
                        "max": 127,
                        "step": 1,
                    }
                ),
                "white_threshold": (
                    "INT",
                    {
                        "default": 225,
                        "min": 128,
                        "max": 255,
                        "step": 1,
                    }
                ),
                "gamma_mode": (
                    ["manual", "auto_median", "auto_mean"],
                    {"default": "manual"}
                ),
                "gamma": (
                    "FLOAT",
                    {
                        "default": 1.0,
                        "min": 0.1,
                        "max": 3.0,
                        "step": 0.01,
                    }
                ),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "auto_level"
    CATEGORY = "image/postprocessing"
    DESCRIPTION = (
        "Auto-level an image by finding prevalent near-black and "
        "near-white pixels and stretching them to pure black and white.")

    def find_black_white_points(
        self, img_array, black_threshold, white_threshold
    ):
        """
        Find most prevalent pixels near black and white.

        Args:
            img_array: Numpy array (H, W, C) with values 0-255
            black_threshold: Max value to consider near-black
            white_threshold: Min value to consider near-white

        Returns:
            Tuple of (black_point, white_point)
        """
        # Convert to grayscale for analysis
        if img_array.shape[2] == 3:
            gray = (
                0.299 * img_array[:, :, 0] +
                0.587 * img_array[:, :, 1] +
                0.114 * img_array[:, :, 2]
            )
        else:
            gray = img_array[:, :, 0]

        gray = gray.astype(np.uint8)

        # Calculate histogram
        histogram, _ = np.histogram(gray, bins=256, range=(0, 256))

        # Find most prevalent near-black pixel
        black_point = np.argmax(histogram[:black_threshold + 1])

        # Find most prevalent near-white pixel
        white_region = histogram[white_threshold:]
        white_point = white_threshold + np.argmax(white_region)

        return int(black_point), int(white_point)

    def calculate_auto_gamma(self, normalized_img, mode="median"):
        """
        Calculate gamma to gently adjust image brightness.

        Args:
            normalized_img: Image normalized to 0-1 range
            mode: "median" or "mean" - which measure to use

        Returns:
            Calculated gamma value
        """
        # Avoid pure black/white pixels in calculation
        valid_pixels = normalized_img[
            (normalized_img > 0.05) & (normalized_img < 0.95)
        ]

        if len(valid_pixels) == 0:
            return 1.0

        if mode == "median":
            middle_value = np.median(valid_pixels)
        else:
            middle_value = np.mean(valid_pixels)

        # Only adjust if significantly off from middle gray
        # Target is 0.5, but only correct if outside 0.35-0.65 range
        if 0.35 <= middle_value <= 0.65:
            return 1.0

        if middle_value <= 0.01:
            return 1.0

        # Calculate gamma but apply it more gently
        # Instead of targeting exactly 0.5, target somewhere between
        # current value and 0.5
        target = 0.5 + (middle_value - 0.5) * 0.5
        gamma = np.log(middle_value) / np.log(target)

        # More conservative clamping
        gamma = np.clip(gamma, 0.6, 1.5)

        return float(gamma)

    def auto_level(self, image, black_threshold, white_threshold,
                   gamma_mode, gamma):
        """
        Apply auto-leveling to the image tensor.

        Args:
            image: ComfyUI image tensor (B, H, W, C) with values 0-1
            black_threshold: Max value to consider near-black (0-255)
            white_threshold: Min value to consider near-white (0-255)
            gamma_mode: "manual", "auto_median", or "auto_mean"
            gamma: Manual gamma value (used if gamma_mode is "manual")

        Returns:
            Tuple containing the leveled image tensor
        """
        # Convert from ComfyUI format (B, H, W, C) 0-1 to numpy 0-255
        batch_size = image.shape[0]
        result_images = []

        for i in range(batch_size):
            # Get single image and convert to numpy
            img = image[i].cpu().numpy()
            img_uint8 = (img * 255).astype(np.uint8)

            # Find black and white points
            black_point, white_point = self.find_black_white_points(
                img_uint8, black_threshold, white_threshold
            )

            # Avoid division by zero
            if black_point >= white_point:
                white_point = black_point + 1

            # Apply leveling: normalize to 0-1 range first
            normalized = (
                img_uint8.astype(np.float32) - black_point
            ) / (white_point - black_point)
            normalized = np.clip(normalized, 0.0, 1.0)

            # Calculate or use manual gamma
            if gamma_mode == "manual":
                effective_gamma = gamma
            elif gamma_mode == "auto_median":
                effective_gamma = self.calculate_auto_gamma(
                    normalized, mode="median"
                )
            else:
                effective_gamma = self.calculate_auto_gamma(
                    normalized, mode="mean"
                )

            # Apply gamma correction to midtones
            gamma_corrected = np.power(normalized, 1.0 / effective_gamma)

            # Scale back to 0-255
            leveled = (gamma_corrected * 255).astype(np.uint8)

            # Convert back to 0-1 range
            leveled_float = leveled.astype(np.float32) / 255.0
            result_images.append(leveled_float)

        # Stack back into batch
        result = np.stack(result_images, axis=0)

        # Convert back to torch tensor
        return (torch.from_numpy(result),)


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
                        "0.1 is recommended, higher values will filter more "
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

    def run(self, device, sigma_r, sigma_color, full_pipe=None, image=None):
        # Handle input image from direct input or pipe
        if image is None and full_pipe is not None:
            image = full_pipe.get("image")

        if image is None:
            raise ValueError("No input image provided (checked both input and full_pipe)")

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
            processed = cv2.bilateralFilter(processed, 256, sigma_color, 60)

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
            "hidden": {"extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "process_difference"
    CATEGORY = "image/effects"
    OUTPUT_NODE = True
    DESCRIPTION = (
        "Show the difference between 2 images, with optional cropping "
        "around the detected changed area.")

    def process_difference(self, image_a, image_b, scale_diff, crop,
                           sensitivity, padding, extra_pnginfo):

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
            return common.return_preview(
                (diff_out,),
                diff_out,
                extra_pnginfo
            )

        # Masking for crop logic
        mask = torch.max(diff, dim=-1)[0] > sensitivity
        coords = torch.nonzero(mask)

        if coords.size(0) == 0:
            return common.return_preview(
                (diff_out,),
                diff_out,
                extra_pnginfo
            )

        y_min, x_min = torch.min(coords[:, 1]), torch.min(coords[:, 2])
        y_max, x_max = torch.max(coords[:, 1]), torch.max(coords[:, 2])

        h, w = diff_out.shape[1], diff_out.shape[2]
        y_start = max(0, y_min - padding)
        x_start = max(0, x_min - padding)
        y_end = min(h, y_max + padding)
        x_end = min(w, x_max + padding)

        cropped_diff = diff_out[:, y_start:y_end, x_start:x_end, :]

        return common.return_preview(
            (cropped_diff,),
            cropped_diff,
            extra_pnginfo
        )


NODE_CLASS_MAPPINGS = {
    "AutoLevelNode": AutoLevelNode,
    "OpenCVDenoise": OpenCVDenoise,
    "ImageDifference": ImageDifference,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AutoLevelNode": "Auto Level",
    "OpenCVDenoise": "OpenCV Denoise",
    "ImageDifference": "Image Difference",
}
