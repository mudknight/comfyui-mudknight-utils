#!/usr/bin/env python3
"""
ComfyUI custom nodes package initialization.
Automatically merges NODE_CLASS_MAPPINGS from all modules.
"""

import importlib
from pathlib import Path

# Define package constants
PACKAGE_ROOT = Path(__file__).resolve().parent
CONFIG_DIR = PACKAGE_ROOT / "config"
WEB_DIRECTORY = "web"

# Modules to exclude from auto-loading
EXCLUDE_MODULES = {
    '__init__',
    'character_editor_api',  # API module, not nodes
    'common',                # Utility functions only
}

# Auto-discover and load all node modules
NODE_MODULES = []
for file in PACKAGE_ROOT.glob("*.py"):
    module_name = file.stem

    if module_name in EXCLUDE_MODULES:
        continue

    try:
        module = importlib.import_module(f'.{module_name}', __package__)

        # Only include if it has node definitions
        if hasattr(module, 'NODE_CLASS_MAPPINGS'):
            NODE_MODULES.append(module)
    except Exception as e:
        print(f"Warning: Could not load {module_name}: {e}")

# Also manually import the API module
from . import character_editor_api  # noqa: F401

# Merge NODE_CLASS_MAPPINGS from all modules
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

for module in NODE_MODULES:
    # Check for collisions
    for key in module.NODE_CLASS_MAPPINGS:
        if key in NODE_CLASS_MAPPINGS:
            raise ValueError(
                f"Duplicate node class name '{key}' found in "
                f"{module.__name__}"
            )
    NODE_CLASS_MAPPINGS.update(module.NODE_CLASS_MAPPINGS)
    
    if hasattr(module, 'NODE_DISPLAY_NAME_MAPPINGS'):
        NODE_DISPLAY_NAME_MAPPINGS.update(
            module.NODE_DISPLAY_NAME_MAPPINGS
        )

# Export for ComfyUI
__all__ = [
    'NODE_CLASS_MAPPINGS',
    'NODE_DISPLAY_NAME_MAPPINGS',
    'WEB_DIRECTORY',
]
