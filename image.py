import torch
import numpy as np


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
                    {"default": "auto_median"}
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


NODE_CLASS_MAPPINGS = {
    "AutoLevelNode": AutoLevelNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AutoLevelNode": "Auto Level"
}
