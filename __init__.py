from .conditioning import *
from .pipe import *
from .seed import *
from .presets import *
from .detailer import *
from .resolution import *
from .generation import *
from .prompt import *
from .lora import *
from .save import *
from .loader import *
from .upscale import *
from .crop import *
from . import character_editor_api
from pathlib import Path

# Get full root path for nodes
PACKAGE_ROOT = Path(__file__).resolve().parent
# Define config directory for submodules
CONFIG_DIR = PACKAGE_ROOT / "config"

WEB_DIRECTORY = "web"

NODE_CLASS_MAPPINGS = {
    "MultiStringConditioning": MultiStringConditioning,
    "FullPipeLoader": FullPipeLoader,
    "FullPipeOut": FullPipeOut,
    "FullPipeIn": FullPipeIn,
    "SeedWithOverride": SeedWithOverride,
    "ModelPresetNode": ModelPresetNode,
    "StylePresetNode": StylePresetNode,
    "CharacterPresetNode": CharacterPresetNode,
    "TagReplacementNode": TagReplacementNode,
    "WildcardNode": WildcardNode,
    "DetailerNode": DetailerNode,
    "DetailerPipeNode": DetailerPipeNode,
    "MaskDetailerNode": MaskDetailerNode,
    "MaskDetailerPipeNode": MaskDetailerPipeNode,
    "ResolutionSelector": ResolutionSelector,
    "UpscaleNode": UpscaleNode,
    "CombinedUpscaleNode": CombinedUpscaleNode,
    "BaseNode": BaseNode,
    "PromptConditioningNode": PromptConditioningNode,
    "ConditionalLoraFullPipe": ConditionalLoraFullPipe,
    "SaveFullPipe": SaveFullPipe,
    "LoaderFullPipe": LoaderFullPipe,
    "SplitLoaderFullPipe": SplitLoaderFullPipe,
    "BBoxInsetAndCrop": BBoxInsetAndCrop,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MultiStringConditioning": "Multi-String Conditioning",
    "FullPipeLoader": "Full Pipe Loader",
    "FullPipeOut": "Full Pipe Out",
    "FullPipeIn": "Full Pipe In",
    "SeedWithOverride": "Seed (with Override)",
    "ModelPresetNode": "Model Preset",
    "StylePresetNode": "Style Preset",
    "CharacterPresetNode": "Character Preset",
    "TagReplacementNode": "Tag Replace",
    "WildcardNode": "Wildcard passthrough",
    "DetailerNode": "FastDetailer",
    "DetailerPipeNode": "FastDetailer (full-pipe)",
    "MaskDetailerNode": "MaskDetailer",
    "MaskDetailerPipeNode": "MaskDetailer (full-pipe)",
    "ResolutionSelector": "Resolution Selector",
    "UpscaleNode": "Upscale (full-pipe)",
    "CombinedUpscaleNode": "Upscale Image By (using Model)",
    "BaseNode": "Base (full-pipe)",
    "PromptConditioningNode": "Prompt from Presets (full-pipe)",
    "ConditionalLoraFullPipe": "Conditional Lora (full-pipe)",
    "SaveFullPipe": "Save (full-pipe)",
    "LoaderFullPipe": "Loader (full-pipe)",
    "SplitLoaderFullPipe": "Split Loader (full-pipe)",
    "BBoxInsetAndCrop": "BBox Inset and Crop",
}
