#!/usr/bin/env python3
"""
Custom ComfyUI node for comprehensive prompt conditioning with quality
tags, style presets, character replacement, and LoRA loading.
"""
import re
import folder_paths
import comfy.sd
import comfy.utils
from . import common


def parse_lora_syntax(lora_string):
    """
    Parse LoRA syntax string and return list of (name, model_str, clip_str).

    Supports formats:
    - <lora:filename:strength> - applies strength to both model and clip
    - <lora:filename:model_str:clip_str> - different strengths
    - Multiple LoRAs separated by commas or spaces

    Args:
        lora_string: String containing LoRA syntax

    Returns:
        List of tuples: [(lora_name, model_strength, clip_strength), ...]
    """
    if not lora_string or not lora_string.strip():
        return []

    # Pattern matches <lora:name:strength> or <lora:name:model:clip>
    pattern = r'<lora:([^:>]+):([0-9.-]+)(?::([0-9.-]+))?\s*>'
    matches = re.findall(pattern, lora_string, re.IGNORECASE)

    lora_list = []
    for match in matches:
        lora_name = match[0].strip()
        model_strength = float(match[1])

        # If third group exists, use it for clip strength
        # Otherwise, use model strength for both
        if match[2]:
            clip_strength = float(match[2])
        else:
            clip_strength = model_strength

        lora_list.append((lora_name, model_strength, clip_strength))

    return lora_list


def apply_loras(model, clip, lora_list):
    """
    Apply a list of LoRAs to model and clip, automatically finding
    files in subdirectories.
    """
    if not lora_list:
        return model, clip

    model_lora = model
    clip_lora = clip

    # Get all available LoRAs in the lora directory (incl. subfolders)
    available_loras = folder_paths.get_filename_list("loras")

    for lora_name, strength_model, strength_clip in lora_list:
        try:
            # Ensure the filename has the extension for comparison
            ext = ".safetensors"
            s_name = lora_name if lora_name.endswith(ext) else lora_name + ext

            # Find the relative path by matching the base filename
            full_rel_path = next(
                (p for p in available_loras if p.endswith(s_name)),
                None
            )

            if full_rel_path is None:
                print(f"Warning: LoRA '{lora_name}' not found.")
                continue

            # Load LoRA file using the discovered relative path
            lora_path = folder_paths.get_full_path("loras", full_rel_path)

            if lora_path is None:
                continue

            lora = comfy.utils.load_torch_file(lora_path, safe_load=True)

            # Apply LoRA to model and clip
            model_lora, clip_lora = comfy.sd.load_lora_for_models(
                model_lora,
                clip_lora,
                lora,
                strength_model,
                strength_clip
            )
        except Exception as e:
            print(f"Error loading LoRA '{lora_name}': {e}")
            continue

    return model_lora, clip_lora


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


def extract_embeddings(prompt):
    """
    Extract embedding syntax from prompt and return cleaned prompt.
    Preserves complete embedding syntax including capitalization.
    Embeddings can be in format: embedding:name or (embedding:name)

    Args:
        prompt: Prompt string potentially containing embedding syntax

    Returns:
        Tuple of (cleaned_prompt, list_of_embeddings)
    """
    if not prompt:
        return "", []

    # Match embedding syntax like embedding:Name or (embedding:Name)
    embedding_pattern = r'\(?embedding:([^,)]+)\)?'
    embeddings = re.findall(embedding_pattern, prompt)

    # Remove embeddings from prompt (but keep spacing clean)
    cleaned = re.sub(embedding_pattern, '', prompt)
    # Clean up any double commas or spaces left behind
    cleaned = re.sub(r'\s*,\s*,\s*', ', ', cleaned)
    cleaned = re.sub(r'^\s*,\s*|\s*,\s*$', '', cleaned)

    # Return embeddings as list, preserving capitalization
    return cleaned.strip(), embeddings


