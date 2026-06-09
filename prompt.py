#!/usr/bin/env python3
"""
Custom ComfyUI node for comprehensive prompt conditioning with quality
tags, style presets, character replacement, and LoRA loading.
"""

import re
import folder_paths
import comfy.sd
import comfy.utils
import json
from pathlib import Path
from . import common

USAGE_FILE = Path(__file__).parent / "config" / "tag_usage.json"
SETTINGS_FILE = Path(__file__).parent / "config" / "autocomplete_settings.json"


def load_autocomplete_settings():
    """Load autocomplete settings from file."""
    if not SETTINGS_FILE.exists():
        return {"collect_tag_usage": True}
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading autocomplete settings: {e}")
        return {"collect_tag_usage": True}


def should_collect_tag_usage():
    """Check if tag usage collection is enabled."""
    settings = load_autocomplete_settings()
    return settings.get("collect_tag_usage", True)


def load_tag_usage():
    """Load tag usage counts from file."""
    if not USAGE_FILE.exists():
        return {}
    try:
        with open(USAGE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading tag usage: {e}")
        return {}


def save_tag_usage(usage_dict):
    """Save tag usage counts to file."""
    try:
        USAGE_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(USAGE_FILE, "w", encoding="utf-8") as f:
            json.dump(usage_dict, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving tag usage: {e}")


def increment_tag_usage(tags_dict):
    """Increment usage count for tags."""
    usage = load_tag_usage()

    for tag in tags_dict.keys():
        normalized = tag.replace("\\(", "(").replace("\\)", ")")
        normalized = normalized.lower().replace(" ", "_")
        usage[normalized] = usage.get(normalized, 0) + 1

    save_tag_usage(usage)


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

    pattern = r"<lora:([^:>]+):([0-9.-]+)(?::([0-9.-]+))?\s*>"
    matches = re.findall(pattern, lora_string, re.IGNORECASE)

    lora_list = []
    for match in matches:
        lora_name = match[0].strip()
        model_strength = float(match[1])
        clip_strength = float(match[2]) if match[2] else model_strength
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
    available_loras = folder_paths.get_filename_list("loras")

    for lora_name, strength_model, strength_clip in lora_list:
        try:
            ext = ".safetensors"
            s_name = lora_name if lora_name.endswith(ext) else lora_name + ext

            full_rel_path = next(
                (p for p in available_loras if p.endswith(s_name)), None
            )

            if full_rel_path is None:
                print(f"Warning: LoRA '{lora_name}' not found.")
                continue

            lora_path = folder_paths.get_full_path("loras", full_rel_path)
            if lora_path is None:
                continue

            lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
            model_lora, clip_lora = comfy.sd.load_lora_for_models(
                model_lora, clip_lora, lora, strength_model, strength_clip
            )
        except Exception as e:
            print(f"Error loading LoRA '{lora_name}': {e}")
            continue

    return model_lora, clip_lora


def extract_syntax(prompt, pattern, empty_return):
    """
    Generic function to extract and remove syntax patterns from prompt.

    Args:
        prompt: Prompt string
        pattern: Regex pattern to match
        empty_return: Value to return if prompt is empty

    Returns:
        Tuple of (cleaned_prompt, extracted_items)
    """
    if not prompt:
        return "", empty_return

    items = re.findall(pattern, prompt)
    cleaned = re.sub(pattern, "", prompt)
    cleaned = re.sub(r"\s*,\s*,\s*", ", ", cleaned)
    cleaned = re.sub(r"^\s*,\s*|\s*,\s*$", "", cleaned)

    return cleaned.strip(), items


def extract_loras(prompt):
    """Extract LoRA syntax from prompt."""
    cleaned, loras = extract_syntax(prompt, r"<lora:[^>]+>", "")
    return cleaned, ",".join(loras) if loras else ""


def extract_embeddings(prompt):
    """Extract embedding syntax from prompt."""
    return extract_syntax(prompt, r"\(?embedding:([^,)]+)\)?", [])


# Cache for character names to avoid repeated file reads
_character_names_cache = {"data": None, "mtime": 0}


def load_character_names():
    """Load character names from characters.jsonc with caching."""
    from pathlib import Path
    import json
    import os

    config_path = Path(__file__).parent / "config" / "characters.jsonc"

    # Check if file exists
    if not config_path.exists():
        return []

    # Check modification time
    try:
        mtime = os.path.getmtime(config_path)
        if (
            _character_names_cache["mtime"] == mtime
            and _character_names_cache["data"] is not None
        ):
            return _character_names_cache["data"]
    except OSError:
        return []

    # Load character names
    try:
        # Use the common module's load_jsonc_file if available
        try:
            from .presets import load_jsonc_file

            characters = load_jsonc_file(str(config_path), {})
        except ImportError:
            # Fallback: simple JSON load
            with open(config_path, "r", encoding="utf-8") as f:
                content = f.read()
                # Strip JSONC comments
                content = re.sub(r"/\*.*?\*/", "", content, flags=re.DOTALL)
                content = re.sub(r"//.*?$", "", content, flags=re.MULTILINE)
                characters = json.loads(content)

        # Sort by length descending to match longest names first
        char_names = sorted(characters.keys(), key=len, reverse=True)

        # Cache the results
        _character_names_cache["data"] = char_names
        _character_names_cache["mtime"] = mtime

        return char_names
    except Exception as e:
        print(f"Error loading character names: {e}")
        return []


def extract_character_triggers(prompt):
    """Extract character: triggers from prompt.

    Supports character names with colons (e.g., 'honkai: star rail' in parentheses).
    Syntax: character:name[:outfit[:part]]
    where part can be 'top' or 'bottom'
    """
    if not prompt:
        return "", []

    # Load available character names
    available_chars = load_character_names()

    # Match character syntax - capture everything after "character:" until comma/newline/end
    pattern = r"character:([^,\n]+?)(?=\s*(?:,|\n|$))"
    matches = re.finditer(pattern, prompt, re.IGNORECASE)

    characters = []
    for match in matches:
        full_text = match.group(1).strip()

        # Try to find matching character name by checking if full_text starts with it
        char_name = None
        for candidate in available_chars:
            if full_text.startswith(candidate):
                char_name = candidate
                break

        # If no exact match found, fall back to treating first component as character name
        # (for backward compatibility or when character not in config)
        if char_name is None:
            # Split by colons and take the first part as character name
            parts = full_text.split(":")
            char_name = parts[0].strip()
            remaining = ":".join(parts[1:]) if len(parts) > 1 else ""
        else:
            # Parse outfit and part from remaining text after character name
            remaining = full_text[len(char_name) :].lstrip(":").strip()

        outfit = None
        part = None

        if remaining:
            # Split remaining by colon to get outfit and part
            remaining_parts = remaining.split(":")
            if len(remaining_parts) >= 1 and remaining_parts[0].strip():
                outfit = remaining_parts[0].strip()
            if len(remaining_parts) >= 2:
                part_val = remaining_parts[1].strip().lower()
                if part_val in ["top", "bottom"]:
                    part = part_val

        characters.append((char_name, outfit, part))

    # Remove character syntax from prompt using the same pattern
    cleaned = re.sub(pattern, "", prompt, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*,\s*,\s*", ", ", cleaned)
    cleaned = re.sub(r"^\s*,\s*|\s*,\s*$", "", cleaned)

    return cleaned.strip(), characters


def extract_tag_triggers(prompt):
    """Extract tag: triggers from prompt."""
    if not prompt:
        return "", []

    pattern = r"tag:([^,\n]+?)(?=\s*(?:,|\n|$))"
    matches = re.finditer(pattern, prompt, re.IGNORECASE)

    tags = [match.group(1).strip() for match in matches]

    cleaned = re.sub(r"tag:[^,\n]+?(?=\s*(?:,|\n|$))", "", prompt, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*,\s*,\s*", ", ", cleaned)
    cleaned = re.sub(r"^\s*,\s*|\s*,\s*$", "", cleaned)

    return cleaned.strip(), tags


def extract_wildcard_triggers(prompt):
    """Extract wildcard: triggers from prompt."""
    if not prompt:
        return "", []

    pattern = r"wildcard:([^,\n]+?)(?=\s*(?:,|\n|$))"
    matches = re.finditer(pattern, prompt, re.IGNORECASE)

    wildcards = [match.group(1).strip() for match in matches]

    cleaned = re.sub(
        r"wildcard:[^,\n]+?(?=\s*(?:,|\n|$))", "", prompt, flags=re.IGNORECASE
    )
    cleaned = re.sub(r"\s*,\s*,\s*", ", ", cleaned)
    cleaned = re.sub(r"^\s*,\s*|\s*,\s*$", "", cleaned)

    return cleaned.strip(), wildcards


def parse_prompt_to_dict(prompt, preserve_embeddings=None):
    """
    Parse prompt string into dictionary of {tag: weight}.
    """
    if not prompt:
        return {}

    tag_dict = {}
    preserve_set = set()

    if preserve_embeddings:
        preserve_set = {emb.lower() for emb in preserve_embeddings}

    parts = []
    current = ""
    paren_depth = 0

    for char in prompt:
        if char == "(":
            paren_depth += 1
            current += char
        elif char == ")":
            paren_depth -= 1
            current += char
        elif char == "," and paren_depth == 0:
            parts.append(current.strip())
            current = ""
        else:
            current += char

    if current.strip():
        parts.append(current.strip())

    for part in parts:
        if not part:
            continue

        match = re.match(r"\(+([^)]+):([0-9.]+)\)+", part)
        if match:
            inner_tags = match.group(1)
            weight = match.group(2)

            for inner_tag in inner_tags.split(","):
                tag_name = inner_tag.strip()
                tag_lower = tag_name.lower()
                if tag_lower not in preserve_set:
                    tag_name = tag_lower
                if tag_name:
                    tag_dict[tag_name] = weight
        else:
            single_match = re.match(r"\(+([^:()]+):([0-9.]+)\)+", part)
            if single_match:
                tag_name = single_match.group(1).strip()
                weight = single_match.group(2)
                tag_lower = tag_name.lower()
                if tag_lower not in preserve_set:
                    tag_name = tag_lower
                tag_dict[tag_name] = weight
            else:
                tag_name = part.strip()
                tag_lower = tag_name.lower()
                if tag_lower not in preserve_set:
                    tag_name = tag_lower
                if tag_name:
                    tag_dict[tag_name] = "1.0"

    return tag_dict


def reconstruct_prompt_from_dict(tag_dict):
    """Reconstruct prompt string from tag dictionary."""
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
    """Remove tags from negative dicts if they appear in positive tags."""
    deduplicated = []

    for neg_dict in negative_dicts:
        filtered_dict = {
            tag: weight
            for tag, weight in neg_dict.items()
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
        from nodes import NODE_CLASS_MAPPINGS

        style_preset_cls = NODE_CLASS_MAPPINGS.get("StylePresetNode")

        if style_preset_cls:
            style_inputs = style_preset_cls.INPUT_TYPES()
            style_list = style_inputs["required"]["style"][0]
        else:
            style_list = ["none"]

        return {
            "required": {
                "full_pipe": ("FULL_PIPE",),
            },
            "optional": {
                "trigger_words": ("STRING", {"forceInput": True}),
                "style": (style_list, {"default": "none"}),
                "quality_tags": ("BOOLEAN", {"default": True}),
                "embeddings": ("BOOLEAN", {"default": True}),
                "character_presets": ("BOOLEAN", {"default": True}),
                "mode": (
                    ["concatenate", "combine", "join"],
                    {"default": "concatenate"},
                ),
                "positive": ("STRING", {"multiline": True, "default": ""}),
                "negative": ("STRING", {"multiline": True, "default": ""}),
                "deduplicate_tags": ("BOOLEAN", {"default": True}),
            },
        }

    RETURN_TYPES = ("FULL_PIPE",)
    RETURN_NAMES = ("full_pipe",)
    FUNCTION = "process"
    CATEGORY = "mudknight/prompt"
    DESCRIPTION = (
        "Prompt node that conditions positive and negative text. "
        "Lines commented with # are stripped. "
        "Accepts LoRA syntax with <lora:file.safetensors:strength>. "
        "Model and CLIP strength can both be specified with another colon. "
        "Uses quality tags, embeddings, styles, characters, and tags from "
        "Preset Manager."
    )

    def process(
        self,
        full_pipe,
        trigger_words="",
        style="none",
        quality_tags=True,
        embeddings=True,
        character_presets=True,
        mode="concatenate",
        positive="",
        negative="",
        deduplicate_tags=True,
    ):
        model = full_pipe.get("model")
        clip = full_pipe.get("clip")
        ckpt_name = full_pipe.get("ckpt_name", "")

        positive = common.strip_comments(positive)
        negative = common.strip_comments(negative)

        # Get preset outputs
        model_preset_node = common.Node("ModelPresetNode")
        quality_pos, quality_neg = model_preset_node.function(
            ckpt_name=ckpt_name, quality_tags=quality_tags, embeddings=embeddings
        )

        style_preset_node = common.Node("StylePresetNode")
        style_pos, style_neg = style_preset_node.function(style=style)

        # Process character triggers
        prompt, character_triggers = extract_character_triggers(positive)
        char_pos, char_neg = self._process_character_triggers(
            character_triggers, character_presets
        )

        # Process tag triggers
        prompt, tag_triggers = extract_tag_triggers(prompt)
        tag_preset_pos, tag_preset_neg = self._process_tag_triggers(tag_triggers)

        # Process wildcard triggers
        prompt, wildcard_triggers = extract_wildcard_triggers(prompt)
        wildcard_text = self._process_wildcard_triggers(wildcard_triggers)

        # Define all text sources
        text_sources = {
            "quality_pos": quality_pos,
            "quality_neg": quality_neg,
            "style_pos": style_pos,
            "style_neg": style_neg,
            "trigger": trigger_words,
            "char_pos": char_pos,
            "char_neg": char_neg,
            "tag_preset_pos": tag_preset_pos,
            "tag_preset_neg": tag_preset_neg,
            "wildcard": wildcard_text,
            "prompt_pos": prompt,
            "prompt_neg": negative,
        }

        # Extract LoRAs and embeddings from all sources
        cleaned_sources, all_loras, all_embeddings = self._extract_all_syntax(
            text_sources
        )

        # Parse into tag dictionaries
        tag_dicts = {
            key: parse_prompt_to_dict(value, all_embeddings)
            for key, value in cleaned_sources.items()
        }

        # Deduplicate negatives
        if deduplicate_tags:
            tag_dicts = self._deduplicate_negatives(tag_dicts)

        # Track usage
        if should_collect_tag_usage():
            self._track_usage(tag_dicts)

        # Reconstruct prompts
        reconstructed = {
            key: reconstruct_prompt_from_dict(value) for key, value in tag_dicts.items()
        }

        # Build conditioning
        pos_cond, pos_text, neg_cond, neg_text = self._build_conditioning(
            clip, reconstructed, mode
        )

        # Apply LoRAs
        combined_loras = ",".join(filter(None, all_loras))
        lora_list = parse_lora_syntax(combined_loras)
        model_out, clip_out = apply_loras(model, clip, lora_list)

        # Re-attach lora syntax to pos_text for a1111 compatibility
        if combined_loras:
            lora_tags = " ".join(
                f"<lora:{name}:{ms}>"
                if ms == cs else f"<lora:{name}:{ms}:{cs}>"
                for name, ms, cs in lora_list
            )
            meta_pos_text = (
                lora_tags + ", " + pos_text if pos_text else lora_tags
            )
        else:
            meta_pos_text = pos_text

        new_pipe = full_pipe.copy()
        new_pipe.update(
            {
                "model": model_out,
                "clip": clip_out,
                "positive": pos_cond,
                "negative": neg_cond,
                "meta": {
                    **full_pipe.get("meta", {}),
                    "positive_text": meta_pos_text,
                    "negative_text": neg_text,
                },
            }
        )

        return (new_pipe,)

    def _process_character_triggers(self, triggers, enabled):
        """Process character triggers and return positive/negative strings."""
        if not enabled or not triggers:
            return "", ""

        from nodes import NODE_CLASS_MAPPINGS

        character_preset_node = NODE_CLASS_MAPPINGS.get("CharacterPresetNode")
        if not character_preset_node:
            return "", ""

        char_pos_parts = []
        char_neg_parts = []

        for char_name, outfit, part in triggers:
            lookup_name = char_name.replace("_", " ")
            char_instance = character_preset_node()

            if outfit is None:
                use_top, use_bottom = False, False
            elif part == "top":
                use_top, use_bottom = True, False
            elif part == "bottom":
                use_top, use_bottom = False, True
            else:
                use_top, use_bottom = True, True

            pos, neg = char_instance.select_character(lookup_name, use_top, use_bottom)
            if pos:
                char_pos_parts.append(pos)
            if neg:
                char_neg_parts.append(neg)

        return ", ".join(char_pos_parts), ", ".join(char_neg_parts)

    def _process_tag_triggers(self, triggers):
        """Process tag triggers and return positive/negative strings."""
        if not triggers:
            return "", ""

        tag_names_text = ", ".join(tag_name.replace("_", " ") for tag_name in triggers)
        tag_preset_node = common.Node("TagPresetNode")
        return tag_preset_node.function(text=tag_names_text)

    def _process_wildcard_triggers(self, triggers):
        """Process wildcard triggers and return expanded text."""
        if not triggers:
            return ""

        wildcard_names = ", ".join(wc.replace("_", " ") for wc in triggers)
        wildcard_node = common.Node("WildcardNode")
        return wildcard_node.function(text=wildcard_names)[0]

    def _extract_all_syntax(self, text_sources):
        """
        Extract LoRAs and embeddings from all text sources.

        Returns:
            Tuple of (cleaned_sources, lora_list, embedding_list)
        """
        cleaned = {}
        loras = []
        embeddings = []

        for key, text in text_sources.items():
            text, lora_str = extract_loras(text)
            text, embeds = extract_embeddings(text)

            cleaned[key] = text
            if lora_str:
                loras.append(lora_str)
            embeddings.extend(embeds)

        return cleaned, loras, embeddings

    def _deduplicate_negatives(self, tag_dicts):
        """Deduplicate negative prompts against positives."""
        positive_keys = [
            "quality_pos",
            "style_pos",
            "trigger",
            "char_pos",
            "tag_preset_pos",
            "prompt_pos",
        ]
        negative_keys = [
            "quality_neg",
            "style_neg",
            "char_neg",
            "tag_preset_neg",
            "prompt_neg",
        ]

        all_positive_tags = set()
        for key in positive_keys:
            all_positive_tags.update(tag.lower() for tag in tag_dicts[key].keys())

        negative_dicts = [tag_dicts[key] for key in negative_keys]
        deduped_neg_dicts = deduplicate_negative_dicts(
            all_positive_tags, negative_dicts
        )

        for key, deduped_dict in zip(negative_keys, deduped_neg_dicts):
            tag_dicts[key] = deduped_dict

        return tag_dicts

    def _track_usage(self, tag_dicts):
        """Track tag usage for autocomplete."""
        try:
            positive_keys = [
                "quality_pos",
                "style_pos",
                "trigger",
                "char_pos",
                "tag_preset_pos",
                "prompt_pos",
            ]
            all_tags_used = {}
            for key in positive_keys:
                all_tags_used.update(tag_dicts[key])
            increment_tag_usage(all_tags_used)
        except Exception as e:
            print(f"Tag usage tracking error: {e}")

    def _build_conditioning(self, clip, reconstructed, mode="concatenate"):
        """Build positive and negative conditioning."""
        if mode == "join":
            # Use standard CLIPTextEncode for join mode to ensure compatibility
            pos_text = ", ".join(
                filter(
                    None,
                    [
                        reconstructed["quality_pos"],
                        reconstructed["style_pos"],
                        reconstructed["trigger"],
                        reconstructed["char_pos"],
                        reconstructed["tag_preset_pos"],
                        reconstructed["wildcard"],
                        reconstructed["prompt_pos"],
                    ],
                )
            )
            neg_text = ", ".join(
                filter(
                    None,
                    [
                        reconstructed["quality_neg"],
                        reconstructed["style_neg"],
                        reconstructed["char_neg"],
                        reconstructed["tag_preset_neg"],
                        reconstructed["prompt_neg"],
                    ],
                )
            )

            encoder = common.Node("CLIPTextEncode")
            pos_cond = encoder.function(clip=clip, text=pos_text)[0]
            neg_cond = encoder.function(clip=clip, text=neg_text)[0]

            return pos_cond, pos_text, neg_cond, neg_text

        multi_string_pos = common.Node("MultiStringConditioning")
        pos_cond, pos_text, lora_syntax = multi_string_pos.function(
            clip=clip,
            quality=reconstructed["quality_pos"],
            style=reconstructed["style_pos"],
            trigger=reconstructed["trigger"],
            character=reconstructed["char_pos"],
            mode=mode,
            prompt=(
                reconstructed["tag_preset_pos"]
                + (", " if reconstructed["tag_preset_pos"] else "")
                + reconstructed["wildcard"]
                + (", " if reconstructed["wildcard"] else "")
                + reconstructed["prompt_pos"]
            ),
        )

        multi_string_neg = common.Node("MultiStringConditioning")
        neg_cond, neg_text, _ = multi_string_neg.function(
            clip=clip,
            quality=reconstructed["quality_neg"],
            style=reconstructed["style_neg"],
            trigger="",
            character=reconstructed["char_neg"],
            mode=mode,
            prompt=(
                reconstructed["tag_preset_neg"]
                + (", " if reconstructed["tag_preset_neg"] else "")
                + reconstructed["prompt_neg"]
            ),
        )

        return pos_cond, pos_text, neg_cond, neg_text


class SimplePromptNode:
    """
    Simpler version of PromptConditioningNode.
    Functions as 2 CLIPTextEncode nodes with comment removal and LoRA syntax parsing.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "full_pipe": ("FULL_PIPE",),
            },
            "optional": {
                "trigger_words": ("STRING", {"forceInput": True, "default": ""}),
                "positive": ("STRING", {"multiline": True, "default": ""}),
                "negative": ("STRING", {"multiline": True, "default": ""}),
                "negative_to_negpip": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Invert weights and use tags in positive prompt"
                }),
            },
        }

    RETURN_TYPES = ("FULL_PIPE",)
    RETURN_NAMES = ("full_pipe",)
    FUNCTION = "process"
    CATEGORY = "mudknight/prompt"
    DESCRIPTION = (
        "Simple prompt node that conditions positive and negative text. "
        "Lines commented with # are stripped. "
        "Accepts LoRA syntax with <lora:file.safetensors:strength>. "
        "Model and CLIP strength can both be specified with another colon. "
        "Negative to NegPip uses an empty negative prompt and moves negative "
        "tags to the positive prompt with inverted weights."
    )

    def process(
        self,
        full_pipe,
        trigger_words="",
        positive="",
        negative="",
        negative_to_negpip=False,
    ):
        model = full_pipe.get("model")
        clip = full_pipe.get("clip")

        # 1. Remove commented lines
        positive = common.strip_comments(positive)
        negative = common.strip_comments(negative)

        # Strip newlines
        positive = positive.replace("\n", "")
        negative = negative.replace("\n", "")

        # 2. Append trigger_words to the end of the positive string
        if trigger_words and trigger_words.strip():
            if positive and not positive.strip().endswith(","):
                positive = positive.rstrip() + ", " + trigger_words.strip()
            else:
                positive = positive + trigger_words.strip()

        # 3. Capture metadata text before lora extraction so lora
        # syntax is preserved in meta (for a1111 compatibility).
        # Negative is captured after extraction (no loras expected).
        metadata_pos_text = positive

        # 4. Extract LoRAs and embeddings (lora syntax parsing)
        cleaned_sources, loras, embeds = self._extract_syntax(
            {"pos": positive, "neg": negative}
        )

        metadata_neg_text = cleaned_sources["neg"]

        # 5. Handle Negpip conversion for conditioning
        cond_pos = cleaned_sources["pos"]
        cond_neg = metadata_neg_text

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

        # 6. CLIP Text Encoding
        encoder = common.Node("CLIPTextEncode")
        pos_cond = encoder.function(clip=clip, text=cond_pos)[0]
        neg_cond = encoder.function(clip=clip, text=cond_neg)[0]

        # 7. Apply LoRAs
        combined_loras = ",".join(filter(None, loras))
        lora_list = parse_lora_syntax(combined_loras)
        model_out, clip_out = apply_loras(model, clip, lora_list)

        new_pipe = full_pipe.copy()
        new_pipe.update(
            {
                "model": model_out,
                "clip": clip_out,
                "positive": pos_cond,
                "negative": neg_cond,
                "meta": {
                    **full_pipe.get("meta", {}),
                    "positive_text": metadata_pos_text,
                    "negative_text": metadata_neg_text,
                },
            }
        )

        return (new_pipe,)

    def _extract_syntax(self, text_sources):
        cleaned = {}
        loras = []
        for key, text in text_sources.items():
            text, lora_str = extract_loras(text)
            # We don't necessarily need to extract embeddings since CLIPTextEncode handles them,
            # but extract_loras is necessary for the LoRA application logic.
            cleaned[key] = text
            if lora_str:
                loras.append(lora_str)
        return cleaned, loras, []


class LoraExtractNode:
    """
    Strips LoRA syntax from a string, applies the LoRAs to the model
    and clip, and returns the cleaned string.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "string": ("STRING", {"forceInput": True}),
            },
        }

    RETURN_TYPES = ("MODEL", "CLIP", "STRING")
    RETURN_NAMES = ("model", "clip", "string")
    FUNCTION = "process"
    CATEGORY = "mudknight/prompt"
    DESCRIPTION = (
        "Strips LoRA syntax from the input string, applies the LoRAs "
        "to model and clip, and outputs the cleaned string."
    )

    def process(self, model, clip, string):
        # Remove lora tags and collect lora string
        cleaned, lora_str = extract_loras(string)

        # Parse and apply any found LoRAs
        lora_list = parse_lora_syntax(lora_str)
        model_out, clip_out = apply_loras(model, clip, lora_list)

        return (model_out, clip_out, cleaned)


NODE_CLASS_MAPPINGS = {
    "PromptConditioningNode": PromptConditioningNode,
    "SimplePromptNode": SimplePromptNode,
    "LoraExtractNode": LoraExtractNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PromptConditioningNode": "Prompt (full-pipe)",
    "SimplePromptNode": "Simple Prompt (full-pipe)",
    "LoraExtractNode": "Lora Extract",
}
