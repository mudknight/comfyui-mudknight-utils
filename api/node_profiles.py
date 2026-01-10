import json
import server
from aiohttp import web
from . import common

CONFIG_DIR = common.CONFIG_DIR
PROFILES_FILE = CONFIG_DIR / "node_profiles.json"


def load_profiles():
    if not PROFILES_FILE.exists():
        return {}
    try:
        with open(PROFILES_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading profiles: {e}")
        return {}


def save_profiles(profiles):
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
    return web.json_response(load_profiles())


@server.PromptServer.instance.routes.get('/node_profiles/{name}')
async def get_profile(request):
    name = request.match_info['name']
    profiles = load_profiles()
    if name not in profiles:
        return web.json_response({"error": "Not found"}, status=404)
    return web.json_response(profiles[name])


@server.PromptServer.instance.routes.post('/node_profiles/{name}')
async def save_profile(request):
    name = request.match_info['name']
    data = await request.json()
    profiles = load_profiles()
    profiles[name] = data
    if save_profiles(profiles):
        return web.json_response({"success": True})
    return web.json_response({"error": "Save failed"}, status=500)


@server.PromptServer.instance.routes.delete('/node_profiles/{name}')
async def delete_profile(request):
    name = request.match_info['name']
    profiles = load_profiles()
    if name in profiles:
        del profiles[name]
        save_profiles(profiles)
        return web.json_response({"success": True})
    return web.json_response({"error": "Not found"}, status=404)


@server.PromptServer.instance.routes.post('/node_profiles/rename')
async def rename_profile(request):
    data = await request.json()
    old_n, new_n = data.get('oldName'), data.get('newName')
    profiles = load_profiles()
    if old_n in profiles:
        profiles[new_n] = profiles.pop(old_n)
        save_profiles(profiles)
        return web.json_response({"success": True})
    return web.json_response({"error": "Not found"}, status=404)
