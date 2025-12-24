#!/usr/bin/env python3

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


# Node registration for ComfyUI
NODE_CLASS_MAPPINGS = {
    "ResolutionSelector": ResolutionSelector
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ResolutionSelector": "Resolution Selector"
}
