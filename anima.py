#!/usr/bin/env python3
"""
Custom ComfyUI node for specialized anime-style prompt construction.
Splits positive prompts into specific categories for better organization.
"""

from . import common
from .prompt import extract_loras, parse_lora_syntax, apply_loras, parse_prompt_to_dict


class AnimaPromptNode:
    """
    Anime-focused prompt node that splits positive input into category-specific fields.
    Concatenates fields with commas and handles LoRA syntax and comment stripping.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "full_pipe": ("FULL_PIPE",),
            },
            "optional": {
                "num_characters": ("STRING", {"multiline": True, "default": ""}),
                "characters": ("STRING", {"multiline": True, "default": ""}),
                "copyrights": ("STRING", {"multiline": True, "default": ""}),
                "style": ("STRING", {"multiline": True, "default": ""}),
                "prompt": ("STRING", {"multiline": True, "default": ""}),
                "negative": ("STRING", {"multiline": True, "default": ""}),
                "negative_to_negpip": ("BOOLEAN", {"default": False}),
            },
        }

    RETURN_TYPES = ("FULL_PIPE",)
    RETURN_NAMES = ("full_pipe",)
    FUNCTION = "process"
    CATEGORY = "mudknight/prompt"
    DESCRIPTION = (
        "Anime-focused prompt node. Splices category fields into a single positive prompt. "
        "Lines commented with # are stripped. Supports <lora:file:strength> syntax."
    )

    def process(
        self,
        full_pipe,
        num_characters="",
        characters="",
        copyrights="",
        style="",
        prompt="",
        negative="",
        negative_to_negpip=False,
    ):
        model = full_pipe.get("model")
        clip = full_pipe.get("clip")

        # 1. Strip comments and collect parts
        parts = [
            common.strip_comments(num_characters),
            common.strip_comments(characters),
            common.strip_comments(copyrights),
            common.strip_comments(style),
            common.strip_comments(prompt),
        ]

        # 2. Concatenate non-empty positive parts
        positive_text = ", ".join([p.strip() for p in parts if p and p.strip()])
        negative_text = common.strip_comments(negative)

        # 3. Extract LoRAs (handles extraction from the combined string)
        cleaned_pos, pos_loras = extract_loras(positive_text)
        cleaned_neg, neg_loras = extract_loras(negative_text)

        # 4. Handle Negpip conversion for conditioning
        cond_pos = cleaned_pos
        cond_neg = cleaned_neg

        if negative_to_negpip and cond_neg.strip():
            neg_dict = parse_prompt_to_dict(cond_neg)
            negpip_parts = []
            for tag, weight in neg_dict.items():
                try:
                    w = float(weight)
                    new_weight = -w
                except (ValueError, TypeError):
                    new_weight = -1.0

                # Format per negpip requirements: (tag,:-weight)
                negpip_parts.append(f"({tag},:{new_weight:g})")

            negpip_string = " ".join(negpip_parts)

            if cond_pos.strip():
                cond_pos = cond_pos.rstrip().rstrip(",") + ", " + negpip_string
            else:
                cond_pos = negpip_string

            cond_neg = ""

        # 5. CLIP Text Encoding
        encoder = common.Node("CLIPTextEncode")
        pos_cond = encoder.function(clip=clip, text=cond_pos)[0]
        neg_cond = encoder.function(clip=clip, text=cond_neg)[0]

        # 6. Apply LoRAs
        combined_loras = ",".join(filter(None, [pos_loras, neg_loras]))
        lora_list = parse_lora_syntax(combined_loras)
        model_out, clip_out = apply_loras(model, clip, lora_list)

        new_pipe = full_pipe.copy()
        new_pipe.update(
            {
                "model": model_out,
                "clip": clip_out,
                "positive": pos_cond,
                "negative": neg_cond,
                "positive_text": cleaned_pos,
                "negative_text": cleaned_neg,
            }
        )

        return (new_pipe,)

NODE_CLASS_MAPPINGS = {
    "AnimaPromptNode": AnimaPromptNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AnimaPromptNode": "Anima Prompt (full-pipe)",
}
