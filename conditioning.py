#!/usr/bin/env python3

import re
import torch


# Node input field definitions
NODE_FIELDS = {
    "required": {
        "clip": ("CLIP",),
    },
    "optional": {
        "quality": ("STRING", {"forceInput": True}),
        "style": ("STRING", {"forceInput": True}),
        "trigger": ("STRING", {"forceInput": True}),
        "character": ("STRING", {"forceInput": True}),
        "prompt": ("STRING", {"forceInput": True}),
    }
}


class MultiStringConditioning:
    """
    A ComfyUI node that takes up to 5 string inputs and a CLIP model,
    strips out <lora:...> tags, conditions each non-empty string separately,
    and concatenates them into a single conditioning output.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return NODE_FIELDS

    RETURN_TYPES = ("CONDITIONING", "STRING", "STRING")
    RETURN_NAMES = ("conditioning", "combined_text", "lora_syntax")
    FUNCTION = "concatenate_conditionings"
    CATEGORY = "conditioning"

    def strip_comments(self, text):
        """
        Strip lines that start with # but preserve lines starting with \#.

        Args:
            text: Input text that may contain comment lines

        Returns:
            Text with comment lines removed
        """
        lines = text.split('\n')
        filtered_lines = []

        for line in lines:
            stripped = line.lstrip()
            # Keep line if it starts with \# or doesn't start with #
            if stripped.startswith('\\#'):
                # Remove the escape character
                unescaped = line.replace('\\#', '#', 1)
                filtered_lines.append(unescaped)
            elif not stripped.startswith('#'):
                filtered_lines.append(line)

        return '\n'.join(filtered_lines)

    def strip_lora_tags(self, text):
        """
        Strip <lora:...> tags from text and return both cleaned text and
        extracted tags.

        Args:
            text: Input text that may contain <lora:...> tags

        Returns:
            Tuple of (cleaned_text, lora_tags_string)
        """
        # Pattern to match <lora:name:strength> or <lora:name:model:clip>
        pattern = r'<lora:[^>]+>'
        lora_tags = re.findall(pattern, text, re.IGNORECASE)
        # Remove lora tags from text and clean up extra whitespace
        cleaned_text = re.sub(pattern, '', text, flags=re.IGNORECASE)
        cleaned_text = re.sub(r'\s+', ' ', cleaned_text).strip()

        return cleaned_text, ' '.join(lora_tags)

    def concatenate_conditionings(self, **kwargs):
        """
        Process each text input, strip LoRA tags, and concatenate the
        resulting conditionings.

        Args:
            **kwargs: Keyword arguments containing clip and text inputs

        Returns:
            Tuple containing the concatenated conditioning, combined
            text string, and extracted lora_syntax
        """
        # Extract parameters from NODE_FIELDS
        clip = kwargs.get(list(NODE_FIELDS["required"].keys())[0])
        text_inputs = [
            kwargs.get(key, "")
            for key in NODE_FIELDS["optional"].keys()
        ]

        conditionings = []
        text_parts = []
        all_lora_tags = []

        # Process each text input
        for text in text_inputs:
            # Skip empty or whitespace-only strings
            if text and text.strip():
                # Strip comment lines first
                text = self.strip_comments(text)

                # Strip lora tags and extract them
                cleaned_text, lora_tags = self.strip_lora_tags(text)

                # Collect lora tags
                if lora_tags:
                    all_lora_tags.append(lora_tags)

                # Only process if there's text left after stripping tags
                if cleaned_text:
                    # Encode the cleaned text using CLIP
                    tokens = clip.tokenize(cleaned_text)
                    cond, pooled = clip.encode_from_tokens(
                            tokens, return_pooled=True)
                    conditionings.append([[cond, {"pooled_output": pooled}]])
                    # Add to text parts for combined output
                    text_parts.append(cleaned_text)

        # Create combined text and lora syntax strings
        combined_text = ", ".join(text_parts)
        lora_syntax = " ".join(all_lora_tags)

        # If no valid conditionings, return empty conditioning
        if not conditionings:
            tokens = clip.tokenize("")
            cond, pooled = clip.encode_from_tokens(tokens, return_pooled=True)
            return ([[cond, {"pooled_output": pooled}]], "", lora_syntax)

        # Start with the first conditioning
        conditioning_to = conditionings[0]

        # Concatenate each subsequent conditioning
        for conditioning_from in conditionings[1:]:
            out = []
            cond_from = conditioning_from[0][0]

            for i in range(len(conditioning_to)):
                t1 = conditioning_to[i][0]
                # Concatenate tensors along dimension 1
                tw = torch.cat((t1, cond_from), 1)
                n = [tw, conditioning_to[i][1].copy()]
                out.append(n)

            conditioning_to = out

        return (conditioning_to, combined_text, lora_syntax)


NODE_CLASS_MAPPINGS = {
    "MultiStringConditioning": MultiStringConditioning
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MultiStringConditioning": "Multi-String Conditioning"
}
