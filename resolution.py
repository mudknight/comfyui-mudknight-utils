#!/usr/bin/env python3
import torch


class ResolutionSelector:
    """
    A ComfyUI node that provides preset resolutions optimized for SDXL models
    with a toggle to flip between portrait and landscape.
    """

    # Define resolution presets (name: (width, height))
    # All resolutions defined in portrait/square orientation
    RESOLUTIONS = {
        "1024x1024 (1:1)": (1024, 1024),
        "960x1088 (8:9)": (960, 1088),
        "896x1152 (7:9)": (896, 1152),
        "832x1216 (2:3)": (832, 1216),
        "768x1344 (4:7)": (768, 1344),
        "704x1408 (1:2)": (704, 1408),
        "640x1536 (5:12)": (640, 1536),
    }

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "resolution": (list(cls.RESOLUTIONS.keys()),),
                "portrait": ("BOOLEAN", {"default": True}),
            }
        }

    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("width", "height")
    FUNCTION = "get_resolution"
    CATEGORY = "image/resolution"

    def get_resolution(self, resolution, portrait):
        width, height = self.RESOLUTIONS[resolution]

        # Flip dimensions if landscape is enabled and not square
        if not portrait and width != height:
            width, height = height, width

        return (width, height)


class CustomResolutionPipe:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "full_pipe": ("FULL_PIPE",),
                "width": ("INT", {
                    "default": 832,
                    "steps": 8,
                    }),
                "height": ("INT", {
                    "default": 1216,
                    "steps": 8,
                    }),
                "batch_size": ("INT", {
                    "default": 1
                    })
                },
            }
    RETURN_TYPES = ("FULL_PIPE",)
    RETURN_NAMES = ("full_pipe",)
    FUNCTION = "get_latent"
    CATEGORY = "image/resolution"

    def get_latent(self, full_pipe, width, height, batch_size):
        latent_width = width // 8
        latent_height = height // 8

        samples = torch.zeros(
            [batch_size, 4, latent_height, latent_width]
        )

        new_pipe = full_pipe.copy()
        new_pipe["latent"] = {"samples": samples}
        return (new_pipe,)


# Node registration for ComfyUI
NODE_CLASS_MAPPINGS = {
    "ResolutionSelector": ResolutionSelector,
    "CustomResolutionPipe": CustomResolutionPipe
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ResolutionSelector": "Resolution Selector",
    "CustomResolutionPipe": "Custom Resolution (full-pipe)"
}
