import os
import json
import asyncio
import logging
import time
import traceback
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("edumind-mcp")

try:
    from dotenv import load_dotenv
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    if os.path.exists(env_path):
        load_dotenv(env_path)
        logger.info(f"已加载 .env 文件: {env_path}")
    else:
        logger.info("未找到 .env 文件，使用系统环境变量")
except ImportError:
    logger.info("python-dotenv 未安装，跳过 .env 加载")

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
_connections_lock = asyncio.Lock()

_cached_run_teaching = None
_detected_provider: str | None = None
_provider_info: dict = {}
_graph_error: str | None = None

_rate_limit_store: dict[str, list[float]] = {}
RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX_REQUESTS = 20


def _check_rate_limit(user_id: str) -> bool:
    now = time.time()
    if user_id not in _rate_limit_store:
        _rate_limit_store[user_id] = [now]
        return True
    requests = _rate_limit_store[user_id]
    requests = [t for t in requests if now - t < RATE_LIMIT_WINDOW]
    requests.append(now)
    _rate_limit_store[user_id] = requests
    return len(requests) <= RATE_LIMIT_MAX_REQUESTS


def _sanitize_error_message(exc: Exception) -> str:
    msg = str(exc)
    for key_name in ["api_key", "apikey", "API_KEY", "token", "Bearer"]:
        if key_name.lower() in msg.lower():
            return "API认证失败，请检查API Key配置"
    if "timeout" in msg.lower() or "timed out" in msg.lower():
        return "请求超时，请稍后重试"
    if "connection" in msg.lower():
        return "网络连接失败，请检查网络或API服务状态"
    if "401" in msg or "unauthorized" in msg.lower():
        return "API Key无效或已过期，请重新配置"
    if "429" in msg or "rate" in msg.lower():
        return "API调用频率超限，请稍后重试"
    if "500" in msg or "502" in msg or "503" in msg:
        return "API服务暂时不可用，请稍后重试"
    return f"处理时出错: {type(exc).__name__}"


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _cached_run_teaching, _detected_provider, _provider_info, _graph_error
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
            key_preview = os.environ[provider_key][:6] + "***"
            print(f"  🔑 使用Key: {provider_key}={key_preview}")

        from agent.graph import build_agent
        graph, tools = await build_agent()
        _cached_run_teaching = await _make_cached_teaching(graph)
        _provider_info = {
            "name": PROVIDER_INFO.get(
                _detected_provider.replace("auto-detect", ""), {}
            ).get("name", _detected_provider),
            "model": str(getattr(llm, 'model_name', getattr(llm, 'model', 'unknown'))),
        }
        _graph_error = None
        print(f"  🧠 ReAct图已构建，{len(tools)}个MCP工具已注册")
        print(f"  📦 模型: {_provider_info.get('model', 'unknown')}")
    except ValueError as e:
        _detected_provider = "none"
        _graph_error = str(e)
        print(f"  ⚠️  {e}")
        print(f"  ℹ️  服务将以无LLM模式运行（仅MCP工具可用）")
    except Exception as e:
        _detected_provider = "error"
        _graph_error = str(e)
        logger.error(f"LLM/Agent初始化失败: {e}\n{traceback.format_exc()}")
        print(f"  ❌ 初始化失败: {type(e).__name__}: {e}")
        print(f"  ℹ️  服务将以降级模式运行")

    yield

    async with _connections_lock:
        for ws in active_connections[:]:
            try:
                await ws.close()
            except Exception:
                pass
        active_connections.clear()

    print("\nEduMind MCP Server 关闭")


