#!/usr/bin/env python3
"""
Custom ComfyUI node for comprehensive prompt conditioning with quality
tags, style presets, character replacement, and LoRA loading.
"""
import re
from . import common


def extract_loras(prompt):
    """
    Extract LoRA syntax from prompt and return cleaned prompt.
    Preserves complete LoRA syntax including filenames and weights.
    Args:
        prompt: Prompt string potentially containing LoRA syntax
    Returns:
        Tuple of (cleaned_prompt, lora_syntax_string)
    """
    if not prompt:
        return "", ""

    # Match LoRA syntax like <lora:filename.safetensors:weight>
    lora_pattern = r'<lora:[^>]+>'
    loras = re.findall(lora_pattern, prompt)

    # Remove LoRAs from prompt (but keep spacing clean)
    cleaned = re.sub(lora_pattern, '', prompt)
    # Clean up any double commas or spaces left behind
    cleaned = re.sub(r'\s*,\s*,\s*', ', ', cleaned)
    cleaned = re.sub(r'^\s*,\s*|\s*,\s*$', '', cleaned)

    # Join LoRAs with commas (no spaces needed, exact preservation)
    lora_syntax = ','.join(loras) if loras else ""

    return cleaned.strip(), lora_syntax


def parse_prompt_to_dict(prompt):
    """
    Parse prompt string into dictionary of {tag: weight}.
    Handles multiple tags in one weight group like (tag1, tag2:1.3).
    Args:
        prompt: Comma-separated prompt string
    Returns:
        Dictionary mapping base tag names to their weight strings
    """
    if not prompt:
        return {}

    tag_dict = {}

    # Split by commas, but we need to handle nested parentheses
    parts = []
    current = ""
    paren_depth = 0

    for char in prompt:
        if char == '(':
            paren_depth += 1
            current += char
        elif char == ')':
            paren_depth -= 1
            current += char
        elif char == ',' and paren_depth == 0:
            parts.append(current.strip())
            current = ""
        else:
            current += char

    if current.strip():
        parts.append(current.strip())

    # Process each part
    for part in parts:
        if not part:
            continue

        # Check if it's a weighted group like (tag1, tag2:1.3)
        match = re.match(r'\(+([^)]+):([0-9.]+)\)+', part)
        if match:
            # Multiple tags with shared weight
            inner_tags = match.group(1)
            weight = match.group(2)

            # Split inner tags by comma
            for inner_tag in inner_tags.split(','):
                tag_name = inner_tag.strip().lower()
                if tag_name:
                    tag_dict[tag_name] = weight
        else:
            # Check for single weighted tag like (tag:1.3)
            single_match = re.match(
                r'\(+([^:()]+):([0-9.]+)\)+',
                part
            )
            if single_match:
                tag_name = single_match.group(1).strip().lower()
                weight = single_match.group(2)
                tag_dict[tag_name] = weight
            else:
                # Unweighted tag
                tag_name = part.strip().lower()
                if tag_name:
                    tag_dict[tag_name] = "1.0"

    return tag_dict


def reconstruct_prompt_from_dict(tag_dict):
    """
    Reconstruct prompt string from tag dictionary.
    Args:
        tag_dict: Dictionary mapping tag names to weights
    Returns:
        Comma-separated prompt string with weighted tags
    """
    if not tag_dict:
        return ""

    parts = []
    for tag, weight in tag_dict.items():
        if weight == "1.0":
            parts.append(tag)
        else:
            parts.append(f"({tag}:{weight})")

    return ", ".join(parts)