def parse_prompt_to_dict(prompt, preserve_embeddings=None):
    """
    Parse prompt string into dictionary of {tag: weight}.

    Handles multiple tags in one weight group like (tag1, tag2:1.3).

    Args:
        prompt: Comma-separated prompt string
        preserve_embeddings: List of embedding names to preserve casing

    Returns:
        Dictionary mapping base tag names to their weight strings
    """
    if not prompt:
        return {}

    tag_dict = {}
    preserve_set = set()

    # Build set of lowercase embeddings for comparison
    if preserve_embeddings:
        preserve_set = {emb.lower() for emb in preserve_embeddings}

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
                tag_name = inner_tag.strip()
                tag_lower = tag_name.lower()
                # Preserve capitalization for embeddings
                if tag_lower not in preserve_set:
                    tag_name = tag_lower
                if tag_name:
                    tag_dict[tag_name] = weight
        else:
            # Check for single weighted tag like (tag:1.3)
            single_match = re.match(
                r'\(+([^:()]+):([0-9.]+)\)+',
                part
            )
            if single_match:
                tag_name = single_match.group(1).strip()
                weight = single_match.group(2)
                tag_lower = tag_name.lower()
                # Preserve capitalization for embeddings
                if tag_lower not in preserve_set:
                    tag_name = tag_lower
                tag_dict[tag_name] = weight
            else:
                # Unweighted tag
                tag_name = part.strip()
                tag_lower = tag_name.lower()
                # Preserve capitalization for embeddings
                if tag_lower not in preserve_set:
                    tag_name = tag_lower
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
            if tag.lower() not in positive_tags
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
                "character_presets": ("BOOLEAN", {
                    "default": True,
                    "tooltip": ("Enable character presets")
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

    RETURN_TYPES = ("FULL_PIPE",)
    RETURN_NAMES = ("full_pipe",)
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
        character_presets=True,
        positive="",
        negative="",
        deduplicate_tags=True
    ):
        # Extract pipe components
        model = full_pipe.get("model")
        clip = full_pipe.get("clip")
        ckpt_name = full_pipe.get("ckpt_name", "")

        # Remove comments
        positive = common.strip_comments(positive)
        negative = common.strip_comments(negative)

        # Extract LoRAs and embeddings from user prompts
        positive, positive_loras = extract_loras(positive)
        negative, _ = extract_loras(negative)
        positive, positive_embeds = extract_embeddings(positive)
        negative, negative_embeds = extract_embeddings(negative)

        # Get model preset quality tags
        model_preset_node = common.Node("ModelPresetNode")
        quality_pos, quality_neg = model_preset_node.function(
            ckpt_name=ckpt_name,
            quality_tags=quality_tags,
            embeddings=embeddings
        )

        # Extract LoRAs and embeddings from quality tags
        quality_pos, quality_pos_loras = extract_loras(quality_pos)
        quality_neg, _ = extract_loras(quality_neg)
        quality_pos, quality_pos_embeds = extract_embeddings(quality_pos)
        quality_neg, quality_neg_embeds = extract_embeddings(quality_neg)

        # Get style preset tags
        style_preset_node = common.Node("StylePresetNode")
        style_pos, style_neg = style_preset_node.function(style=style)

        # Extract LoRAs and embeddings from style tags
        style_pos, style_pos_loras = extract_loras(style_pos)
        style_neg, _ = extract_loras(style_neg)
        style_pos, style_pos_embeds = extract_embeddings(style_pos)
        style_neg, style_neg_embeds = extract_embeddings(style_neg)

        # Extract LoRAs and embeddings from trigger words
        trigger_words_clean, trigger_loras = extract_loras(trigger_words)
        trigger_words_clean, trigger_embeds = extract_embeddings(
            trigger_words_clean
        )

        # Process tag replacements
        if character_presets:
            tag_replacement_node = common.Node("CharacterReplacementNode")
            prompt, char_pos, char_neg = tag_replacement_node.function(
                input_tags=positive
            )
        else:
            prompt = positive
            char_pos = ""
            char_neg = ""

        # Process tag presets
        tag_preset_node = common.Node("TagPresetNode")
        tag_preset_pos, tag_preset_neg = tag_preset_node.function(
            text=prompt
        )

        # Extract LoRAs and embeddings from character tags
        prompt, prompt_loras = extract_loras(prompt)
        char_pos, char_pos_loras = extract_loras(char_pos)
        char_neg, _ = extract_loras(char_neg)
        prompt, prompt_embeds = extract_embeddings(prompt)
        char_pos, char_pos_embeds = extract_embeddings(char_pos)
        char_neg, char_neg_embeds = extract_embeddings(char_neg)

        # Extract LoRAs and embeddings from tag preset results
        tag_preset_pos, tag_preset_pos_loras = extract_loras(
            tag_preset_pos
        )
        tag_preset_neg, _ = extract_loras(tag_preset_neg)
        tag_preset_pos, tag_preset_pos_embeds = extract_embeddings(
            tag_preset_pos
        )
        tag_preset_neg, tag_preset_neg_embeds = extract_embeddings(
            tag_preset_neg
        )

        # Collect all embeddings to preserve their capitalization
        all_embeddings = (
            positive_embeds + negative_embeds +
            quality_pos_embeds + quality_neg_embeds +
            style_pos_embeds + style_neg_embeds +
            trigger_embeds +
            char_pos_embeds + char_neg_embeds +
            prompt_embeds +
            tag_preset_pos_embeds + tag_preset_neg_embeds
        )

        # Define prompt sources for processing
        prompt_sources = {
            'quality_pos': quality_pos,
            'quality_neg': quality_neg,
            'style_pos': style_pos,
            'style_neg': style_neg,
            'trigger': trigger_words_clean,
            'char_pos': char_pos,
            'char_neg': char_neg,
            'tag_preset_pos': tag_preset_pos,
            'tag_preset_neg': tag_preset_neg,
            'prompt_pos': prompt,
            'prompt_neg': negative
        }

        # Parse all prompts into tag dictionaries
        tag_dicts = {
            key: parse_prompt_to_dict(value, all_embeddings)
            for key, value in prompt_sources.items()
        }

        # Combine all positive tags into one set for comparison
        positive_keys = [
            'quality_pos',
            'style_pos',
            'trigger',
            'char_pos',
            'tag_preset_pos',
            'prompt_pos'
        ]

        all_positive_tags = set()
        for key in positive_keys:
            all_positive_tags.update(
                tag.lower() for tag in tag_dicts[key].keys()
            )

        # Deduplicate negative prompts if enabled
        if deduplicate_tags:
            negative_keys = [
                'quality_neg',
                'style_neg',
                'char_neg',
                'tag_preset_neg',
                'prompt_neg'
            ]

            negative_dicts = [tag_dicts[key] for key in negative_keys]
            deduped_neg_dicts = deduplicate_negative_dicts(
                all_positive_tags,
                negative_dicts
            )

            # Update tag_dicts with deduplicated versions
            for key, deduped_dict in zip(negative_keys, deduped_neg_dicts):
                tag_dicts[key] = deduped_dict

        # Reconstruct prompts from dictionaries
        reconstructed = {
            key: reconstruct_prompt_from_dict(value)
            for key, value in tag_dicts.items()
        }

        # Build positive conditioning
        multi_string_pos = common.Node("MultiStringConditioning")
        pos_cond, pos_text, lora_syntax = multi_string_pos.function(
            clip=clip,
            quality=reconstructed['quality_pos'],
            style=reconstructed['style_pos'],
            trigger=reconstructed['trigger'],
            character=reconstructed['char_pos'],
            prompt=reconstructed['tag_preset_pos'] + (
                ', ' if reconstructed['tag_preset_pos'] else ''
            ) + reconstructed['prompt_pos']
        )

        # Combine all extracted LoRAs
        all_loras = [
            positive_loras,
            quality_pos_loras,
            style_pos_loras,
            trigger_loras,
            char_pos_loras,
            tag_preset_pos_loras,
            prompt_loras,
            lora_syntax
        ]
        combined_loras = ','.join(l for l in all_loras if l)

        # Build negative conditioning
        multi_string_neg = common.Node("MultiStringConditioning")
        neg_cond, neg_text, _ = multi_string_neg.function(
            clip=clip,
            quality=reconstructed['quality_neg'],
            style=reconstructed['style_neg'],
            trigger="",
            character=reconstructed['char_neg'],
            prompt=reconstructed['tag_preset_neg'] + (
                ', ' if reconstructed['tag_preset_neg'] else ''
            ) + reconstructed['prompt_neg']
        )

        # Parse and apply LoRAs directly
        lora_list = parse_lora_syntax(combined_loras)
        model_out, clip_out = apply_loras(model, clip, lora_list)

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

        return (new_pipe,)


# Node registration
NODE_CLASS_MAPPINGS = {
    "PromptConditioningNode": PromptConditioningNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PromptConditioningNode": "Prompt (full-pipe)"
}
