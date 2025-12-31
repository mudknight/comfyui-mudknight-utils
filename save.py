

class SaveFullPipe:
    """Save image from pipe with metadata and preview."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "full_pipe": ("FULL_PIPE",),
                "filename_prefix": (
                    "STRING", {
                        "default": "%time_%seed",
                        "tooltip": (
                            "filename (available variables: %date, %time, "
                            "%model, %width, %height, %seed, %counter, "
                            "%sampler_name, %steps, %cfg, %scheduler, "
                            "%basemodelname, %denoise, %clip_skip)")
                        }
                ),
                "path": ("STRING", {
                    "default": "%date",
                    "tooltip": (
                        "path to save the images "
                        "(under Comfy's save directory)")
                    }),
                "extension": (["png", "jpg", "jpeg", "webp", "tiff"], {
                    "tooltip": "file extension/type to save image as"
                    }),
                "a1111_metadata": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Save a1111-formatted metadata to image"
                    }),
                "comfyui_workflow": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Save ComfyUI workflow to image"
                    }),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    OUTPUT_NODE = True
    FUNCTION = "save_image"
    CATEGORY = "custom/pipe"

    def save_image(
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

        positive_text = full_pipe.get("positive_text", "")\
            if a1111_metadata else ""
        negative_text = full_pipe.get("negative_text", "")\
            if a1111_metadata else ""
        ckpt_name = full_pipe.get("ckpt_name", "unknown")\
            if a1111_metadata else ""
        seed = full_pipe.get("seed", 0) if a1111_metadata else 0

        # Get image dimensions
        height = image.shape[1]
        width = image.shape[2]

        # Get Image Saver node class
        from nodes import NODE_CLASS_MAPPINGS
        image_saver_class = NODE_CLASS_MAPPINGS.get("Image Saver")
        if image_saver_class is None:
            return {"ui": {"text": ["Image Saver node not found"]}}

        # Create Image Saver instance
        image_saver = image_saver_class()

        # Call the Image Saver function dynamically
        fn_name = image_saver.FUNCTION
        fn = getattr(image_saver, fn_name)

        # Save the image using Image Saver
        save_result = fn(
            image,                 # images (required)
            filename_prefix,       # filename
            path,                  # path
            extension,             # extension
            20,               # steps
            7.0,                   # cfg
            ckpt_name,             # modelname
            "",                    # sampler_name
            "normal",              # scheduler_name
            positive_text,         # positive
            negative_text,         # negative
            seed,                  # seed_value
            width,                 # width
            height,                # height
            True,                  # lossless_webp
            100,                   # quality_jpeg_or_webp
            False,                 # optimize_png
            0,                     # counter
            1.0,                   # denoise
            0,                     # clip_skip
            "%Y-%m-%d-%H%M%S",     # time_format
            False,                 # save_workflow_as_json
            True,        # embed_workflow
            "",                    # additional_hashes
            False,                  # download_civitai_data
            False,                  # easy_remix
            True,                  # show_preview
            "",                    # custom
            prompt if comfyui_workflow else None,       # hidden: prompt
            extra_pnginfo if comfyui_workflow else {},  # hidden: extra_pnginfo
            )

        return {
            "ui": save_result.get("ui", {}),
            "result": (image,)
        }


NODE_CLASS_MAPPINGS = {
    "SaveFullPipe": SaveFullPipe,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SaveFullPipe": "Save (full-pipe)",
}
