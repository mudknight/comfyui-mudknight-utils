#!/usr/bin/env python3
"""
API endpoints for character editor
Add this to your custom node's __init__.py or server setup
"""

import json
import os
import re
import base64
import folder_paths
from pathlib import Path
from aiohttp import web
from PIL import Image
from io import BytesIO
import server


# Get the config path
CONFIG_DIR = Path(__file__).parent / "config"
CHARACTERS_FILE = CONFIG_DIR / "characters.jsonc"
IMAGES_DIR = CONFIG_DIR / "character_images"
STYLE_IMAGES_DIR = CONFIG_DIR / "style_images"
STYLE_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

print(f"Character Editor: Config dir: {CONFIG_DIR}")
print(f"Character Editor: Characters file: {CHARACTERS_FILE}")
print(f"Character Editor: Images dir: {IMAGES_DIR}")
print(f"Character Editor: File exists: {CHARACTERS_FILE.exists()}")

# Ensure images directory exists
IMAGES_DIR.mkdir(parents=True, exist_ok=True)


def decode_name(b64_name: str) -> str:
    return base64.b64decode(b64_name).decode("utf-8")


def strip_jsonc_comments(content):
    """Remove comments from JSONC content"""
    # Remove single-line comments
    content = re.sub(r'//.*?$', '', content, flags=re.MULTILINE)
    # Remove multi-line comments
    content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
    return content


def load_characters():
    """Load characters from JSONC file"""
    if not CHARACTERS_FILE.exists():
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        CHARACTERS_FILE.write_text("{}")
        return {}

    content = CHARACTERS_FILE.read_text(encoding='utf-8')
    clean_content = strip_jsonc_comments(content)
    return json.loads(clean_content)


def save_characters(characters):
    """Save characters to JSONC file"""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    content = json.dumps(characters, indent=4, ensure_ascii=False)
    CHARACTERS_FILE.write_text(content, encoding='utf-8')


def get_image_path(character_name):
    """Get the image path for a character"""
    # Use base64 encoding to create a safe filename that preserves the
    # original name
    import base64
    safe_name = base64.urlsafe_b64encode(
        character_name.encode('utf-8')
    ).decode('ascii')
    return IMAGES_DIR / f"{safe_name}.jpg"


def get_style_image_path(style_name):
    """Get the image path for a style"""
    safe_name = base64.urlsafe_b64encode(
        style_name.encode('utf-8')
    ).decode('ascii')
    return STYLE_IMAGES_DIR / f"{safe_name}.jpg"


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
            image_path = get_image_path(name)
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
        old_image_path = get_image_path(old_name)
        if old_image_path.exists():
            new_image_path = get_image_path(new_name)
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
        from urllib.parse import unquote
        name = decode_name(request.match_info['name'])
        # print(f"Getting image for character: {repr(name)}")
        image_path = get_image_path(name)
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
        from urllib.parse import unquote
        name = decode_name(request.match_info['name'])
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
        image_path = get_image_path(name)
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
        from urllib.parse import unquote
        name = decode_name(request.match_info['name'])
        print(f"Deleting image for character: {repr(name)}")
        image_path = get_image_path(name)

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
        name = decode_name(request.match_info['name'])
        image_path = get_style_image_path(name)

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
        name = decode_name(request.match_info['name'])
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
        image_path = get_style_image_path(name)
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
        name = decode_name(request.match_info['name'])
        print(f"Deleting image for style: {repr(name)}")
        image_path = get_style_image_path(name)

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
        clean_content = strip_jsonc_comments(content)
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
        clean_content = strip_jsonc_comments(content)
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
        clean_content = strip_jsonc_comments(content)
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


@server.PromptServer.instance.routes.get('/lora_list')
async def get_lora_list(request):
    """Get list of all available LoRAs"""
    try:
        loras = folder_paths.get_filename_list("loras")
        # Return list of dicts with name and relative path
        lora_list = [{"name": lora, "path": lora} for lora in loras]
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
                        embeddings.append({
                            "name": name,
                            "path": rel_path
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


print("LoRA and Embedding list API routes registered")
