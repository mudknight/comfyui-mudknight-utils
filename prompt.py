#!/usr/bin/env python3
"""
Custom ComfyUI node for comprehensive prompt conditioning with quality
tags, style presets, character replacement, and LoRA loading.
"""
from . import common


class PromptConditioningNode:
    """
    Combines quality tags, style presets, character tags, and LoRAs into
    positive and negative conditioning.
    """

    @classmethod
    def INPUT_TYPES(cls):
        # Get style list from StylePresetNode
        from nodes import NODE_CLASS_MAPPINGS
        style_preset_cls = NODE_CLASS_MAPPINGS.get("StylePresetNode")

        if style_preset_cls:
            style_inputs = style_preset_cls.INPUT_TYPES()
            style_list = style_inputs["required"]["style"][0]
        else:
            # Fallback if node not found
            style_list = ["none"]

        return {
            "required": {
                "full_pipe": ("FULL_PIPE",),
            },
            "optional": {
                "trigger_words": ("STRING", {
                    # "multiline": False,
                    # "default": "",
                    "forceInput": True
                }),
                "style": (style_list, {
                    "default": "none",
                    "tooltip": "Select style preset from conifg/styles.jsonc"
                }),
                "quality_tags": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Enable quality tags defined in config/models.jsonc"
                    }),
                "embeddings": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Enable embeddings defined in config/models.jsonc"
                    }),
                "positive": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "tooltip": "Positive prompt"
                }),
                "negative": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "tooltip": "Negative prompt"
                }),
            }
        }

    RETURN_TYPES = ("FULL_PIPE", "STRING",)
    RETURN_NAMES = ("full_pipe", "match",)
    FUNCTION = "process"
    CATEGORY = "custom/conditioning"
    DESCRIPTION = "Add multi-string conditioning prompt to full pipe"

    def process(
        self,
        full_pipe,
        trigger_words="",
        style="none",
        quality_tags=True,
        embeddings=True,
        positive="",
        negative=""
    ):
        # Import required node classes
        from nodes import NODE_CLASS_MAPPINGS

        # Validate all required nodes are available
        if not all([
            NODE_CLASS_MAPPINGS.get("LoRA Text Loader (LoraManager)")
        ]):
            raise RuntimeError(
                "Required custom nodes not found. Ensure "
                "comfyui-lora-manager "
                "is installed."
            )

        # Extract pipe components
        model = full_pipe.get("model")
        clip = full_pipe.get("clip")
        ckpt_name = full_pipe.get("ckpt_name", "")

        # Remove comments
        positive = common.strip_comments(positive)
        negative = common.strip_comments(negative)

        # Get model preset quality tags
        model_preset_node = common.Node("ModelPresetNode")
        quality_pos, quality_neg = model_preset_node.function(
            ckpt_name=ckpt_name,
            quality_tags=quality_tags,
            embeddings=embeddings
        )

        # Get style preset tags
        style_preset_node = common.Node("StylePresetNode")
        style_pos, style_neg = style_preset_node.function(style=style)

        # Process tag replacements
        tag_replacement_node = common.Node("TagReplacementNode")
        prompt, char_pos, char_neg, match = tag_replacement_node.function(
                input_tags=positive)

        # Build positive conditioning
        multi_string_pos = common.Node("MultiStringConditioning")
        pos_cond, pos_text, lora_syntax = multi_string_pos.function(
            clip=clip,
            quality=quality_pos,
            style=style_pos,
            trigger=trigger_words,
            character=char_pos,
            prompt=prompt
        )

        # Build negative conditioning
        multi_string_neg = common.Node("MultiStringConditioning")
        neg_cond, neg_text, _ = multi_string_neg.function(
            clip=clip,
            quality=quality_neg,
            style=style_neg,
            trigger="",
            character=char_neg,
            prompt=negative
        )

        # Load LoRAs if present in syntax
        lora_loader = common.Node("LoRA Text Loader (LoraManager)")
        model_out, clip_out, _, _ = lora_loader.function(
            model=model,
            lora_syntax=lora_syntax,
            clip=clip
        )

        # Create updated pipe
        new_pipe = full_pipe.copy()
        new_pipe.update({
            "model": model_out,
            "clip": clip_out,
            "positive": pos_cond,
            "negative": neg_cond,
            "positive_text": pos_text,
            "negative_text": neg_text
        })

        return (new_pipe, char_pos,)


# Node registration
NODE_CLASS_MAPPINGS = {
    "PromptConditioningNode": PromptConditioningNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PromptConditioningNode": "Prompt Conditioning"
}
