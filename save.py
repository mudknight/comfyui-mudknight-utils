import os
import json
import numpy as np
from PIL import Image
from PIL.PngImagePlugin import PngInfo
import folder_paths
from datetime import datetime


def get_node_by_type(prompt, node_type):
    return [v for k, v in prompt.items() if v.get("class_type") == node_type]


def build_a1111_meta(pipe, prompt, w, h, model):
    p_text = pipe.get("positive_text", "")
    n_text = pipe.get("negative_text", "")
    seed = pipe.get("seed", 0)

    if not prompt:
        meta = f"{p_text}\nNegative prompt: {n_text}\n"
        # width and height here should be divided by the upscale value
        meta += f"Seed: {seed}, Size: {w}x{h}, Model: {model}"
        return meta

    lora_meta = ""
    stacker = get_node_by_type(prompt, "Lora Stacker (LoraManager)")
    if stacker:
        v_stack = stacker[0].get("inputs", {})
        loras = v_stack.get("lora_stack", [])
        for lora in loras:
            if isinstance(lora, list) and len(lora) >= 3:
                name, strength = lora[0], lora[1]
                name = name.split("/")[-1].rsplit(".", 1)[0]
                lora_meta += f"<lora:{name}:{strength}>, "

    steps, sampler, sched, cfg = "20", "euler_ancestral", "karras", "7.0"
    clip_skip = 2
    model_hash = "unknown"

    loader = get_node_by_type(prompt, "LoaderFullPipe")
    if loader:
        v_loader = loader[0].get("inputs", {})
        clip_skip = abs(v_loader.get("clip_skip", clip_skip))
        ckpt_name = v_loader.get("ckpt_name", "")
        if ckpt_name:
            import hashlib
            model_hash = hashlib.sha256(ckpt_name.encode()).hexdigest()[:10]

    base = get_node_by_type(prompt, "BaseNode")[0]
    if base:
        v = base.get("inputs", {})
        sampler = v.get("sampler_name", sampler)
        sched = v.get("scheduler", sched)
        steps = v.get("steps", steps)
        cfg = v.get("cfg", cfg)

    meta = f"{lora_meta}{p_text}\nNegative prompt: {n_text}\n"
    meta += (f"Steps: {steps}, Sampler: {sampler}, Schedule type: {sched}, "
             f"CFG scale: {cfg}, Seed: {seed}, Size: {w}x{h}, "
             f"Model hash: {model_hash}, Model: {model}, "
             f"Clip skip: {clip_skip}")

    upscale = get_node_by_type(prompt, "UpscaleNode")
    if upscale:
        v = upscale[0].get("inputs", {})
        meta += (f", Hires upscale: {v.get('scale_by')}, "
                 f"Hires steps: {v.get('steps')}, "
                 f"Denoising strength: {v.get('denoise')}, "
                 f"Hires upscaler: {v.get('upscale_model')}")

    detailers = get_node_by_type(prompt, "DetailerPipeNode")
    for i, det in enumerate(detailers):
        v = det.get("inputs", {})
        sfx = " 2nd" if i == 1 else ""
        meta += (f", ADetailer model{sfx}: {v.get('bbox_model')}, "
                 f"ADetailer confidence{sfx}: {v.get('threshold')}, "
                 f"ADetailer denoising strength{sfx}: {v.get('denoise')}")

    return meta


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


class SaveFullPipe:
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

        ckpt_name = full_pipe.get("ckpt_name", "unknown").split('/')[-1]

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
            if a1111_metadata and prompt:
                meta_text = build_a1111_meta(full_pipe, prompt, width,
                                             height, ckpt_name)
                metadata.add_text("parameters", meta_text)

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
    "SaveFullPipe": SaveFullPipe
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SaveFullPipe": "Save (Full Pipe)"
}
