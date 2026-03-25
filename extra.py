"""
ControlNet node for ComfyUI with full pipe support.
"""

import folder_paths
import comfy.controlnet


class ApplyControlNetPipe:
    """
    Load and apply ControlNet to conditioning. If no image is provided,
    pass through the full_pipe unchanged.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "full_pipe": ("FULL_PIPE",),
            },
            "optional": {
                "control_net_name":
                (folder_paths.get_filename_list("controlnet"),),
                "image": ("IMAGE",),
                "strength": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.0, "max": 10.0, "step": 0.01},
                ),
                "start_percent": (
                    "FLOAT",
                    {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.001},
                ),
                "end_percent": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.001},
                ),
            },
        }

    RETURN_TYPES = ("FULL_PIPE", "IMAGE")
    RETURN_NAMES = ("full_pipe", "image")
    FUNCTION = "apply_controlnet"
    CATEGORY = "custom/controlnet"
    DESCRIPTION = "Load and apply ControlNet to full pipe"

    def apply_controlnet(
        self,
        full_pipe,
        control_net_name=None,
        image=None,
        strength=1.0,
        start_percent=0.0,
        end_percent=1.0,
    ):
        if image is None or not control_net_name:
            return (full_pipe, image)

        control_net_path = folder_paths.get_full_path(
            "controlnet", control_net_name)
        control_net = comfy.controlnet.load_controlnet(control_net_path)

        positive = full_pipe.get("positive")

        if positive is not None and strength > 0:
            control_hint = image.movedim(-1, 1)
            new_positive = []
            for t in positive:
                n = [t[0], t[1].copy()]
                c_net = control_net.copy().set_cond_hint(
                    control_hint, strength, (start_percent, end_percent)
                )
                if "control" in t[1]:
                    c_net.set_previous_controlnet(t[1]["control"])
                n[1]["control"] = c_net
                n[1]["control_apply_to_uncond"] = True
                new_positive.append(n)
            positive = new_positive

        new_pipe = full_pipe.copy()
        new_pipe["positive"] = positive

        return (new_pipe, image)


NODE_CLASS_MAPPINGS = {
    "ApplyControlNetPipe": ApplyControlNetPipe,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ApplyControlNetPipe": "Apply ControlNet (full-pipe)",
}
