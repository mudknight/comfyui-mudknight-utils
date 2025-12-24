#!/usr/bin/env python3
"""
Conditional LoRA node for ComfyUI.
Applies a LoRA only if a substring is found in the positive prompt.
"""

import folder_paths


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

        # Apply LoRA if condition is met
        if contains:
            # Load and apply LoRA
            lora_path = folder_paths.get_full_path("loras", lora_name)
            lora = self._load_lora(lora_path, strength_model, strength_clip)

            if lora is not None:
                model_lora, clip_lora = self._apply_lora(
                    model,
                    clip,
                    lora,
                    strength_model,
                    strength_clip
                )
            else:
                # If LoRA fails to load, use original values
                model_lora, clip_lora = model, clip
        else:
            # Condition not met, use original values
            model_lora, clip_lora = model, clip

        # Create updated pipe
        new_pipe = full_pipe.copy()
        new_pipe["model"] = model_lora
        new_pipe["clip"] = clip_lora

        return (new_pipe,)

    def _load_lora(self, lora_path, strength_model, strength_clip):
        """Load LoRA from file."""
        try:
            import comfy.utils
            lora = comfy.utils.load_torch_file(
                lora_path,
                safe_load=True
            )
            return lora
        except Exception as e:
            print(f"Error loading LoRA: {e}")
            return None

    def _apply_lora(self, model, clip, lora, strength_model, strength_clip):
        """Apply LoRA to model and CLIP."""
        try:
            import comfy.sd
            model_lora, clip_lora = comfy.sd.load_lora_for_models(
                model,
                clip,
                lora,
                strength_model,
                strength_clip
            )
            return model_lora, clip_lora
        except Exception as e:
            print(f"Error applying LoRA: {e}")
            return model, clip


NODE_CLASS_MAPPINGS = {
    "ConditionalLoraFullPipe": ConditionalLoraFullPipe
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ConditionalLoraFullPipe": "Conditional Lora (full-pipe)"
}
