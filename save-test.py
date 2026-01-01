import os
import json
import numpy as np
from PIL import Image
from PIL.PngImagePlugin import PngInfo
import folder_paths
from datetime import datetime


def replace_variables(text, full_pipe, width, height, timestamp):
    """
    Replace variables in text with actual values.

    Args:
        text: String containing variables like %date, %time, etc.
        full_pipe: Dictionary containing pipe data
        width: Image width
        height: Image height
        timestamp: datetime object for consistent timestamps

    Returns:
        String with variables replaced
    """
    ckpt_name = full_pipe.get('ckpt_name', 'unknown')
    if '/' in ckpt_name:
        ckpt_name = ckpt_name.split('/')[-1]

    replacements = {
        '%date': timestamp.strftime('%Y-%m-%d'),
        '%time': timestamp.strftime('%Y-%m-%d-%H%M%S'),
        '%model': ckpt_name,
        '%width': str(width),
        '%height': str(height),
        '%seed': str(full_pipe.get('seed', 0)),
    }

    result = text
    for var, value in replacements.items():
        result = result.replace(var, value)

    return result


class SaveFullPipeTest:
    """
    Save image from FULL_PIPE with metadata and display preview.
    """

    @classmethod
    def INPUT_TYPES(cls):
        tooltip = (
            "Available variables: %date, %time, %model, "
            "%width, %height, %seed"
        )

        return {
            "required": {
                "full_pipe": ("FULL_PIPE",),
                "filename_prefix": (
                    "STRING",
                    {
                        "default": "%time_%seed",
                        "tooltip": tooltip
                    }
                ),
                "path": (
                    "STRING",
                    {
                        "default": "%date",
                        "tooltip": tooltip
                    }
                ),
                "extension": (
                    ["png", "jpg", "jpeg", "webp"], {"default": "png"}),
                "a1111_metadata": ("BOOLEAN", {"default": True}),
                "comfyui_workflow": ("BOOLEAN", {"default": True}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO"
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    OUTPUT_NODE = True
    FUNCTION = "save_images"
    CATEGORY = "custom/pipe"

    def save_images(
        self,
        full_pipe,
        filename_prefix,
        path,
        extension,
        a1111_metadata,
        comfyui_workflow,
        prompt=None,
        extra_pnginfo=None
    ):
        # Extract data from pipe
        image = full_pipe.get("image")
        if image is None:
            return {"ui": {"text": ["No image in pipe"]}}

        positive_text = full_pipe.get("positive_text", "")
        negative_text = full_pipe.get("negative_text", "")
        ckpt_name = full_pipe.get("ckpt_name", "unknown").split('/')[-1]
        seed = full_pipe.get("seed", 0)

        # Get image dimensions
        batch_size = image.shape[0]
        height = image.shape[1]
        width = image.shape[2]

        # Create consistent timestamp for this batch
        timestamp = datetime.now()

        # Replace variables in path
        path = replace_variables(
            path, full_pipe, width, height, timestamp
        )

        # Create output directory
        output_dir = folder_paths.get_output_directory()
        if path:
            output_dir = os.path.join(output_dir, path)
        os.makedirs(output_dir, exist_ok=True)

        results = []
        for i, img_tensor in enumerate(image):
            # Convert tensor to PIL Image
            img_array = (
                255.0 * img_tensor.cpu().numpy()
            ).astype(np.uint8)
            pil_image = Image.fromarray(img_array)

            # Replace variables in filename
            filename = replace_variables(
                filename_prefix, full_pipe, width, height, timestamp
            )
            if batch_size > 1:
                filename = f"{filename}_{i:04d}"
            filename = f"{filename}.{extension}"

            # Prepare metadata
            metadata = PngInfo()

            # Create A1111-style parameters text
            if a1111_metadata:
                params_text = positive_text
                if negative_text:
                    params_text += f"\nNegative prompt: {negative_text}"
                params_text += (
                    f"\nSteps: unknown, Sampler: unknown, "
                    f"CFG scale: unknown, Seed: {seed}, "
                    f"Size: {width}x{height}, "
                    f"Model: {ckpt_name}, Version: ComfyUI"
                )
                metadata.add_text("parameters", params_text)

            # Embed workflow if requested (PNG only)
            # IMPORTANT: workflow must come before prompt
            if comfyui_workflow and extension == "png":
                if extra_pnginfo is not None:
                    for key, value in extra_pnginfo.items():
                        metadata.add_text(
                            key,
                            json.dumps(value)
                        )
                if prompt is not None:
                    metadata.add_text(
                        "prompt",
                        json.dumps(prompt)
                    )

            # Save image
            filepath = os.path.join(output_dir, filename)
            save_kwargs = {}

            if extension == "png":
                save_kwargs["pnginfo"] = metadata
                save_kwargs["compress_level"] = 4

            elif extension in {"jpg", "jpeg"}:
                save_kwargs["quality"] = 95

            elif extension == "webp":
                save_kwargs["quality"] = 95
                save_kwargs["method"] = 6

            pil_image.save(filepath, **save_kwargs)

            results.append({
                "filename": filename,
                "subfolder": path,
                "type": "output"
            })

        # Return preview images
        return {
            "ui": {"images": results},
            "result": (image,)
        }


# Node registration
NODE_CLASS_MAPPINGS = {
    "SaveFullPipeTest": SaveFullPipeTest
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SaveFullPipeTest": "Save Test (Full Pipe)"
}