def deduplicate_negative_dicts(positive_tags, negative_dicts):
    """
    Remove tags from negative dicts if they appear in positive tags.

    Args:
        positive_tags: Set of positive tag names (lowercase)
        negative_dicts: List of tag dictionaries for negative prompts

    Returns:
        List of deduplicated tag dictionaries
    """
    deduplicated = []

    for neg_dict in negative_dicts:
        filtered_dict = {
            tag: weight for tag, weight in neg_dict.items()
            if tag not in positive_tags
        }
        deduplicated.append(filtered_dict)

    return deduplicated


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
                    "tooltip": (
                        "Select style preset from conifg/styles.jsonc"
                    )
                }),
                "quality_tags": ("BOOLEAN", {
                    "default": True,
                    "tooltip": (
                        "Enable quality tags defined in "
                        "config/models.jsonc"
                    )
                }),
                "embeddings": ("BOOLEAN", {
                    "default": True,
                    "tooltip": (
                        "Enable embeddings defined in "
                        "config/models.jsonc"
                    )
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
                "deduplicate_tags": ("BOOLEAN", {
                    "default": True,
                    "tooltip": (
                        "Remove tags from negative prompt that appear "
                        "in positive prompt"
                    )
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
        negative="",
        deduplicate_tags=True
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

        # Extract LoRAs from user prompts before processing
        positive, positive_loras = extract_loras(positive)
        negative, _ = extract_loras(negative)

        # Get model preset quality tags
        model_preset_node = common.Node("ModelPresetNode")
        quality_pos, quality_neg = model_preset_node.function(
            ckpt_name=ckpt_name,
            quality_tags=quality_tags,
            embeddings=embeddings
        )

        # Extract LoRAs from quality tags
        quality_pos, quality_pos_loras = extract_loras(quality_pos)
        quality_neg, _ = extract_loras(quality_neg)

        # Get style preset tags
        style_preset_node = common.Node("StylePresetNode")
        style_pos, style_neg = style_preset_node.function(style=style)

        # Extract LoRAs from style tags
        style_pos, style_pos_loras = extract_loras(style_pos)
        style_neg, _ = extract_loras(style_neg)

        # Extract LoRAs from trigger words
        trigger_words_clean, trigger_loras = extract_loras(trigger_words)

        # Process tag replacements
        tag_replacement_node = common.Node("TagReplacementNode")
        prompt, char_pos, char_neg, match = tag_replacement_node.function(
            input_tags=positive
        )

        # Extract LoRAs from character tags
        prompt, prompt_loras = extract_loras(prompt)
        char_pos, char_pos_loras = extract_loras(char_pos)
        char_neg, _ = extract_loras(char_neg)

        # Parse all prompts into tag dictionaries
        quality_pos_dict = parse_prompt_to_dict(quality_pos)
        quality_neg_dict = parse_prompt_to_dict(quality_neg)
        style_pos_dict = parse_prompt_to_dict(style_pos)
        style_neg_dict = parse_prompt_to_dict(style_neg)
        trigger_dict = parse_prompt_to_dict(trigger_words_clean)
        char_pos_dict = parse_prompt_to_dict(char_pos)
        char_neg_dict = parse_prompt_to_dict(char_neg)
        prompt_pos_dict = parse_prompt_to_dict(prompt)
        prompt_neg_dict = parse_prompt_to_dict(negative)

        # Combine all positive tags into one set for comparison
        all_positive_tags = set()
        for tag_dict in [
            quality_pos_dict,
            style_pos_dict,
            trigger_dict,
            char_pos_dict,
            prompt_pos_dict
        ]:
            all_positive_tags.update(tag_dict.keys())

        # Deduplicate negative prompts if enabled
        if deduplicate_tags:
            negative_dicts = [
                quality_neg_dict,
                style_neg_dict,
                char_neg_dict,
                prompt_neg_dict
            ]

            deduped_neg_dicts = deduplicate_negative_dicts(
                all_positive_tags,
                negative_dicts
            )

            quality_neg_dict = deduped_neg_dicts[0]
            style_neg_dict = deduped_neg_dicts[1]
            char_neg_dict = deduped_neg_dicts[2]
            prompt_neg_dict = deduped_neg_dicts[3]

        # Reconstruct prompts from dictionaries
        quality_pos_clean = reconstruct_prompt_from_dict(quality_pos_dict)
        quality_neg_clean = reconstruct_prompt_from_dict(quality_neg_dict)
        style_pos_clean = reconstruct_prompt_from_dict(style_pos_dict)
        style_neg_clean = reconstruct_prompt_from_dict(style_neg_dict)
        trigger_clean = reconstruct_prompt_from_dict(trigger_dict)
        char_pos_clean = reconstruct_prompt_from_dict(char_pos_dict)
        char_neg_clean = reconstruct_prompt_from_dict(char_neg_dict)
        prompt_pos_clean = reconstruct_prompt_from_dict(prompt_pos_dict)
        prompt_neg_clean = reconstruct_prompt_from_dict(prompt_neg_dict)

        # Build positive conditioning
        multi_string_pos = common.Node("MultiStringConditioning")
        pos_cond, pos_text, lora_syntax = multi_string_pos.function(
            clip=clip,
            quality=quality_pos_clean,
            style=style_pos_clean,
            trigger=trigger_clean,
            character=char_pos_clean,
            prompt=prompt_pos_clean
        )

        # Combine all extracted LoRAs
        all_loras = [
            positive_loras,
            quality_pos_loras,
            style_pos_loras,
            trigger_loras,
            char_pos_loras,
            prompt_loras,
            lora_syntax
        ]
        combined_loras = ','.join(l for l in all_loras if l)

        # Build negative conditioning
        multi_string_neg = common.Node("MultiStringConditioning")
        neg_cond, neg_text, _ = multi_string_neg.function(
            clip=clip,
            quality=quality_neg_clean,
            style=style_neg_clean,
            trigger="",
            character=char_neg_clean,
            prompt=prompt_neg_clean
        )

        # Load LoRAs if present in syntax
        lora_loader = common.Node("LoRA Text Loader (LoraManager)")
        model_out, clip_out, _, _ = lora_loader.function(
            model=model,
            lora_syntax=combined_loras,
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
