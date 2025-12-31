#!/usr/bin/env python3
"""
Pipe node for ComfyUI meant to encapsulate all pipe-oriented needs.
"""

# Define all pipe fields in one place
PIPE_FIELDS = {
    "required": {
        "model": ("MODEL",),
        "clip": ("CLIP",),
        "vae": ("VAE",),
    },
    "optional": {
        "positive": ("CONDITIONING",),
        "negative": ("CONDITIONING",),
        "positive_text": ("STRING", {"forceInput": True}),
        "negative_text": ("STRING", {"forceInput": True}),
        "ckpt_name": ("STRING", {"forceInput": True}),
        "seed": ("INT", {"forceInput": True}),
        "image": ("IMAGE",),
    }
}


def get_all_field_names():
    """Get list of all field names from PIPE_FIELDS."""
    return (list(PIPE_FIELDS["required"].keys()) +
            list(PIPE_FIELDS["optional"].keys()))


def get_all_field_types():
    """Get list of all field types in order."""
    types = []
    for field in get_all_field_names():
        if field in PIPE_FIELDS["required"]:
            types.append(PIPE_FIELDS["required"][field][0])
        else:
            types.append(PIPE_FIELDS["optional"][field][0])
    return types


class FullPipeLoader:
    """Pack inputs into a dictionary pipe."""

    @classmethod
    def INPUT_TYPES(cls):
        return PIPE_FIELDS.copy()

    RETURN_TYPES = ("FULL_PIPE",)
    RETURN_NAMES = ("full_pipe",)
    FUNCTION = "pack"
    CATEGORY = "custom/pipe"

    def pack(self, **kwargs):
        # Pack all provided kwargs into pipe dictionary
        return ({k: v for k, v in kwargs.items()},)


class FullPipeOut:
    """Unpack a dictionary pipe into individual outputs."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "full_pipe": ("FULL_PIPE",),
            }
        }

    RETURN_TYPES = ("FULL_PIPE",) + tuple(get_all_field_types())
    RETURN_NAMES = ("full_pipe",) + tuple(get_all_field_names())
    FUNCTION = "unpack"
    CATEGORY = "custom/pipe"

    def unpack(self, full_pipe):
        # Return pipe followed by all fields in order
        return tuple([full_pipe] +
                     [full_pipe.get(name) for name in get_all_field_names()])


class FullPipeIn:
    """Update specific values in the pipe without unpacking everything."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "full_pipe": ("FULL_PIPE",),
            },
            "optional": dict(list(PIPE_FIELDS["required"].items()) +
                             list(PIPE_FIELDS["optional"].items()))
        }

    RETURN_TYPES = ("FULL_PIPE",)
    RETURN_NAMES = ("full_pipe",)
    FUNCTION = "edit"
    CATEGORY = "custom/pipe"

    def edit(self, full_pipe, **kwargs):
        new_pipe = full_pipe.copy()

        for key, value in kwargs.items():
            if value is not None:
                if isinstance(value, str) and value == "":
                    continue
                new_pipe[key] = value

        return (new_pipe,)


NODE_CLASS_MAPPINGS = {
    "FullPipeLoader": FullPipeLoader,
    "FullPipeOut": FullPipeOut,
    "FullPipeIn": FullPipeIn,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "FullPipeLoader": "Full Pipe Loader",
    "FullPipeOut": "Full Pipe Out",
    "FullPipeIn": "Full Pipe In",
}
