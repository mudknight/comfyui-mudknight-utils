#!/usr/bin/env python3

import json
import os
import re
import random


# Default configuration templates
DEFAULT_CHARACTERS = {
    "example_character": {
        "character": "1girl, blonde hair, blue eyes",
        "top": "white shirt, red tie",
        "bottom": "black skirt, white socks",
        "neg": ""
    }
}

DEFAULT_MODELS = {
    "Pony": {
        "quality": {
            "positive": "score_9, score_8_up, score_7_up",
            "negative": "score_6, score_5, score_4"
        },
        "embeddings": {
            "positive": "",
            "negative": "negativeXL_D"
        }
    },
    "Illustrious": {
        "quality": {
            "positive": "masterpiece, best quality, very aesthetic",
            "negative": "worst quality, low quality, displeasing"
        },
        "embeddings": {
            "positive": "",
            "negative": ""
        }
    },
    "waiIllustriousSDXL_v160.safetensors": {
        "quality": {
            "positive": "",
            "negative": "",
        },
        "embeddings": {
            "positive": "",
            "negative": "",
        }
    }
}

DEFAULT_STYLES = {
    "anime": {
        "positive": "anime style, cel shaded, vibrant colors",
        "negative": "realistic, photorealistic"
    },
    "realistic": {
        "positive": "photorealistic, highly detailed, 8k uhd",
        "negative": "anime, cartoon, illustration"
    }
}

DEFAULT_WILDCARDS = {
    "example": "option1 | option2 | option3"
}

DEFAULT_TAGS = {
    "t-shirt": {
        "positive": "",
        "negative": "print shirt"
    }
}


# Shared utility functions
def strip_jsonc_comments(text):
    """
    Remove single-line and multi-line comments from JSONC text.
    Preserves comment-like content within strings.
    """
    # Remove multi-line comments /* ... */
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
    # Remove single-line comments // ...
    text = re.sub(r'//.*?$', '', text, flags=re.MULTILINE)
    return text


def ensure_config_exists(file_path, default_data):
    """
    Ensure a config file exists, creating it with default data if needed.

    Args:
        file_path: Path to the config file
        default_data: Default data to write if file doesn't exist

    Returns:
        True if file was created, False if it already existed
    """
    # Create config directory if it doesn't exist
    config_dir = os.path.dirname(file_path)
    if not os.path.exists(config_dir):
        os.makedirs(config_dir)
        print(f"Created config directory: {config_dir}")

    # Create config file if it doesn't exist
    if not os.path.exists(file_path):
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(default_data, f, indent=2, ensure_ascii=False)
            print(f"Created default config file: {file_path}")
            return True
        except Exception as e:
            print(f"Error creating config file {file_path}: {e}")
            return False

    return False


def load_jsonc_file(file_path, default_data=None):
    """
    Load and parse a JSONC file, creating it with defaults if needed.

    Args:
        file_path: Path to the JSONC file
        default_data: Default data to use if file doesn't exist

    Returns:
        Parsed JSON data or default data on error
    """
    # Ensure file exists with defaults
    if default_data is not None:
        ensure_config_exists(file_path, default_data)

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            jsonc_content = strip_jsonc_comments(content)
            return json.loads(jsonc_content)
    except FileNotFoundError:
        print(f"File not found at {file_path}")
        return default_data if default_data is not None else {}
    except json.JSONDecodeError as e:
        print(f"Error parsing JSONC: {e}")
        return default_data if default_data is not None else {}
    except Exception as e:
        print(f"Error loading file: {e}")
        return default_data if default_data is not None else {}


def load_cached_data(
        file_path, cache_dict, last_modified_key, default_data=None):
    """
    Load data from a JSONC file with caching based on modification time.

    Args:
        file_path: Path to the JSONC file
        cache_dict: Dictionary to store cached data
            (should have 'data' and 'mtime' keys)
        last_modified_key: Key to track last modification time in cache_dict
        default_data: Default data to use if file doesn't exist

    Returns:
        Cached or newly loaded data
    """
    try:
        # Ensure file exists before checking mtime
        if default_data is not None:
            ensure_config_exists(file_path, default_data)

        # Check if file has been modified
        current_mtime = os.path.getmtime(file_path)
        if current_mtime != cache_dict.get(last_modified_key, 0):
            cache_dict[last_modified_key] = current_mtime
            cache_dict['data'] = load_jsonc_file(file_path, default_data)

        return cache_dict.get(
                'data', default_data if default_data is not None else {})
    except Exception as e:
        print(f"Error checking file modification time: {e}")
        return cache_dict.get(
                'data', default_data if default_data is not None else {})


