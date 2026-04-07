#!/usr/bin/env python3
"""
LoRA nodes for ComfyUI.

Provides unconditional and conditional LoRA application via full pipe.
"""

import folder_paths


def _load_lora(lora_path):
    """Load a LoRA from file; returns None on failure."""
    try:
        import comfy.utils
        return comfy.utils.load_torch_file(lora_path, safe_load=True)
    except Exception as e:
        print(f"Error loading LoRA: {e}")
        return None


def _apply_lora(model, clip, lora, strength_model, strength_clip):
    """Apply a loaded LoRA to model and CLIP; returns originals on error."""
    try:
        import comfy.sd
        return comfy.sd.load_lora_for_models(
            model, clip, lora, strength_model, strength_clip
        )
    except Exception as e:
        print(f"Error applying LoRA: {e}")
        return model, clip


class LoraFullPipe:
    """Apply a LoRA unconditionally to model and CLIP via full pipe."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "full_pipe": ("FULL_PIPE",),
                "lora_name": (folder_paths.get_filename_list("loras"),),
                "strength_model": (
                    "FLOAT",
                    {
                        "default": 1.0,
                        "min": -20.0,
                        "max": 20.0,
                        "step": 0.01,
                    }
                ),
                "strength_clip": (
                    "FLOAT",
                    {
                        "default": 1.0,
                        "min": -20.0,
                        "max": 20.0,
                        "step": 0.01,
                    }
                ),
            },
        }

    RETURN_TYPES = ("FULL_PIPE",)
    RETURN_NAMES = ("full_pipe",)
    FUNCTION = "apply_lora"
    CATEGORY = "custom/pipe"
    DESCRIPTION = "Apply a LoRA to the model and CLIP in a full pipe."

    def apply_lora(
        self,
        full_pipe,
        lora_name,
        strength_model,
        strength_clip,
    ):
        model = full_pipe.get("model")
        clip = full_pipe.get("clip")

        lora_path = folder_paths.get_full_path("loras", lora_name)
        lora = _load_lora(lora_path)

        if lora is not None:
            model, clip = _apply_lora(
                model, clip, lora, strength_model, strength_clip
            )

        new_pipe = full_pipe.copy()
        new_pipe["model"] = model
        new_pipe["clip"] = clip
        return (new_pipe,)


class ConditionalLoraFullPipe:
    """
    Conditionally apply LoRA to model and CLIP based on substring match.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "full_pipe": ("FULL_PIPE",),
                "lora_name": (folder_paths.get_filename_list("loras"),),
                "strength_model": (
                    "FLOAT",
                    {
                        "default": 1.0,
                        "min": -20.0,
                        "max": 20.0,
                        "step": 0.01
                    }
                ),
                "strength_clip": (
                    "FLOAT",
                    {
                        "default": 1.0,
                        "min": -20.0,
                        "max": 20.0,
                        "step": 0.01
                    }
                ),
                "substring": ("STRING", {"default": ""}),
            },
        }

    RETURN_TYPES = ("FULL_PIPE",)
    RETURN_NAMES = ("full_pipe",)
    FUNCTION = "apply_conditional_lora"
    CATEGORY = "custom/pipe"
    DESCRIPTION = "Add lora if substring is in positive_text."

    def apply_conditional_lora(
        self,
        full_pipe,
        lora_name,
        strength_model,
        strength_clip,
        substring
    ):
        # Extract data from pipe
        model = full_pipe.get("model")
        clip = full_pipe.get("clip")
        positive_text = full_pipe.get("positive_text", "")

        # Check if substring exists in positive_text (case-insensitive)
        contains = substring.lower() in positive_text.lower()

        # Apply LoRA only when condition is met
        if contains:
            lora_path = folder_paths.get_full_path("loras", lora_name)
            lora = _load_lora(lora_path)
            if lora is not None:
                model, clip = _apply_lora(
                    model, clip, lora, strength_model, strength_clip
                )

        new_pipe = full_pipe.copy()
        new_pipe["model"] = model
        new_pipe["clip"] = clip
        return (new_pipe,)


NODE_CLASS_MAPPINGS = {
    "LoraFullPipe": LoraFullPipe,
    "ConditionalLoraFullPipe": ConditionalLoraFullPipe,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LoraFullPipe": "Load LoRA (full-pipe)",
    "ConditionalLoraFullPipe": "Conditional Lora (full-pipe)",
}
