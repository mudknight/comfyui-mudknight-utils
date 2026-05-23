import os
import torch
import folder_paths


def return_preview(return_tuple, preview_image):
    """Run PreviewImage and return ui + result for all renderer types."""
    preview = Node("PreviewImage")
    preview_result = preview.function(preview_image)
    return {
        "ui": preview_result.get("ui", {}),
        "result": return_tuple,
    }


def detect_model_type(model):
    """ Detect model type (SDXL, SD1, SVD) based on latent channels. """
    model_type = "SDXL"  # Default

    try:
        if hasattr(model.model, 'latent_format'):
            latent_channels = model.model.latent_format.latent_channels
            if latent_channels == 16:
                model_type = "SDXL"
            elif latent_channels == 4:
                # Check if it's SVD by looking at model structure
                if (hasattr(model.model, 'is_temporal') or
                        'svd' in str(type(model.model)).lower()):
                    model_type = "SVD"
                else:
                    model_type = "SD1"
    except Exception:
        # Fallback to SDXL if detection fails
        pass

    return model_type


def sample_latent(
        model, positive, negative, seed, sampler_name,
        scheduler, steps, cfg, denoise, latent):
    """ Custom sampling function that utilizes SamplerCustom.
    This allows for switching between BasicScheduler and other
    schedulers that aren't included. It's specifically being used for
    align your steps here, since I've had good luck with it."""

    # Create sampler
    sampler_select = Node("KSamplerSelect")
    sampler = sampler_select.function(sampler_name)[0]

    # Create scheduler
    if scheduler == "align_your_steps":
        model_type = detect_model_type(model)
        ays_scheduler = Node("AlignYourStepsScheduler")
        sigmas = ays_scheduler.function(model_type, steps, denoise)[0]
    elif scheduler == "beta57":
        total_steps = steps
        if denoise < 1.0:
            if denoise <= 0.0:
                sigmas = torch.FloatTensor([])
            else:
                total_steps = int(steps / denoise)
        
        if total_steps > 0:
            beta_scheduler = Node("BetaSamplingScheduler")
            sigmas = beta_scheduler.function(model=model, steps=total_steps, alpha=0.5, beta=0.7)[0]
            if denoise < 1.0:
                sigmas = sigmas[-(steps + 1):]
        else:
            sigmas = torch.FloatTensor([])
    else:
        scheduler_node = Node("BasicScheduler")
        sigmas = scheduler_node.function(
            model, scheduler, steps, denoise)[0]

    # Sample
    sampler_custom = Node("SamplerCustom")
    sampled_latent = sampler_custom.function(
        model, True, seed, cfg, positive, negative,
        sampler, sigmas, latent
    )[0]

    return sampled_latent


def strip_comments(text):
    """ Strip lines that start with # unless escaped. """
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


UPSCALE_DIR = os.path.join(folder_paths.models_dir, "upscale_models")


def get_upscale_model_list():
    exts = (".pth", ".pt", ".safetensors")
    models = []

    for root, _, files in os.walk(UPSCALE_DIR):
        for name in files:
            if name.lower().endswith(exts):
                full_path = os.path.join(root, name)
                rel_path = os.path.relpath(full_path, UPSCALE_DIR)
                models.append(rel_path)

    return ["none"] + sorted(models)


class Node:
    """Wrapper for ComfyUI nodes to simplify function calls."""

    def __init__(self, node_name, silent=False):
        """
        Initialize the wrapper with a node name.

        Args:
            node_name: Name of the node in NODE_CLASS_MAPPINGS
            silent: If True, return None instead of raising when
                the node is not found
        """
        self.node_name = node_name
        self.silent = silent
        self._node_instance = None
        self._function = None
        # Sentinel so __bool__ can distinguish "not yet resolved"
        # from "resolved and missing"
        self._found = None

    @property
    def node(self):
        """Lazy load and cache the node instance."""
        if self._node_instance is None:
            from nodes import NODE_CLASS_MAPPINGS

            node_class = NODE_CLASS_MAPPINGS.get(self.node_name)
            if node_class is None:
                self._found = False
                if not self.silent:
                    raise ValueError(
                        f"Node '{self.node_name}' not found in mappings"
                    )
                return None
            self._found = True
            self._node_instance = node_class()
        return self._node_instance

    @property
    def function(self):
        """Get the node's main function."""
        if self._function is None:
            n = self.node
            if n is None:
                return None
            self._function = getattr(n, n.FUNCTION)
        return self._function

    def __bool__(self):
        """True if the underlying node exists."""
        if self._found is None:
            # Trigger resolution without raising
            self.node
        return bool(self._found)

    def __call__(self, *args, **kwargs):
        """Allow calling the wrapper directly."""
        return self.function(*args, **kwargs)