class PresetNodeBase:
    """Base class for preset nodes with common JSONC loading logic."""

    _cache = {}
    JSON_PATH = None  # Override in subclasses
    DEFAULT_DATA = None  # Override in subclasses

    @classmethod
    def load_data(cls):
        """Load and cache preset data."""
        return load_cached_data(
            cls.JSON_PATH,
            cls._cache,
            'mtime',
            cls.DEFAULT_DATA
        )

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        """Return file modification time for cache invalidation."""
        try:
            return os.path.getmtime(cls.JSON_PATH)
        except:
            return float("nan")


class CharacterPresetNode(PresetNodeBase):
    """Character preset node - outputs only strings."""

    JSON_PATH = os.path.join(
        os.path.dirname(__file__), "config", "characters.jsonc"
    )
    DEFAULT_DATA = DEFAULT_CHARACTERS

    @classmethod
    def INPUT_TYPES(cls):
        characters = cls.load_data()
        character_list = ["none"] + sorted(list(characters.keys()))

        return {
            "required": {
                "character": (character_list, {"default": "none"}),
                "use_default_outfit": ("BOOLEAN", {"default": True}),
                "use_bottom": ("BOOLEAN", {"default": True}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("positive", "negative")
    FUNCTION = "select_character"
    CATEGORY = "conditioning"

    def select_character(
        self, character, use_default_outfit, use_bottom, unique_id=None
    ):
        if character == "none":
            return ("", "")

        characters = self.load_data()
        if character not in characters:
            return ("", "")

        char_data = characters[character]

        character_tags = char_data.get("character", "")
        top = char_data.get("top", "") if use_default_outfit else ""
        bottom = (
            char_data.get("bottom", "")
            if (use_default_outfit and use_bottom)
            else ""
        )
        negative_tags = char_data.get("neg", "")

        positive_tags = ", ".join(
            filter(None, [character_tags, top, bottom])
        )

        return (positive_tags, negative_tags)


class CharacterReplacementNode(PresetNodeBase):
    """
    A ComfyUI node that replaces tags from a multiline string input based on
    a JSONC mapping file. Matched tags are output to character outputs, while
    unmatched tags go to the prompt output.
    """

    JSON_PATH = os.path.join(
        os.path.dirname(__file__), "config", "characters.jsonc"
    )
    DEFAULT_DATA = DEFAULT_CHARACTERS

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "input_tags": ("STRING", {
                    "multiline": True,
                    "default": ""
                }),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("prompt", "character_pos", "character_neg")
    FUNCTION = "process_tags"
    CATEGORY = "conditioning"

    def process_tags(self, input_tags, unique_id=None):
        if not input_tags.strip():
            return ("", "", "")

        mappings = self.load_data()
        tags = [tag.strip() for tag in input_tags.split(',') if tag.strip()]

        prompt_tags = []
        character_pos_parts = []
        character_neg_parts = []

        include_top = False
        include_bottom = False

        # First pass: identify outfit flags
        for tag in tags:
            if tag == "top":
                include_top = True
            elif tag == "bottom":
                include_bottom = True

        # Second pass: process all tags
        for tag in tags:
            if tag in mappings:
                char_data = mappings[tag]

                if isinstance(char_data, dict):
                    character_tags = char_data.get("character", "")
                    if character_tags:
                        character_pos_parts.append(character_tags)

                    neg_tags = char_data.get("neg", "")
                    if neg_tags:
                        character_neg_parts.append(neg_tags)

                    if include_top:
                        top = char_data.get("top", "")
                        if top:
                            character_pos_parts.append(top)

                    if include_bottom:
                        bottom = char_data.get("bottom", "")
                        if bottom:
                            character_pos_parts.append(bottom)

                elif isinstance(char_data, str):
                    character_pos_parts.append(char_data)

            elif tag in ("top", "bottom"):
                continue
            else:
                prompt_tags.append(tag)

        return (
            ", ".join(prompt_tags),
            ", ".join(character_pos_parts),
            ", ".join(character_neg_parts)
        )


class ModelPresetNode(PresetNodeBase):
    """Model preset node - outputs only strings."""

    JSON_PATH = os.path.join(
        os.path.dirname(__file__), "config", "models.jsonc"
    )
    DEFAULT_DATA = DEFAULT_MODELS

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "ckpt_name": ("STRING", {"default": ""}),
                "quality_tags": ("BOOLEAN", {"default": True}),
                "embeddings": ("BOOLEAN", {"default": True}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("positive", "negative")
    FUNCTION = "generate_prompts"
    CATEGORY = "conditioning"

    def generate_prompts(
        self, ckpt_name, quality_tags, embeddings, unique_id=None
    ):
        if not ckpt_name:
            return ("", "")

        model = ckpt_name.split('/')[-1]
        family = ckpt_name.split('/')[0]

        config = self.load_data()

        model_config = config.get(model) or config.get(family)
        if not model_config:
            return ("", "")

        positive_parts = []
        if quality_tags and model_config.get("quality", {}).get("positive"):
            positive_parts.append(model_config["quality"]["positive"])
        if embeddings and model_config.get("embeddings", {}).get("positive"):
            positive_parts.append(model_config["embeddings"]["positive"])

        negative_parts = []
        if quality_tags and model_config.get("quality", {}).get("negative"):
            negative_parts.append(model_config["quality"]["negative"])
        if embeddings and model_config.get("embeddings", {}).get("negative"):
            negative_parts.append(model_config["embeddings"]["negative"])

        return (", ".join(positive_parts), ", ".join(negative_parts))


class StylePresetNode(PresetNodeBase):
    """Style preset node - outputs only strings."""

    JSON_PATH = os.path.join(
        os.path.dirname(__file__), "config", "styles.jsonc"
    )
    DEFAULT_DATA = DEFAULT_STYLES

    @classmethod
    def INPUT_TYPES(cls):
        styles = cls.load_data()
        style_list = ["none"] + sorted(list(styles.keys()))

        return {
            "required": {
                "style": (style_list, {"default": "none"}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("positive", "negative")
    FUNCTION = "generate_style"
    CATEGORY = "conditioning"

    def generate_style(self, style, unique_id=None):
        if style == "none":
            return ("", "")

        styles = self.load_data()
        if style not in styles:
            return ("", "")

        style_config = styles[style]
        return (
            style_config.get("positive", ""),
            style_config.get("negative", "")
        )


class WildcardNode(PresetNodeBase):
    """
    A ComfyUI node for replacing wildcard keys with randomly selected values.
    Wildcard definitions are loaded from an external JSONC file.
    """

    JSON_PATH = os.path.join(
        os.path.dirname(__file__), "config", "wildcards.jsonc"
    )
    DEFAULT_DATA = DEFAULT_WILDCARDS

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"multiline": True, "default": ""}),
            },
            "optional": {
                "opt_string": ("STRING", {
                    "default": "",
                    "forceInput": True
                }),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("output",)
    FUNCTION = "replace_wildcards"
    CATEGORY = "conditioning"

    @classmethod
    def IS_CHANGED(cls, text, opt_string="", unique_id=None):
        """Force re-execution on each run if text is not empty."""
        if text:
            return random.random()
        return super().IS_CHANGED(text=text, opt_string=opt_string)

    def replace_wildcards(self, text, opt_string="", unique_id=None):
        if not text:
            return (opt_string,) if opt_string else ("",)

        wildcards = self.load_data()
        result = text

        for key, values_string in wildcards.items():
            if key in result:
                values = [v.strip() for v in values_string.split('|')]
                replacement = random.choice(values)
                result = result.replace(key, replacement)

        if opt_string:
            result = f"{result}, {opt_string}"

        return (result,)


class TagPresetNode(PresetNodeBase):
    """Tag preset node - outputs only strings."""

    JSON_PATH = os.path.join(
        os.path.dirname(__file__), "config", "tags.jsonc"
    )
    DEFAULT_DATA = DEFAULT_TAGS

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"multiline": True, "default": ""}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("positive", "negative")
    FUNCTION = "process_tags"
    CATEGORY = "conditioning"

    def process_tags(self, text, unique_id=None):
        if not text.strip():
            return ("", "")

        tags = self.load_data()
        text_lower = text.lower()
        input_tags = [
            t.strip() for t in text_lower.split(',') if t.strip()
        ]

        positive_parts = []
        negative_parts = []

        for trigger_tag, preset in tags.items():
            if trigger_tag.lower() in input_tags:
                pos = preset.get("positive", "")
                if pos:
                    positive_parts.append(pos)

                neg = preset.get("negative", "")
                if neg:
                    negative_parts.append(neg)

        return (", ".join(positive_parts), ", ".join(negative_parts))


NODE_CLASS_MAPPINGS = {
    "ModelPresetNode": ModelPresetNode,
    "StylePresetNode": StylePresetNode,
    "CharacterPresetNode": CharacterPresetNode,
    "CharacterReplacementNode": CharacterReplacementNode,
    "WildcardNode": WildcardNode,
    "TagPresetNode": TagPresetNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ModelPresetNode": "Model Preset",
    "StylePresetNode": "Style Preset",
    "CharacterPresetNode": "Character Preset",
    "CharacterReplacementNode": "Character Replace",
    "WildcardNode": "Wildcard passthrough",
    "TagPresetNode": "Tag Preset",
}
