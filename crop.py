#!/usr/bin/env python3


class BBoxInsetAndCrop:
    """
    Insets a bounding box by specified pixels and crops the corresponding
    edges from the crop image. Useful for detailer workflows to remove
    edge artifacts before uncropping.
    """

    @classmethod
    def INPUT_TYPES(cls):
        """Define input parameters for the node."""
        return {
            "required": {
                "crop_image": ("IMAGE",),
                "bbox": ("BBOX",),
                "inset_pixels": (
                    "INT",
                    {
                        "default": 8,
                        "min": 0,
                        "max": 512,
                        "step": 1,
                    },
                ),
            }
        }

    RETURN_TYPES = ("IMAGE", "BBOX")
    RETURN_NAMES = ("cropped_image", "inset_bbox")
    FUNCTION = "inset_and_crop"
    CATEGORY = "image/bbox"

    def inset_and_crop(self, crop_image, bbox, inset_pixels):
        """
        Inset the bbox and crop the edges of crop_image.

        Args:
            crop_image: Tensor of shape (B, H, W, C)
            bbox: Tuple of (x, y, width, height) or nested structure
            inset_pixels: Number of pixels to inset on each side

        Returns:
            Tuple of (cropped_image, inset_bbox)
        """
        # Handle nested bbox structure and preserve original format
        bbox_was_nested = False
        if isinstance(bbox, (tuple, list)) and len(bbox) == 1:
            bbox_was_nested = True
            bbox = bbox[0]

        x, y, width, height = bbox

        # Calculate inset amount (cannot exceed half the dimension)
        inset_x = min(inset_pixels, width // 2)
        inset_y = min(inset_pixels, height // 2)

        # Calculate new bbox with inset applied
        new_x = x + inset_x
        new_y = y + inset_y
        new_width = width - (inset_x * 2)
        new_height = height - (inset_y * 2)

        # Ensure dimensions are at least 1 pixel
        new_width = max(1, new_width)
        new_height = max(1, new_height)

        inset_bbox = (new_x, new_y, new_width, new_height)

        # Wrap back in same format as input if it was nested
        if bbox_was_nested:
            inset_bbox = (inset_bbox,)

        # Crop the image edges corresponding to the inset
        # crop_image shape: (B, H, W, C)
        cropped = crop_image[
            :,
            inset_y:inset_y + new_height,
            inset_x:inset_x + new_width,
            :
        ]

        return (cropped, inset_bbox)


NODE_CLASS_MAPPINGS = {
    "BBoxInsetAndCrop": BBoxInsetAndCrop,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BBoxInsetAndCrop": "BBox Inset and Crop",
}
