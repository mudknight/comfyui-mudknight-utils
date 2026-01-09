import base64
import re
from pathlib import Path

CONFIG_DIR = Path(__file__).parent.parent / "config"


def decode_name(b64_name: str) -> str:
    return base64.b64decode(b64_name).decode("utf-8")


def strip_jsonc_comments(content):
    """Remove comments from JSONC content"""
    # Remove single-line comments
    content = re.sub(r'//.*?$', '', content, flags=re.MULTILINE)
    # Remove multi-line comments
    content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
    return content


def get_image_path(path, name):
    """Get the image path"""
    safe_name = base64.urlsafe_b64encode(
        name.encode('utf-8')
    ).decode('ascii')
    return path / f"{safe_name}.jpg"
