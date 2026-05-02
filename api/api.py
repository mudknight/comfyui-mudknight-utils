#!/usr/bin/env python3
"""
API endpoints for Preset Manager
"""

import json
import os
import base64
import folder_paths
from aiohttp import web
from PIL import Image
from io import BytesIO
import server
from . import common

# Get the config path
CONFIG_DIR = common.CONFIG_DIR
CHARACTERS_FILE = CONFIG_DIR / "characters.jsonc"
WILDCARDS_FILE = CONFIG_DIR / "wildcards.jsonc"
IMAGES_DIR = CONFIG_DIR / "character_images"
STYLE_IMAGES_DIR = CONFIG_DIR / "style_images"
STYLE_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

print(f"[Preset Manager] Config dir: {CONFIG_DIR}")
print(f"[Preset Manager] Characters file: {CHARACTERS_FILE}")
print(f"[Preset Manager] Images dir: {IMAGES_DIR}")
print(f"[Preset Manager] File exists: {CHARACTERS_FILE.exists()}")

# Ensure images directory exists
IMAGES_DIR.mkdir(parents=True, exist_ok=True)


def load_characters():
    """Load characters from JSONC file"""
    if not CHARACTERS_FILE.exists():
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        CHARACTERS_FILE.write_text("{}")
        return {}

    content = CHARACTERS_FILE.read_text(encoding='utf-8')
    clean_content = common.strip_jsonc_comments(content)
    return json.loads(clean_content)


def save_characters(characters):
    """Save characters to JSONC file"""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    content = json.dumps(characters, indent=4, ensure_ascii=False)
    CHARACTERS_FILE.write_text(content, encoding='utf-8')


@server.PromptServer.instance.routes.get('/character_editor')
async def get_characters(request):
    """Get all characters"""
    try:
        characters = load_characters()
        return web.json_response(characters)
    except Exception as e:
        return web.json_response(
            {"error": str(e)},
            status=500
        )


@server.PromptServer.instance.routes.post('/character_editor')
async def update_characters(request):
    """Update characters"""
    try:
        data = await request.json()
        save_characters(data)
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response(
            {"error": str(e)},
            status=500
        )


@server.PromptServer.instance.routes.delete('/character_editor/{name}')
async def delete_character(request):
    """Delete a character"""
    try:
        name = request.match_info['name']
        characters = load_characters()

        if name in characters:
            del characters[name]
            save_characters(characters)

            # Delete image if it exists
            image_path = common.get_image_path(IMAGES_DIR, name)
            if image_path.exists():
                image_path.unlink()

            return web.json_response({"success": True})
        else:
            return web.json_response(
                {"error": "Character not found"},
                status=404
            )
    except Exception as e:
        return web.json_response(
            {"error": str(e)},
            status=500
        )


@server.PromptServer.instance.routes.post('/character_editor/rename')
async def rename_character(request):
    """Rename a character and its image"""
    try:
        data = await request.json()
        old_name = data.get('oldName')
        new_name = data.get('newName')
        char_data = data.get('data')

        if not old_name or not new_name:
            return web.json_response(
                    {"error": "Missing old or new name"},
                    status=400
                    )

        # Load current characters
        characters = load_characters()

        # Check if old name exists
        if old_name not in characters:
            return web.json_response(
                    {"error": "Character not found"},
                    status=404
                    )

        # Check if new name already exists
        if new_name in characters and new_name != old_name:
            return web.json_response(
                    {"error": "Character with new name already exists"},
                    status=400
                    )

        # Update character data
        del characters[old_name]
        characters[new_name] = char_data
        save_characters(characters)

        # Rename image if it exists
        old_image_path = common.get_image_path(IMAGES_DIR, old_name)
        if old_image_path.exists():
            new_image_path = common.get_image_path(IMAGES_DIR, new_name)
            old_image_path.rename(new_image_path)
            print(f"Renamed image from {old_image_path} to {new_image_path}")

        return web.json_response({"success": True})
    except Exception as e:
        print(f"Error renaming character: {e}")
        return web.json_response(
                {"error": str(e)},
                status=500
                )


