import os
import folder_paths


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
    """
    Strip lines that start with # but preserve lines starting with \\#.
    """
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

    def __init__(self, node_name):
        """
        Initialize the wrapper with a node name.

        Args:
            node_name: Name of the node in NODE_CLASS_MAPPINGS
        """
        self.node_name = node_name
        self._node_instance = None
        self._function = None

    @property
    def node(self):
        """Lazy load and cache the node instance."""
        if self._node_instance is None:
            from nodes import NODE_CLASS_MAPPINGS

            node_class = NODE_CLASS_MAPPINGS.get(self.node_name)
            if node_class is None:
                raise ValueError(
                    f"Node '{self.node_name}' not found in mappings"
                )
            self._node_instance = node_class()
        return self._node_instance

    @property
    def function(self):
        """Get the node's main function."""
        if self._function is None:
            self._function = getattr(self.node, self.node.FUNCTION)
        return self._function

    def __call__(self, *args, **kwargs):
        """Allow calling the wrapper directly."""
        return self.function(*args, **kwargs)