async def _make_cached_teaching(graph):
    from langchain_core.messages import HumanMessage, AIMessage, ToolMessage

    async def cached_run(message: str, history: list = []) -> dict:
        history_msgs = []
        if history:
            for msg in history[-10:]:
                role = msg.get("role", "")
                content = msg.get("content", "")
                if not content:
                    continue
                if role == "student":
                    history_msgs.append(HumanMessage(content=content))
                elif role == "tutor":
                    history_msgs.append(AIMessage(content=content))

        all_messages = history_msgs + [HumanMessage(content=message)]

        state = {
            "messages": all_messages,
            "tools_used": [],
            "observation": "",
            "phase": "teaching",
            "emotion": "neutral",
        }

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


app = FastAPI(title="EduMind MCP API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,http://localhost:5173,http://localhost:80"
    ).split(","),
    allow_credentials=True,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

plots_dir = os.path.join(os.path.dirname(__file__), "..", "assets", "plots")
os.makedirs(plots_dir, exist_ok=True)
app.mount("/plots", StaticFiles(directory=plots_dir), name="plots")


@app.get("/api/health")
async def health():
    return {
        "status": "ok" if _cached_run_teaching else "degraded",
        "service": "edumind-mcp",
        "version": "2.0.0",
        "llm_provider": _detected_provider or "未配置",
        "llm_model": _provider_info.get("model", "N/A") if _provider_info else "N/A",
        "llm_ready": _cached_run_teaching is not None,
        "init_error": _graph_error,
        "supported_providers": list(PROVIDER_INFO.keys()),
        "providers_configured": {
            name: bool(os.environ.get(info["env"]))
            for name, info in PROVIDER_INFO.items()
        },
        "active_ws_connections": len(active_connections),
    }


@app.post("/api/teach")
async def teach(req: TeachRequest):
    if not req.message or not req.message.strip():
        return {"error": "消息不能为空", "message": "请输入你的问题"}

    if len(req.message) > 2000:
        return {"error": "消息过长（最多2000字符）", "message": "请缩短你的问题（最多2000字符）"}

    if not _check_rate_limit(req.user_id or "anonymous"):
        return {"error": "请求过于频繁", "message": "请稍后再试（每分钟最多20次请求）"}

    if _cached_run_teaching is None:
        error_detail = _graph_error or "未知错误"
        logger.warning(f"teach请求失败: LLM未初始化, error={error_detail}")
        return {
            "error": "LLM未初始化",
            "message": f"服务尚未就绪。原因: {_sanitize_error_message(Exception(error_detail))}。请检查API Key配置后重启服务。",
            "phase": "error",
            "emotion": "neutral",
        }

    try:
        result = await asyncio.wait_for(
            _cached_run_teaching(req.message, req.history or []),
            timeout=60.0,
        )

        for ws in active_connections[:]:
            try:
                await ws.send_json({
                    "type": "tool_call",
                    "user_id": req.user_id,
                    "tools_used": result.get("tools_used", []),
                    "phase": result.get("phase"),
                    "llm_provider": _detected_provider,
                })
            except Exception:
                async with _connections_lock:
                    if ws in active_connections:
                        active_connections.remove(ws)

        return result
    except asyncio.TimeoutError:
        logger.warning(f"teach请求超时: user={req.user_id}, message={req.message[:50]}")
        return {"error": "请求超时", "message": "思考时间过长，请换个简单的问题试试", "phase": "error", "emotion": "neutral"}
    except ValueError as exc:
        logger.error(f"teach ValueError: {exc}")
        return {"error": str(exc), "message": "请配置LLM API Key后重试", "phase": "error", "emotion": "neutral"}
    except Exception as exc:
        logger.error(f"teach异常: {type(exc).__name__}: {exc}\n{traceback.format_exc()}")
        safe_msg = _sanitize_error_message(exc)
        return {"error": safe_msg, "message": safe_msg, "phase": "error", "emotion": "neutral"}


@app.websocket("/ws/events")
async def websocket_events(websocket: WebSocket):
    await websocket.accept()
    async with _connections_lock:
        active_connections.append(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        async with _connections_lock:
            if websocket in active_connections:
                active_connections.remove(websocket)


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("MCP_PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
