"""Entry point for EduMind Self-Evolving Teaching System."""

import os
import sys

_project = os.path.join(os.path.dirname(__file__))
if _project not in sys.path:
    sys.path.insert(0, _project)

from api.server import app

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("EVOLVE_PORT", "8003"))
    print(f"🧬 EduMind Self-Evolving Teaching System starting on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