@server.PromptServer.instance.routes.get(
    '/character_editor/image/{name}'
)
async def get_character_image(request):
    """Get character image"""
    try:
        name = common.decode_name(request.match_info['name'])
        # print(f"Getting image for character: {repr(name)}")
        image_path = common.get_image_path(IMAGES_DIR, name)
        # print(f"Image path: {image_path}")
        # print(f"File exists: {image_path.exists()}")

        if not image_path.exists():
            return web.Response(status=404)

        return web.FileResponse(image_path)
    except Exception as e:
        print(f"Error getting image: {e}")
        return web.json_response(
            {"error": str(e)},
            status=500
        )


@server.PromptServer.instance.routes.post(
    '/character_editor/image/{name}'
)
async def upload_character_image(request):
    """Upload character image"""
    try:
        name = common.decode_name(request.match_info['name'])
        print(f"Uploading image for character: {repr(name)}")
        data = await request.json()

        # Extract base64 image data
        image_data = data.get('image', '')
        if image_data.startswith('data:image'):
            image_data = image_data.split(',', 1)[1]

        # Decode and process image
        image_bytes = base64.b64decode(image_data)
        img = Image.open(BytesIO(image_bytes))

        # Resize to 256x256 with center crop
        size = 256
        img = img.convert('RGB')

        # Calculate crop dimensions
        width, height = img.size
        if width > height:
            left = (width - height) / 2
            img = img.crop((left, 0, left + height, height))
        else:
            top = (height - width) / 2
            img = img.crop((0, top, width, top + width))

        # Resize
        img = img.resize((size, size), Image.Resampling.LANCZOS)

        # Save as JPEG
        image_path = common.get_image_path(IMAGES_DIR, name)
        print(f"Saving image to: {image_path}")
        img.save(image_path, 'JPEG', quality=85, optimize=True)

        return web.json_response({"success": True})
    except Exception as e:
        print(f"Error uploading image: {e}")
        return web.json_response(
            {"error": str(e)},
            status=500
        )


@server.PromptServer.instance.routes.delete(
    '/character_editor/image/{name}'
)
async def delete_character_image(request):
    """Delete character image"""
    try:
        name = common.decode_name(request.match_info['name'])
        print(f"Deleting image for character: {repr(name)}")
        image_path = common.get_image_path(IMAGES_DIR, name)

        if image_path.exists():
            image_path.unlink()
            return web.json_response({"success": True})
        else:
            return web.Response(status=404)
    except Exception as e:
        print(f"Error deleting image: {e}")
        return web.json_response(
            {"error": str(e)},
            status=500
        )


@server.PromptServer.instance.routes.get('/style_editor/image/{name}')
async def get_style_image(request):
    """Get style image"""
    try:
        name = common.decode_name(request.match_info['name'])
        image_path = common.get_image_path(STYLE_IMAGES_DIR, name)

        if not image_path.exists():
            return web.Response(status=404)

        return web.FileResponse(image_path)
    except Exception as e:
        print(f"Error getting style image: {e}")
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post('/style_editor/image/{name}')
async def upload_style_image(request):
    """Upload style image"""
    try:
        name = common.decode_name(request.match_info['name'])
        print(f"Uploading image for style: {repr(name)}")
        data = await request.json()

        # Extract base64 image data
        image_data = data.get('image', '')
        if image_data.startswith('data:image'):
            image_data = image_data.split(',', 1)[1]

        # Decode and process image
        image_bytes = base64.b64decode(image_data)
        img = Image.open(BytesIO(image_bytes))

        # Resize to 256x256 with center crop
        size = 256
        img = img.convert('RGB')

        # Calculate crop dimensions
        width, height = img.size
        if width > height:
            left = (width - height) / 2
            img = img.crop((left, 0, left + height, height))
        else:
            top = (height - width) / 2
            img = img.crop((0, top, width, top + width))

        # Resize
        img = img.resize((size, size), Image.Resampling.LANCZOS)

        # Save as JPEG
        image_path = common.get_image_path(STYLE_IMAGES_DIR, name)
        print(f"Saving style image to: {image_path}")
        img.save(image_path, 'JPEG', quality=85, optimize=True)

        return web.json_response({"success": True})
    except Exception as e:
        print(f"Error uploading style image: {e}")
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.delete('/style_editor/image/{name}')
async def delete_style_image(request):
    """Delete style image"""
    try:
        name = common.decode_name(request.match_info['name'])
        print(f"Deleting image for style: {repr(name)}")
        image_path = common.get_image_path(STYLE_IMAGES_DIR, name)

        if image_path.exists():
            image_path.unlink()
            return web.json_response({"success": True})
        else:
            return web.Response(status=404)
    except Exception as e:
        print(f"Error deleting style image: {e}")
        return web.json_response({"error": str(e)}, status=500)


