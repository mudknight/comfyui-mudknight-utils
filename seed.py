#!/usr/bin/env python3


class SeedWithOverride:
    """
    A seed node that accepts an optional override input.
    Uses ComfyUI's native control_after_generate for seed management.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "seed": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 0xffffffffffffffff
                }),
            },
            "optional": {
                "override_seed": ("INT", {
                    "forceInput": True
                }),
            }
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("seed",)
    FUNCTION = "get_seed"
    CATEGORY = "sampling"

    def get_seed(self, seed, override_seed=None):
        # If override is provided, use it
        if override_seed is not None:
            return (override_seed,)
        
        # Otherwise return the seed (ComfyUI handles control_after_generate)
        return (seed,)


NODE_CLASS_MAPPINGS = {
    "SeedWithOverride": SeedWithOverride
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SeedWithOverride": "Seed (with Override)"
}
