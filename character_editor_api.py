#!/usr/bin/env python3
"""
API endpoints for character editor
Add this to your custom node's __init__.py or server setup
"""

import json
import os
import re
import base64
from pathlib import Path
from aiohttp import web
from PIL import Image
from io import BytesIO
import server


# Get the config path
CONFIG_DIR = Path(__file__).parent / "config"
CHARACTERS_FILE = CONFIG_DIR / "characters.jsonc"
IMAGES_DIR = CONFIG_DIR / "character_images"

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


print("Character Editor API routes registered")