# Model editor endpoints
@server.PromptServer.instance.routes.get('/model_editor')
async def get_models(request):
    """Get all models"""
    try:
        models_file = CONFIG_DIR / "models.jsonc"
        if not models_file.exists():
            return web.json_response({})

        content = models_file.read_text(encoding='utf-8')
        clean_content = common.strip_jsonc_comments(content)
        models = json.loads(clean_content)
        return web.json_response(models)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post('/model_editor')
async def update_models(request):
    """Update models"""
    try:
        data = await request.json()
        models_file = CONFIG_DIR / "models.jsonc"
        content = json.dumps(data, indent=4, ensure_ascii=False)
        models_file.write_text(content, encoding='utf-8')
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


# Style editor endpoints
@server.PromptServer.instance.routes.get('/style_editor')
async def get_styles(request):
    """Get all styles"""
    try:
        styles_file = CONFIG_DIR / "styles.jsonc"
        if not styles_file.exists():
            return web.json_response({})

        content = styles_file.read_text(encoding='utf-8')
        clean_content = common.strip_jsonc_comments(content)
        styles = json.loads(clean_content)
        return web.json_response(styles)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post('/style_editor')
async def update_styles(request):
    """Update styles"""
    try:
        data = await request.json()
        styles_file = CONFIG_DIR / "styles.jsonc"
        content = json.dumps(data, indent=4, ensure_ascii=False)
        styles_file.write_text(content, encoding='utf-8')
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


print("Model and Style Editor API routes registered")


print("Character Editor API routes registered")


# Tag editor endpoints
@server.PromptServer.instance.routes.get('/tag_editor')
async def get_tags(request):
    """Get all tag presets"""
    try:
        tags_file = CONFIG_DIR / "tags.jsonc"
        if not tags_file.exists():
            return web.json_response({})

        content = tags_file.read_text(encoding='utf-8')
        clean_content = common.strip_jsonc_comments(content)
        tags = json.loads(clean_content)
        return web.json_response(tags)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post('/tag_editor')
async def update_tags(request):
    """Update tag presets"""
    try:
        data = await request.json()
        tags_file = CONFIG_DIR / "tags.jsonc"
        content = json.dumps(data, indent=4, ensure_ascii=False)
        tags_file.write_text(content, encoding='utf-8')
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


print("Tag Editor API routes registered")


@server.PromptServer.instance.routes.get("/wildcard_editor")
async def get_wildcards(request):
    """Get all wildcards."""
    try:
        if not WILDCARDS_FILE.exists():
            return web.json_response({})

        content = WILDCARDS_FILE.read_text(encoding='utf-8')
        clean_content = common.strip_jsonc_comments(content)
        wildcards = json.loads(clean_content)
        return web.json_response(wildcards)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/wildcard_editor")
