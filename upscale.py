#!/usr/bin/env python3
import folder_paths
from comfy_extras.nodes_upscale_model import (
    ImageUpscaleWithModel,
    UpscaleModelLoader,
)
from nodes import ImageScale
import comfy.utils
# import comfy.model_management as mm
import os


class CombinedUpscaleNode:
    """
    Combines model-based upscaling with additional float scaling.
    Loads an upscale model, applies it, then scales by a factor.
    """

    def __init__(self):
        self.upscale_with_model = ImageUpscaleWithModel()
        self.image_scale = ImageScale()
        self.model_loader = UpscaleModelLoader()

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "upscale_model_name": (
                    folder_paths.get_filename_list("upscale_models"),
                ),
                "scale_factor": (
                    "FLOAT",
                    {
                        "default": 1.0,
                        "min": 0.1,
                        "max": 16.0,
                        "step": 0.1,
                    },
                ),
                "upscale_method": (
                    [
                        "nearest-exact",
                        "bilinear",
                        "area",
                        "bicubic",
                        "lanczos",
                    ],
                ),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "upscale"
    CATEGORY = "image/upscaling"

    def upscale(
        self, image, upscale_model_name, scale_factor, upscale_method
    ):
        # Get original dimensions
        original_height = image.shape[1]
        original_width = image.shape[2]

        # Load the upscale model
        upscale_model = self.model_loader.load_model(
            upscale_model_name
        )[0]

        # Apply model-based upscaling
        upscaled_image = self.upscale_with_model.upscale(
            upscale_model, image
        )[0]

        # Calculate target dimensions based on scale_factor
        target_width = int(original_width * scale_factor)
        target_height = int(original_height * scale_factor)

        # Scale to exact target size
        upscaled_image = self.image_scale.upscale(
            upscaled_image,
            upscale_method,
            target_width,
            target_height,
            "disabled",
        )[0]

        return (upscaled_image,)

    def load_upscale_model(self, model_name):
        """Load an upscale model from the models directory."""
        model_path = folder_paths.get_full_path(
            "upscale_models", model_name
        )

        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"Upscale model not found: {model_path}"
            )

        sd = comfy.utils.load_torch_file(
            model_path, safe_load=True
        )

        if "module.layers.0.residual_group.blocks.0.norm1.weight" in sd:
            sd = comfy.utils.state_dict_prefix_replace(
                sd, {"module.": ""}
            )

        out = comfy.utils.model_management.load_models_gpu(
            [comfy.sd.LDSR(sd)]
        )

        if "body.0.rdb1.conv1.weight" in sd:
            import comfy_extras.nodes_upscale_model as nodes_upscale

            out = nodes_upscale.UpscaleModelLoader().load_model(
                model_name
            )[0]

        return out


NODE_CLASS_MAPPINGS = {
    "CombinedUpscaleNode": CombinedUpscaleNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "CombinedUpscaleNode": "Combined Upscale (Model + Scale)"
}
