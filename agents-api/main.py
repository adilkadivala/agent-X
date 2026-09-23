"""
Root entry point for SuperGrow Agents API.
Can be run directly with: `python main.py` or `uv run main.py`
"""
import sys
from pathlib import Path

# Ensure root is in sys.path
_root = str(Path(__file__).resolve().parent)
if _root not in sys.path:
    sys.path.insert(0, _root)

import uvicorn
from app.main import app
from app.config import settings

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, reload=True)
