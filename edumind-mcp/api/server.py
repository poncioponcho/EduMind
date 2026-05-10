import os
import json
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional

sys_path = os.path.join(os.path.dirname(__file__), "..")
if sys_path not in os.sys.path:
    os.sys.path.insert(0, sys_path)

from agent.llm_provider import get_llm, PROVIDER_INFO


class TeachRequest(BaseModel):
    message: str
    user_id: Optional[str] = "anonymous"
    knowledge_point: Optional[str] = None
    history: Optional[list] = None


active_connections: list[WebSocket] = []

_cached_run_teaching = None
_detected_provider: str | None = None
_provider_info: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _cached_run_teaching, _detected_provider, _provider_info
    print("=" * 50)
    print("EduMind MCP Super Teacher 启动中...")
    print(f"  支持的LLM提供商: {', '.join(PROVIDER_INFO.keys())}")
    print("-" * 50)

    try:
        llm = get_llm()
        _detected_provider = os.environ.get("LLM_PROVIDER", "auto-detect")
        provider_key = next(
            (k for k in ["GOOGLE_API_KEY", "DASHSCOPE_API_KEY", "MOONSHOT_API_KEY", "OPENAI_API_KEY"]
             if os.environ.get(k)), None
        )
        print(f"  ✅ LLM已就绪: {_detected_provider}")
        if provider_key:
            key_preview = os.environ[provider_key][:8] + "***"
            print(f"  🔑 使用Key: {provider_key}={key_preview}")

        from agent.graph import build_agent
        graph, tools = await build_agent()
        _cached_run_teaching = await _make_cached_teaching(graph)
        _provider_info = {
            "name": PROVIDER_INFO.get(_detected_provider.replace("auto-detect", ""), {}).get("name", _detected_provider),
            "model": str(getattr(llm, 'model_name', getattr(llm, 'model', 'unknown'))),
        }
        print(f"  🧠 ReAct图已构建，{len(tools)}个MCP工具已注册")
        print(f"  📦 模型: {_provider_info.get('model', 'unknown')}")
    except ValueError as e:
        _detected_provider = "none"
        print(f"  ⚠️  {e}")
        print(f"  ℹ️  服务将以无LLM模式运行（仅MCP工具可用）")

    yield
    print("\nEduMind MCP Server 关闭")


async def _make_cached_teaching(graph):
    from agent.graph import EduState
    from langchain_core.messages import HumanMessage, AIMessage, ToolMessage

    async def cached_run(message: str, history: list = []) -> dict:
        state = {
            "messages": [HumanMessage(content=message)],
            "tools_used": [],
            "observation": "",
            "phase": "teaching",
            "emotion": "neutral",
        }

        if history:
            for msg in history[-10:]:
                if msg.get("role") == "student":
                    state["messages"].insert(-1, HumanMessage(content=msg["content"]))
                elif msg.get("role") == "tutor":
                    state["messages"].insert(-1, AIMessage(content=msg["content"]))

        result = await graph.ainvoke(state)

        tools_used = []
        for msg in result["messages"]:
            if hasattr(msg, "tool_calls") and msg.tool_calls:
                for tc in msg.tool_calls:
                    tools_used.append({"name": tc["name"], "args": tc.get("args", {})})
            if isinstance(msg, ToolMessage):
                for tu in tools_used:
                    if not tu.get("result"):
                        tu["result"] = msg.content[:500]
                        break

        response_text = ""
        for msg in reversed(result["messages"]):
            if isinstance(msg, AIMessage) and msg.content and not getattr(msg, "tool_calls", None):
                response_text = msg.content
                break

        return {
            "message": response_text or "让我想想这个问题...",
            "tools_used": tools_used,
            "phase": result.get("phase", "teaching"),
            "emotion": result.get("emotion", "neutral"),
        }

    return cached_run


app = FastAPI(title="EduMind MCP API", version="1.2.0", lifespan=lifespan)

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
    return {
        "status": "ok",
        "service": "edumind-mcp",
        "version": "1.2.0",
        "llm_provider": _detected_provider or "未配置",
        "llm_model": _provider_info.get("model", "N/A") if _provider_info else "N/A",
        "llm_ready": _cached_run_teaching is not None,
        "supported_providers": list(PROVIDER_INFO.keys()),
        "providers_configured": {
            name: bool(os.environ.get(info["env"]))
            for name, info in PROVIDER_INFO.items()
        },
    }


@app.post("/api/teach")
async def teach(req: TeachRequest):
    if len(req.message) > 2000:
        return {"error": "消息过长（最多2000字符）"}

    if _cached_run_teaching is None:
        return {"error": "LLM未初始化，请检查API Key配置", "message": "请配置LLM API Key后重启服务"}

    try:
        result = await asyncio.wait_for(
            _cached_run_teaching(req.message, req.history),
            timeout=45.0,
        )

        for ws in active_connections:
            try:
                await ws.send_json({
                    "type": "tool_call",
                    "user_id": req.user_id,
                    "tools_used": result.get("tools_used", []),
                    "phase": result.get("phase"),
                    "llm_provider": _detected_provider,
                })
            except Exception:
                pass

        return result
    except asyncio.TimeoutError:
        return {"error": "请求超时，请稍后重试", "message": "让我再想想这个问题..."}
    except ValueError as exc:
        return {"error": str(exc), "message": "请配置LLM API Key后重试"}
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
