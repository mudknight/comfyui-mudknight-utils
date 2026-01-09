import json
import server
from aiohttp import web
from . import common

# Node parameter profiles endpoints
CONFIG_DIR = common.CONFIG_DIR
PROFILES_FILE = CONFIG_DIR / "node_profiles.json"


def load_profiles():
    """Load profiles from JSON file"""
    if not PROFILES_FILE.exists():
        return {}
    try:
        with open(PROFILES_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading profiles: {e}")
        return {}


def save_profiles(profiles):
    """Save profiles to JSON file"""
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        with open(PROFILES_FILE, 'w', encoding='utf-8') as f:
            json.dump(profiles, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"Error saving profiles: {e}")
        return False


@server.PromptServer.instance.routes.get('/node_profiles')
async def get_profiles(request):
    """Get all profiles"""
    try:
        profiles = load_profiles()
        return web.json_response(profiles)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get('/node_profiles/{name}')
async def get_profile(request):
    """Get a specific profile"""
    try:
        name = request.match_info['name']
        profiles = load_profiles()

        if name not in profiles:
            return web.json_response(
                {"error": "Profile not found"},
                status=404
            )

        return web.json_response(profiles[name])
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post('/node_profiles/{name}')
async def save_profile(request):
    """Save or update a profile"""
    try:
        name = request.match_info['name']
        data = await request.json()

        profiles = load_profiles()
        profiles[name] = data

        if save_profiles(profiles):
            return web.json_response({"success": True})
        else:
            return web.json_response(
                {"error": "Failed to save"},
                status=500
            )
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.delete('/node_profiles/{name}')
async def delete_profile(request):
    """Delete a profile"""
    try:
        name = request.match_info['name']
        profiles = load_profiles()

        if name not in profiles:
            return web.json_response(
                {"error": "Profile not found"},
                status=404
            )

        del profiles[name]

        if save_profiles(profiles):
            return web.json_response({"success": True})
        else:
            return web.json_response(
                {"error": "Failed to save"},
                status=500
            )
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post('/node_profiles/rename')
async def rename_profile(request):
    """Rename a profile"""
    try:
        data = await request.json()
        old_name = data.get('oldName')
        new_name = data.get('newName')

        if not old_name or not new_name:
            return web.json_response(
                {"error": "Missing old or new name"},
                status=400
            )

        profiles = load_profiles()

        if old_name not in profiles:
            return web.json_response(
                {"error": "Profile not found"},
                status=404
            )

        if new_name in profiles and new_name != old_name:
            return web.json_response(
                {"error": "Profile with new name already exists"},
                status=400
            )

        profiles[new_name] = profiles[old_name]
        del profiles[old_name]

        if save_profiles(profiles):
            return web.json_response({"success": True})
        else:
            return web.json_response(
                {"error": "Failed to save"},
                status=500
            )
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


print("Node Profile API routes registered")