async def save_wildcards(request):
    """Save wildcards."""
    try:
        data = await request.json()
        with open(WILDCARDS_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return web.json_response({"status": "success"})
    except Exception as e:
        return web.json_response(
            {"error": str(e)}, status=500
        )


print("LoRA and Embedding list API routes registered")


# Preview image cache directory
PREVIEW_CACHE_DIR = CONFIG_DIR / "preview_cache"
PREVIEW_CACHE_DIR.mkdir(parents=True, exist_ok=True)
PREVIEW_SIZE = 256  # Size for cached preview images


def get_lora_preview_path(lora_name_or_path):
    """Get the preview image path for a LoRA"""
    lora_file = None

    # First, try using folder_paths.get_full_path which handles subdirectories
    # properly. This is the most reliable method
    try:
        # Try with the path as-is (might already include extension)
        full_path = folder_paths.get_full_path("loras", lora_name_or_path)
        if full_path and os.path.exists(full_path):
            lora_file = full_path
    except:  # noqa
        pass

    # If that didn't work, try adding common extensions
    if not lora_file:
        for ext in ['.safetensors', '.ckpt', '.pt', '.bin']:
            try:
                # Try with extension appended
                full_path = folder_paths.get_full_path(
                        "loras", lora_name_or_path + ext)
                if full_path and os.path.exists(full_path):
                    lora_file = full_path
                    break
            except:  # noqa
                continue

    # If still not found, try direct path search (fallback)
    if not lora_file:
        lora_paths = folder_paths.get_folder_paths("loras")
        for lora_dir in lora_paths:
            # Try as direct filename
            for ext in ['.safetensors', '.ckpt', '.pt', '.bin']:
                test_path = os.path.join(lora_dir, lora_name_or_path + ext)
                if os.path.exists(test_path):
                    lora_file = test_path
                    break
            if lora_file:
                break

    if lora_file:
        # Check for preview files in the same directory as the LoRA file
        base_name = os.path.splitext(os.path.basename(lora_file))[0]
        preview_dir = os.path.dirname(lora_file)

        # First check for .preview.* files
        for ext in [
                '.preview.png', '.preview.jpeg',
                '.preview.jpg', '.preview.webp']:
            preview_path = os.path.join(preview_dir, base_name + ext)
            if os.path.exists(preview_path):
                return preview_path

        # Also check for image files with same base name (without .preview.
        # prefix) using common image extensions
        for ext in ['.png', '.jpeg', '.jpg', '.webp', '.gif', '.bmp']:
            preview_path = os.path.join(preview_dir, base_name + ext)
            if os.path.exists(preview_path):
                # Make sure it's not the LoRA file itself
                if preview_path != lora_file:
                    return preview_path

    return None


def get_embedding_preview_path(embedding_path):
    """Get the preview image path for an embedding"""
    embedding_paths = folder_paths.get_folder_paths("embeddings")
    for emb_dir in embedding_paths:
        # Try to find the embedding file
        emb_file = None
        for ext in ['.pt', '.safetensors', '.bin']:
            test_path = os.path.join(emb_dir, embedding_path)
            if os.path.exists(test_path):
                emb_file = test_path
                break

        if emb_file:
            # Check for preview files
            base_name = os.path.splitext(os.path.basename(emb_file))[0]
            preview_dir = os.path.dirname(emb_file)

            # First check for .preview.* files
            for ext in [
                    '.preview.png', '.preview.jpeg',
                    '.preview.jpg', '.preview.webp']:
                preview_path = os.path.join(preview_dir, base_name + ext)
                if os.path.exists(preview_path):
                    return preview_path

            # Also check for image files with same base name (without .preview.
            # prefix) using common image extensions
            for ext in ['.png', '.jpeg', '.jpg', '.webp', '.gif', '.bmp']:
                preview_path = os.path.join(preview_dir, base_name + ext)
                if os.path.exists(preview_path):
                    # Make sure it's not the embedding file itself
                    if preview_path != emb_file:
                        return preview_path

    return None


def get_cached_preview_path(original_path, cache_key):
    """Get or create a cached preview image"""
    # Create a hash of the original path for cache filename
    import hashlib
    cache_hash = hashlib.md5(cache_key.encode()).hexdigest()
    cache_path = PREVIEW_CACHE_DIR / f"{cache_hash}.jpg"

    # Check if cache exists and is newer than original
    if cache_path.exists():
        try:
            if os.path.getmtime(cache_path) >= os.path.getmtime(original_path):
                return cache_path
        except:  # noqa
            pass

    # Create cached version
    try:
        img = Image.open(original_path)
        img = img.convert('RGB')

        # Resize with center crop to square
        width, height = img.size
        if width > height:
            left = (width - height) / 2
            img = img.crop((left, 0, left + height, height))
        else:
            top = (height - width) / 2
            img = img.crop((0, top, width, top + width))

        # Resize to preview size
        img = img.resize((
            PREVIEW_SIZE, PREVIEW_SIZE), Image.Resampling.LANCZOS)

        # Save as JPEG
        img.save(cache_path, 'JPEG', quality=85, optimize=True)
        return cache_path
    except Exception as e:
        print(f"Error creating cached preview: {e}")
        return original_path


@server.PromptServer.instance.routes.get('/lora_preview/{name}')
async def get_lora_preview(request):
    """Get LoRA preview image"""
    try:
        from urllib.parse import unquote
        name = unquote(request.match_info['name'])
        # Try to find preview using the name
        preview_path = get_lora_preview_path(name)

        # If not found, try to find the LoRA in the list and use its full path
        if not preview_path or not os.path.exists(preview_path):
            # Try to find the LoRA in the list to get its full path
            try:
                loras = folder_paths.get_filename_list("loras")
                # Check if name matches any LoRA (by name or path)
                for lora in loras:
                    lora_name = os.path.splitext(lora)[0]
                    if lora_name == name or lora == name:
                        # Try with the full path
                        preview_path = get_lora_preview_path(lora)
                        if preview_path and os.path.exists(preview_path):
                            break
            except:  # noqa
                pass

        if not preview_path or not os.path.exists(preview_path):
            return web.Response(status=404)

        # Use cached version if available
        cache_path = get_cached_preview_path(preview_path, f"lora:{name}")
        return web.FileResponse(cache_path)
    except Exception as e:
        print(f"Error getting LoRA preview: {e}")
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get('/embedding_preview/{path:.*}')
async def get_embedding_preview(request):
    """Get embedding preview image"""
    try:
        from urllib.parse import unquote
        path = unquote(request.match_info['path'])
        preview_path = get_embedding_preview_path(path)

        if not preview_path or not os.path.exists(preview_path):
            return web.Response(status=404)

        # Use cached version if available
        cache_path = get_cached_preview_path(preview_path, f"embedding:{path}")
        return web.FileResponse(cache_path)
    except Exception as e:
        print(f"Error getting embedding preview: {e}")
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get('/lora_trigger_words/{name:.*}')
async def get_lora_trigger_words(request):
    """Get trigger words for a LoRA from its civitai metadata."""
    try:
        from urllib.parse import unquote
        name = unquote(request.match_info['name'])
        print(f"[TriggerWords] Requested name: {repr(name)}")

        # Resolve the lora file path. The name may already include
        # a file extension if passed as a full relative path.
        lora_file = None
        try:
            full_path = folder_paths.get_full_path("loras", name)
            print(f"[TriggerWords] get_full_path result: {repr(full_path)}")
            if full_path and os.path.exists(full_path):
                lora_file = full_path
        except Exception as e:
            print(f"[TriggerWords] get_full_path exception: {e}")

        if not lora_file:
            for ext in ['.safetensors', '.ckpt', '.pt', '.bin']:
                try:
                    full_path = folder_paths.get_full_path(
                        "loras", name + ext
                    )
                    if full_path and os.path.exists(full_path):
                        lora_file = full_path
                        print(
                            f"[TriggerWords] Found via ext fallback: "
                            f"{repr(lora_file)}"
                        )
                        break
                except Exception:
                    continue

        # Fall back to manually joining against each lora directory,
        # since get_full_path can be unreliable with subdirectory paths.
        if not lora_file:
            lora_dirs = folder_paths.get_folder_paths("loras")
            print(f"[TriggerWords] Lora dirs: {lora_dirs}")
            for lora_dir in lora_dirs:
                candidate = os.path.join(lora_dir, name)
                print(f"[TriggerWords] Trying candidate: {repr(candidate)}")
                if os.path.exists(candidate):
                    lora_file = candidate
                    break
                for ext in ['.safetensors', '.ckpt', '.pt', '.bin']:
                    candidate = os.path.join(lora_dir, name + ext)
                    if os.path.exists(candidate):
                        lora_file = candidate
                        break
                if lora_file:
                    print(
                        f"[TriggerWords] Found via manual join: "
                        f"{repr(lora_file)}"
                    )
                    break

        if not lora_file:
            print(f"[TriggerWords] Could not resolve lora file for "
                  f"{repr(name)}")
            return web.json_response([])

        # Look for sidecar metadata file — check .metadata.json first
        # (lora manager format), then fall back to plain .json.
        base = os.path.splitext(lora_file)[0]
        for meta_suffix in ['.metadata.json', '.json']:
            meta_path = base + meta_suffix
            print(
                f"[TriggerWords] Looking for metadata at: {repr(meta_path)}"
            )
            if os.path.exists(meta_path):
                break
        else:
            print(f"[TriggerWords] Metadata file not found")
            return web.json_response([])
        print(f"[TriggerWords] Using metadata file: {repr(meta_path)}")

        with open(meta_path, 'r', encoding='utf-8') as f:
            meta = json.load(f)

        # Extract civitai trainedWords
        trained_words = (
            meta.get('civitai', {}).get('trainedWords', [])
        )
        print(f"[TriggerWords] Returning words: {trained_words}")
        if not isinstance(trained_words, list):
            return web.json_response([])

        return web.json_response(trained_words)
    except Exception as e:
        print(f"[TriggerWords] Error: {e}")
        import traceback
        traceback.print_exc()
        return web.json_response([])


@server.PromptServer.instance.routes.get('/lora_list')
async def get_lora_list(request):
    """Get list of all available LoRAs"""
    try:
        loras = folder_paths.get_filename_list("loras")
        # Return list of dicts with name, path, and hasPreview
        lora_list = []
        for lora in loras:
            # Remove extension for name
            name = os.path.splitext(lora)[0]
            # Try both the name (without extension) and the full path for
            # preview detection. The full path might include subdirectories
            has_preview = (get_lora_preview_path(name) is not None or
                           get_lora_preview_path(lora) is not None)
            lora_list.append({
                "name": name,
                "path": lora,
                "hasPreview": has_preview
            })
        return web.json_response(lora_list)
    except Exception as e:
        return web.json_response(
            {"error": str(e)},
            status=500
        )


@server.PromptServer.instance.routes.get('/embedding_list')
async def get_embedding_list(request):
    """Get list of all available embeddings"""
    try:
        # Get embedding paths
        embedding_paths = folder_paths.get_folder_paths("embeddings")
        embeddings = []

        # Scan each embeddings folder
        for emb_path in embedding_paths:
            if not os.path.exists(emb_path):
                continue

            for root, dirs, files in os.walk(emb_path):
                for file in files:
                    # Common embedding extensions
                    if file.lower().endswith(
                        ('.pt', '.safetensors', '.bin')
                    ):
                        # Remove extension for cleaner names
                        name = os.path.splitext(file)[0]
                        # Get relative path from embedding root
                        rel_path = os.path.relpath(
                            os.path.join(root, file),
                            emb_path
                        )
                        has_preview = get_embedding_preview_path(
                                rel_path) is not None
                        embeddings.append({
                            "name": name,
                            "path": rel_path,
                            "hasPreview": has_preview
                        })

        # Remove duplicates and sort
        unique_embeddings = {
            emb["name"]: emb for emb in embeddings
        }.values()
        sorted_embeddings = sorted(
            unique_embeddings,
            key=lambda x: x["name"].lower()
        )

        return web.json_response(list(sorted_embeddings))
    except Exception as e:
        return web.json_response(
            {"error": str(e)},
            status=500
        )


@server.PromptServer.instance.routes.get('/tag_usage')
async def get_tag_usage(request):
    """Get tag usage counts for autocomplete"""
    try:
        usage_file = CONFIG_DIR / "tag_usage.json"
        if not usage_file.exists():
            return web.json_response({})

        with open(usage_file, 'r', encoding='utf-8') as f:
            usage = json.load(f)

        return web.json_response(usage)
    except Exception as e:
        print(f"Error loading tag usage: {e}")
        return web.json_response({}, status=500)


@server.PromptServer.instance.routes.get('/autocomplete_settings')
async def get_autocomplete_settings(request):
    """Get autocomplete settings"""
    try:
        settings_file = CONFIG_DIR / "autocomplete_settings.json"
        if not settings_file.exists():
            return web.json_response({"collect_tag_usage": True})

        with open(settings_file, 'r', encoding='utf-8') as f:
            settings = json.load(f)
        return web.json_response(settings)
    except Exception as e:
        print(f"Error loading autocomplete settings: {e}")
        return web.json_response(
            {"collect_tag_usage": True},
            status=500
        )


@server.PromptServer.instance.routes.post('/autocomplete_settings')
async def update_autocomplete_settings(request):
    """Update autocomplete settings"""
    try:
        data = await request.json()
        settings_file = CONFIG_DIR / "autocomplete_settings.json"
        with open(settings_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        return web.json_response({"success": True})
    except Exception as e:
        print(f"Error saving autocomplete settings: {e}")
        return web.json_response(
            {"error": str(e)},
            status=500
        )


print("Tag usage API routes registered")
