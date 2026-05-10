import os
import json
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from agent.graph import run_teaching


class TeachRequest(BaseModel):
    message: str
    user_id: Optional[str] = "anonymous"
    knowledge_point: Optional[str] = None
    history: Optional[list] = None


class ToolCallEvent(BaseModel):
    type: str
    tool_name: str
    args: dict
    result: Optional[str] = None


active_connections: list[WebSocket] = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("EduMind MCP API Server 启动中...")
    yield
    print("EduMind MCP API Server 关闭")


app = FastAPI(title="EduMind MCP API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

plots_dir = os.path.join(os.path.dirname(__file__), "..", "assets", "plots")
os.makedirs(plots_dir, exist_ok=True)
app.mount("/plots", StaticFiles(directory=plots_dir), name="plots")


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "edumind-mcp"}


@app.post("/api/teach")
async def teach(req: TeachRequest):
    if len(req.message) > 2000:
        return {"error": "消息过长（最多2000字符）"}

    try:
        result = await asyncio.wait_for(
            run_teaching(req.message, req.history),
            timeout=30.0,
        )

        for ws in active_connections:
            try:
                await ws.send_json({
                    "type": "tool_call",
                    "user_id": req.user_id,
                    "tools_used": result.get("tools_used", []),
                    "phase": result.get("phase"),
                })
            except Exception:
                pass

        return result
    except asyncio.TimeoutError:
        return {"error": "请求超时，请稍后重试", "message": "让我再想想这个问题..."}
    except Exception as exc:
        return {"error": f"处理错误: {str(exc)}", "message": "抱歉，处理时出了点问题，请重试"}


@app.websocket("/ws/events")
async def websocket_events(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        active_connections.remove(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
