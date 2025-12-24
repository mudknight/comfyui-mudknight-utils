#!/usr/bin/env python3
"""
Custom ComfyUI node that loads a checkpoint and creates a full pipe,
with optional LoRA stack application.
"""

import folder_paths
import comfy.sd
import comfy.utils
import gc


class LoaderFullPipe:
    """
    Load checkpoint and create full pipe with optional LoRA application.
    """

    # Class-level cache for loaded models
    _cache = {}
    _current_cache_key = None

    @classmethod
    def INPUT_TYPES(cls):
        ckpt_names = folder_paths.get_filename_list("checkpoints")
        ckpt_default = 'Illustrious/prefectIllustriousXL_v3.safetensors'
        if ckpt_default in ckpt_names:
            ckpt_names.insert(
                    0, ckpt_names.pop(ckpt_names.index(ckpt_default)))

        return {
            "required": {
                "ckpt_name": (ckpt_names,),
                "stop_at_clip_layer": (
                    "INT", {
                        "default": -2, "min": -24, "max": -1, "step": 1,
                        "tooltip": "CLIP skip"}
                ),
                "seed": (
                    "INT", {
                        "default": 0, "min": 0, "max": 0xffffffffffffffff,
                        "tooltip": "Seed"}
                ),
            },
            "optional": {
                "lora_stack": ("LORA_STACK",),
            }
        }

    RETURN_TYPES = ("FULL_PIPE",)
    RETURN_NAMES = ("full_pipe",)
    FUNCTION = "load"
    CATEGORY = "custom/pipe"
    DESCRIPTION = "Load checkpoint, seed, and loras into full pipe"

    def load(self, ckpt_name, stop_at_clip_layer, seed, lora_stack=None):
        # Create cache key from model-affecting parameters
        lora_key = None
        if lora_stack is not None:
            lora_key = tuple(
                tuple(item) if isinstance(item, list) else item
                for item in lora_stack
            )
        cache_key = (ckpt_name, stop_at_clip_layer, lora_key)

        # Check if we have cached model/clip/vae
        if cache_key in self._cache:
            cached = self._cache[cache_key]
            model = cached["model"]
            clip = cached["clip"]
            vae = cached["vae"]
        else:
            # Clear old cache to free RAM (keep only one model loaded)
            if self._current_cache_key is not None:
                if self._current_cache_key in self._cache:
                    del self._cache[self._current_cache_key]
                self._cache.clear()
                gc.collect()  # Force garbage collection to free RAM

            self._current_cache_key = cache_key
            # Load checkpoint directly
            ckpt_path = folder_paths.get_full_path(
                "checkpoints",
                ckpt_name
            )
            out = comfy.sd.load_checkpoint_guess_config(
                ckpt_path,
                output_vae=True,
                output_clip=True,
                embedding_directory=folder_paths.get_folder_paths(
                    "embeddings"
                )
            )
            model = out[0]
            clip = out[1]
            vae = out[2]

            # Apply CLIP layer stop
            clip = clip.clone()
            clip.clip_layer(stop_at_clip_layer)

            # Apply LoRA stack if provided
            if lora_stack is not None:
                model, clip = self._apply_lora_stack(
                    model,
                    clip,
                    lora_stack
                )

            # Cache the loaded models
            self._cache[cache_key] = {
                "model": model,
                "clip": clip,
                "vae": vae
            }

        # Pack into full pipe dictionary
        full_pipe = {
            "model": model,
            "clip": clip,
            "vae": vae,
            "ckpt_name": ckpt_name,
            "seed": seed,
        }

        return (full_pipe,)

    def _apply_lora_stack(self, model, clip, lora_stack):
        """
        Apply a stack of LoRAs to the model and clip.
        Based on ComfyUI-Easy-Use's loraStackApply implementation.
        """
        if lora_stack is None or len(lora_stack) == 0:
            return model, clip

        # Clone to avoid modifying originals
        model_lora = model
        clip_lora = clip

        for lora_params in lora_stack:
            if len(lora_params) == 3:
                lora_name, strength_model, strength_clip = lora_params
            else:
                continue

            # Skip if lora_name is None or "None"
            if lora_name in [None, "None"]:
                continue

            # Load LoRA
            lora_path = folder_paths.get_full_path("loras", lora_name)
            lora = comfy.utils.load_torch_file(
                lora_path,
                safe_load=True
            )

            # Apply LoRA to model and clip
            model_lora, clip_lora = comfy.sd.load_lora_for_models(
                model_lora,
                clip_lora,
                lora,
                strength_model,
                strength_clip
            )

        return model_lora, clip_lora


NODE_CLASS_MAPPINGS = {
    "LoaderFullPipe": LoaderFullPipe,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LoaderFullPipe": "Loader (full-pipe)",
}
