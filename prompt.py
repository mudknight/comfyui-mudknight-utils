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

        # Get node classes
        model_preset_cls = NODE_CLASS_MAPPINGS.get("ModelPresetNode")
        style_preset_cls = NODE_CLASS_MAPPINGS.get("StylePresetNode")
        tag_replacement_cls = NODE_CLASS_MAPPINGS.get(
            "TagReplacementNode"
        )
        multi_string_cls = NODE_CLASS_MAPPINGS.get(
            "MultiStringConditioning"
        )
        lora_loader_cls = NODE_CLASS_MAPPINGS.get(
            "LoRA Text Loader (LoraManager)"
        )

        # Validate all required nodes are available
        if not all([
            model_preset_cls,
            style_preset_cls,
            tag_replacement_cls,
            multi_string_cls,
            lora_loader_cls
        ]):
            raise RuntimeError(
                "Required custom nodes not found. Ensure "
                "comfyui-mudknight-utils and comfyui-lora-manager "
                "are installed."
            )

        # Extract pipe components
        model = full_pipe.get("model")
        clip = full_pipe.get("clip")
        ckpt_name = full_pipe.get("ckpt_name", "")

        # Remove comments
        positive = common.strip_comments(positive)
        negative = common.strip_comments(negative)

        # Get model preset quality tags
        model_preset_node = model_preset_cls()
        fn_name = model_preset_node.FUNCTION
        fn = getattr(model_preset_node, fn_name)
        quality_pos, quality_neg = fn(
            ckpt_name=ckpt_name,
            quality_tags=quality_tags,
            embeddings=embeddings
        )

        # Get style preset tags
        style_preset_node = style_preset_cls()
        fn_name = style_preset_node.FUNCTION
        fn = getattr(style_preset_node, fn_name)
        style_pos, style_neg = fn(style=style)

        # Process tag replacements
        tag_replacement_node = tag_replacement_cls()
        fn_name = tag_replacement_node.FUNCTION
        fn = getattr(tag_replacement_node, fn_name)
        prompt, char_pos, char_neg, match = fn(input_tags=positive)

        # Build positive conditioning
        multi_string_pos = multi_string_cls()
        fn_name = multi_string_pos.FUNCTION
        fn = getattr(multi_string_pos, fn_name)
        pos_cond, pos_text, lora_syntax = fn(
            clip=clip,
            quality=quality_pos,
            style=style_pos,
            trigger=trigger_words,
            character=char_pos,
            prompt=prompt
        )

        # Build negative conditioning
        multi_string_neg = multi_string_cls()
        fn_name = multi_string_neg.FUNCTION
        fn = getattr(multi_string_neg, fn_name)
        neg_cond, neg_text, _ = fn(
            clip=clip,
            quality=quality_neg,
            style=style_neg,
            trigger="",
            character=char_neg,
            prompt=negative
        )

        # Load LoRAs if present in syntax
        lora_loader = lora_loader_cls()
        fn_name = lora_loader.FUNCTION
        fn = getattr(lora_loader, fn_name)
        model_out, clip_out, _, _ = fn(
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
