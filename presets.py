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


class CharacterPresetNode:
    """
    A ComfyUI node for selecting pre-defined characters with optional default
    outfits. Character data is loaded from an external JSONC file.
    """

    # Class variable to cache loaded characters
    _cache = {}

    # Path to the JSONC file (relative to this script)
    JSON_PATH = os.path.join(
            os.path.dirname(__file__), "config", "characters.jsonc")

    @classmethod
    def INPUT_TYPES(cls):
        # Load characters to get latest data
        characters = load_cached_data(
                cls.JSON_PATH, cls._cache, 'mtime', DEFAULT_CHARACTERS)
        character_list = ["none"] + sorted(list(characters.keys()))

        return {
            "required": {
                "character": (character_list, {"default": "none"}),
                "use_default_outfit": ("BOOLEAN", {"default": True}),
                "use_bottom": ("BOOLEAN", {"default": True}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("positive", "negative")
    FUNCTION = "select_character"
    CATEGORY = "conditioning"

    @classmethod
    def IS_CHANGED(
            cls, character, use_default_outfit, use_bottom, unique_id=None):
        """
        Return the file modification time to invalidate cache
        when file changes.
        """
        try:
            mtime = os.path.getmtime(cls.JSON_PATH)
            return mtime
        except:
            return float("nan")

    def select_character(
            self, character, use_default_outfit, use_bottom, unique_id=None):
        """
        Combines character tags with outfit tags based on selection.

        Args:
            character: Selected character name or "none"
            use_default_outfit: Whether to include the outfit top tags
            use_bottom: Whether to include the outfit bottom tags (only
                applies if use_default_outfit is True)
            unique_id: Hidden parameter for cache busting

        Returns:
            A tuple containing the positive tags and negative tags
        """
        if character == "none":
            return ("", "")

        # Reload character data to ensure we have the latest values
        characters = load_cached_data(
                self.JSON_PATH, self.__class__._cache,
                'mtime', DEFAULT_CHARACTERS)

        if character not in characters:
            return ("", "")

        char_data = characters[character]

        # Get character tags (required field)
        character_tags = char_data.get("character", "")

        # Get outfit parts (optional fields)
        top = char_data.get("top", "") if use_default_outfit else ""
        bottom = char_data.get("bottom", "") if (
                use_default_outfit and use_bottom) else ""

        # Get negative tags (optional field)
        negative_tags = char_data.get("neg", "")

        # Build positive tags
        positive_tags = ", ".join(filter(None, [character_tags, top, bottom]))

        return (positive_tags, negative_tags)


class TagReplacementNode:
    """
    A ComfyUI node that replaces tags from a multiline string input based on
    a JSONC mapping file. Matched tags are output to character outputs, while
    unmatched tags go to the prompt output.
    """

    # Class variable to cache loaded mappings
    _cache = {}

    # Path to the JSONC file (relative to this script)
    JSON_PATH = os.path.join(
            os.path.dirname(__file__), "config", "characters.jsonc")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "input_tags": ("STRING", {
                    "multiline": True,
                    "default": ""
                }),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("prompt", "character_pos", "character_neg", "match")
    FUNCTION = "process_tags"
    CATEGORY = "conditioning"

    @classmethod
    def IS_CHANGED(cls, input_tags, unique_id=None):
        """
        Return the file modification time to invalidate cache
        when file changes.
        """
        try:
            mtime = os.path.getmtime(cls.JSON_PATH)
            return mtime
        except:
            return float("nan")

    def process_tags(self, input_tags, unique_id=None):
        """
        Processes input tags by splitting at commas and replacing any that
        match keys in the JSONC mapping file.

        Args:
            input_tags: Multiline string containing comma-separated tags
            unique_id: Hidden parameter for cache busting

        Returns:
            A tuple containing (prompt, character_pos, character_neg)
        """
        if not input_tags.strip():
            return ("", "", "", "")

        # Reload mapping data to ensure we have the latest values
        mappings = load_cached_data(
                self.JSON_PATH, self.__class__._cache, 'mtime', {})

        # Split tags at commas and strip whitespace
        tags = [tag.strip() for tag in input_tags.split(',') if tag.strip()]

        # Lists to hold categorized tags
        prompt_tags = []
        character_pos_parts = []
        character_neg_parts = []

        # Store matching character tag
        match = None

        # Track which outfit parts to include
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
                # Tag matched a key in the JSONC
                char_data = mappings[tag]
                match = tag

                # Extract character data (matching CharacterPresetNode format)
                if isinstance(char_data, dict):
                    # Get character tags (positive)
                    character_tags = char_data.get("character", "")
                    if character_tags:
                        character_pos_parts.append(character_tags)

                    # Get negative tags
                    neg_tags = char_data.get("neg", "")
                    if neg_tags:
                        character_neg_parts.append(neg_tags)

                    # Include outfit tags if requested
                    if include_top:
                        top = char_data.get("top", "")
                        if top:
                            character_pos_parts.append(top)

                    if include_bottom:
                        bottom = char_data.get("bottom", "")
                        if bottom:
                            character_pos_parts.append(bottom)

                elif isinstance(char_data, str):
                    # Simple string mapping goes to positive
                    character_pos_parts.append(char_data)

            elif tag == "top" or tag == "bottom":
                # These are outfit flags, don't add to prompt
                continue
            else:
                # Tag didn't match, goes to prompt
                prompt_tags.append(tag)

        # Join tags with commas
        prompt_output = ", ".join(prompt_tags)
        character_pos_output = ", ".join(character_pos_parts)
        character_neg_output = ", ".join(character_neg_parts)

        return (
                prompt_output, character_pos_output,
                character_neg_output, match)


class ModelPresetNode:
    """
    A ComfyUI node for selecting model-specific quality tags and embeddings.
    Configuration is loaded from an external JSONC file.
    """

    # Class variable to cache loaded config
    _cache = {}

    # Path to the JSONC file (relative to this script)
    JSON_PATH = os.path.join(
            os.path.dirname(__file__), "config", "models.jsonc")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "ckpt_name": ("STRING", {"default": ""}),
                "quality_tags": ("BOOLEAN", {"default": True}),
                "embeddings": ("BOOLEAN", {"default": True}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("positive", "negative")
    FUNCTION = "generate_prompts"
    CATEGORY = "conditioning"

    @classmethod
    def IS_CHANGED(cls, ckpt_name, quality_tags, embeddings, unique_id=None):
        """
        Return the file modification time to invalidate cache
        when file changes.
        """
        try:
            mtime = os.path.getmtime(cls.JSON_PATH)
            return mtime
        except:
            return float("nan")

    def generate_prompts(
            self, ckpt_name, quality_tags, embeddings, unique_id=None):
        """
        Generate prompt tags based on model configuration.

        Args:
            ckpt_name: Checkpoint path (format: "model/checkpoint.safetensors")
            quality_tags: Whether to include quality tags
            embeddings: Whether to include embedding tags
            unique_id: Hidden parameter for cache busting

        Returns:
            A tuple containing the positive tags and negative tags
        """
        if not ckpt_name:
            return ("", "")

        # Parse model type from checkpoint path
        model = ckpt_name.split('/')[-1]
        family = ckpt_name.split('/')[0]

        # Load config
        config = load_cached_data(
                self.JSON_PATH, self.__class__._cache, 'mtime', DEFAULT_MODELS)

        # Use family if the full model name isn't used.
        if model in config:
            model_config = config[model]
        elif family in config:
            model_config = config[family]
        else:
            return ("", "")

        # Build positive prompt
        positive_parts = []
        if quality_tags and model_config.get("quality", {}).get("positive"):
            positive_parts.append(model_config["quality"]["positive"])
        if embeddings and model_config.get("embeddings", {}).get("positive"):
            positive_parts.append(model_config["embeddings"]["positive"])

        # Build negative prompt
        negative_parts = []
        if quality_tags and model_config.get("quality", {}).get("negative"):
            negative_parts.append(model_config["quality"]["negative"])
        if embeddings and model_config.get("embeddings", {}).get("negative"):
            negative_parts.append(model_config["embeddings"]["negative"])

        positive_output = ", ".join(positive_parts)
        negative_output = ", ".join(negative_parts)

        return (positive_output, negative_output)


class StylePresetNode:
    """
    A ComfyUI node for selecting style presets.
    Style definitions are loaded from an external JSONC file.
    """

    # Class variable to cache loaded styles
    _cache = {}

    # Path to the JSONC file (relative to this script)
    JSON_PATH = os.path.join(
            os.path.dirname(__file__), "config", "styles.jsonc")

    @classmethod
    def INPUT_TYPES(cls):
        # Load styles to get latest data
        styles = load_cached_data(
                cls.JSON_PATH, cls._cache, 'mtime', DEFAULT_STYLES)
        style_list = ["none"] + sorted(list(styles.keys()))

        return {
            "required": {
                "style": (style_list, {"default": "none"}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("positive", "negative")
    FUNCTION = "generate_style"
    CATEGORY = "conditioning"

    @classmethod
    def IS_CHANGED(cls, style, unique_id=None):
        """
        Return the file modification time to invalidate cache
        when file changes.
        """
        try:
            mtime = os.path.getmtime(cls.JSON_PATH)
            return mtime
        except:
            return float("nan")

    def generate_style(self, style, unique_id=None):
        """
        Generate style tags based on selection.

        Args:
            style: Selected style name or "none"
            unique_id: Hidden parameter for cache busting

        Returns:
            A tuple containing the positive tags and negative tags
        """
        # If none selected, return empty strings
        if style == "none":
            return ("", "")

        # Load styles
        styles = load_cached_data(
                self.JSON_PATH, self.__class__._cache, 'mtime', DEFAULT_STYLES)

        if style not in styles:
            return ("", "")

        style_config = styles[style]

        positive_output = style_config.get("positive", "")
        negative_output = style_config.get("negative", "")

        return (positive_output, negative_output)


class WildcardNode:
    """
    A ComfyUI node for replacing wildcard keys with randomly selected values.
    Wildcard definitions are loaded from an external JSONC file.
    """

    # Class variable to cache loaded wildcards
    _cache = {}

    # Path to the JSONC file (relative to this script)
    JSON_PATH = os.path.join(
            os.path.dirname(__file__), "config", "wildcards.jsonc")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"multiline": True, "default": ""}),
            },
            "optional": {
                "opt_string": ("STRING", {"default": "", "forceInput": True}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("output",)
    FUNCTION = "replace_wildcards"
    CATEGORY = "conditioning"

    @classmethod
    def IS_CHANGED(cls, text, opt_string="", unique_id=None):
        """
        Return a random value to force re-execution on each run
        if text is not empty.
        """
        if text:
            return random.random()
        try:
            mtime = os.path.getmtime(cls.JSON_PATH)
            return mtime
        except:
            return float("nan")

    def replace_wildcards(self, text, opt_string="", unique_id=None):
        """
        Replace wildcard keys in text with randomly selected values.

        Args:
            text: Input text containing wildcard keys
            opt_string: Optional string to concatenate with output
            unique_id: Hidden parameter for cache busting

        Returns:
            A tuple containing the processed text
        """
        if not text:
            return (opt_string,) if opt_string else ("",)

        # Load wildcards
        wildcards = load_cached_data(
                self.JSON_PATH, self.__class__._cache,
                'mtime', DEFAULT_WILDCARDS)

        # Replace each wildcard key with a randomly selected value
        result = text
        for key, values_string in wildcards.items():
            if key in result:
                # Split values by pipe and strip whitespace
                values = [v.strip() for v in values_string.split('|')]
                # Choose a random value
                replacement = random.choice(values)
                # Replace all instances of the key
                result = result.replace(key, replacement)

        # Concatenate with optional string if provided
        if opt_string:
            result = f"{result}, {opt_string}"

        return (result,)


class TagPresetNode:
    """
    A ComfyUI node that adds positive/negative tags based on trigger tags.
    Checks if specific tags are present in the input and adds associated
    positive and negative tags from the configuration.
    """

    # Class variable to cache loaded tags
    _cache = {}

    # Path to the JSONC file (relative to this script)
    JSON_PATH = os.path.join(
        os.path.dirname(__file__), "config", "tags.jsonc")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {
                    "multiline": True,
                    "default": ""
                }),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("positive", "negative")
    FUNCTION = "process_tags"
    CATEGORY = "conditioning"

    @classmethod
    def IS_CHANGED(cls, text, unique_id=None):
        """
        Return the file modification time to invalidate cache
        when file changes.
        """
        try:
            mtime = os.path.getmtime(cls.JSON_PATH)
            return mtime
        except:
            return float("nan")

    def process_tags(self, text, unique_id=None):
        """
        Process input text and add positive/negative tags based on matches.

        Args:
            text: Input text to scan for trigger tags
            unique_id: Hidden parameter for cache busting

        Returns:
            A tuple containing (positive_tags, negative_tags)
        """
        if not text.strip():
            return ("", "")

        # Load tag presets
        tags = load_cached_data(
            self.JSON_PATH, self.__class__._cache, 'mtime', DEFAULT_TAGS)

        # Normalize input text to lowercase for matching
        text_lower = text.lower()

        # Split into individual tags for precise matching
        input_tags = [t.strip() for t in text_lower.split(',') if t.strip()]

        # Collect matching positive and negative tags
        positive_parts = []
        negative_parts = []

        for trigger_tag, preset in tags.items():
            trigger_lower = trigger_tag.lower()

            # Check if trigger tag is in the input
            if trigger_lower in input_tags:
                # Add associated positive tags
                pos = preset.get("positive", "")
                if pos:
                    positive_parts.append(pos)

                # Add associated negative tags
                neg = preset.get("negative", "")
                if neg:
                    negative_parts.append(neg)

        # Join results
        positive_output = ", ".join(positive_parts)
        negative_output = ", ".join(negative_parts)

        return (positive_output, negative_output)


NODE_CLASS_MAPPINGS = {
    "ModelPresetNode": ModelPresetNode,
    "StylePresetNode": StylePresetNode,
    "CharacterPresetNode": CharacterPresetNode,
    "TagReplacementNode": TagReplacementNode,
    "WildcardNode": WildcardNode,
    "TagPresetNode": TagPresetNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ModelPresetNode": "Model Preset",
    "StylePresetNode": "Style Preset",
    "CharacterPresetNode": "Character Preset",
    "TagReplacementNode": "Tag Replace",
    "WildcardNode": "Wildcard passthrough",
    "TagPresetNode": "Tag Preset",
}
