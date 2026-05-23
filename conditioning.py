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
        inputs = NODE_FIELDS.copy()
        inputs["optional"]["mode"] = (["concatenate", "combine", "join"], {"default": "concatenate"})
        return inputs

    RETURN_TYPES = ("CONDITIONING", "STRING", "STRING")
    RETURN_NAMES = ("conditioning", "combined_text", "lora_syntax")
    FUNCTION = "concatenate_conditionings"
    CATEGORY = "mudknight/conditioning"

    def strip_comments(self, text):
        """
        Strip lines that start with # but preserve lines starting with \\#.

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
        mode = kwargs.get("mode", "concatenate")
        text_inputs = [
            kwargs.get(key, "")
            for key in NODE_FIELDS["optional"].keys()
            if key != "mode"
        ]

        text_parts = []
        all_lora_tags = []

        # Process each text input
        for text in text_inputs:
            if text and text.strip():
                # Strip comment lines first
                text = self.strip_comments(text)

                # Strip lora tags and extract them
                cleaned_text, lora_tags = self.strip_lora_tags(text)

                # Collect lora tags
                if lora_tags:
                    all_lora_tags.append(lora_tags)

                # Only add text parts if there's text left after stripping tags
                if cleaned_text:
                    text_parts.append(cleaned_text)

        # Create combined text and lora syntax strings
        combined_text = ", ".join(text_parts)
        lora_syntax = " ".join(all_lora_tags)

        # Handle join mode - join all text, then single conditioning
        if mode == "join":
            if text_parts:
                joined_text = combined_text
                tokens = clip.tokenize(joined_text)
                cond, pooled = clip.encode_from_tokens(tokens, return_pooled=True)
                return ([[cond, {"pooled_output": pooled}]], joined_text, lora_syntax)
            else:
                # Empty conditioning if no text
                tokens = clip.tokenize("")
                cond, pooled = clip.encode_from_tokens(tokens, return_pooled=True)
                return ([[cond, {"pooled_output": pooled}]], "", lora_syntax)

        # Encode all text parts
        conditionings = []
        for cleaned_text in text_parts:
            # Encode the cleaned text using CLIP
            tokens = clip.tokenize(cleaned_text)
            cond, pooled = clip.encode_from_tokens(tokens, return_pooled=True)
            conditionings.append([[cond, {"pooled_output": pooled}]])

        # If no valid conditionings, return empty conditioning
        if not conditionings:
            tokens = clip.tokenize("")
            cond, pooled = clip.encode_from_tokens(tokens, return_pooled=True)
            return ([[cond, {"pooled_output": pooled}]], "", lora_syntax)

        if mode == "combine":
            # Average the conditionings
            out = []
            num_conditionings = len(conditionings)

            for i in range(len(conditionings[0])):
                # Sum all conditionings at this batch index
                summed_cond = conditionings[0][i][0]
                summed_pooled = conditionings[0][i][1]["pooled_output"]

                for conditioning in conditionings[1:]:
                    summed_cond = summed_cond + conditioning[i][0]
                    summed_pooled = summed_pooled + conditioning[i][1]["pooled_output"]

                # Average the summed tensors
                avg_cond = summed_cond / num_conditionings
                avg_pooled = summed_pooled / num_conditionings

                out.append([avg_cond, {"pooled_output": avg_pooled}])

            conditioning_to = out
        else:
            # Start with the first conditioning (concatenate mode)
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
