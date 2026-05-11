import os
import sys
import json
import asyncio
import logging
import traceback
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("edumind-cognitive")

_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_MCP_ROOT = os.path.join(_PROJECT_ROOT, "edumind-mcp")

for p in [_PROJECT_ROOT, _MCP_ROOT]:
    if p not in sys.path and os.path.isdir(p):
        sys.path.insert(0, p)

try:
    from dotenv import load_dotenv
    _possible_env_paths = [
        os.path.join(_MCP_ROOT, ".env"),
        os.path.join(_PROJECT_ROOT, ".env"),
    ]
    for env_path in _possible_env_paths:
        if os.path.exists(env_path):
            load_dotenv(env_path)
            logger.info(f"已加载 .env 文件: {env_path}")
            break
    else:
        logger.info("未找到 .env 文件，使用系统环境变量")
except ImportError:
    logger.info("python-dotenv 未安装，跳过 .env 加载")

from kg.neo4j_client import kg


class DiagnoseRequest(BaseModel):
    student_id: str = "anonymous"
    topic: str
    answer: str = ""


class TeachRequest(BaseModel):
    student_id: str = "anonymous"
    topic: str
    message: str
    session_id: Optional[str] = None


class ApprovalRequest(BaseModel):
    student_id: str
    session_id: str
    action: str


class MasteryUpdateRequest(BaseModel):
    student_id: str
    concept: str
    level: float


_cached_graph = None
_llm_ready = False
_init_error = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _cached_graph, _llm_ready, _init_error
    print("=" * 50)
    print("EduMind 认知诊断多Agent系统 启动中...")
    print("-" * 50)

    try:
        from agent.llm_provider import get_llm
        llm = get_llm()
        _llm_ready = True
        provider_key = next(
            (k for k in ["GOOGLE_API_KEY", "DASHSCOPE_API_KEY", "MOONSHOT_API_KEY", "OPENAI_API_KEY"]
             if os.environ.get(k)), None
        )
        print(f"  ✅ LLM已就绪")
        if provider_key:
            key_preview = os.environ[provider_key][:6] + "***"
            print(f"  🔑 使用Key: {provider_key}={key_preview}")

        from cognitive_workflow.graph import get_graph
        _cached_graph = get_graph()
        print(f"  🧠 LangGraph认知图已构建")
    except ImportError as e:
        _init_error = f"依赖缺失: {e}"
        print(f"  ❌ {_init_error}")
        print(f"  ℹ️  请确保 edumind-mcp 的虚拟环境已激活并安装了依赖")
    except ValueError as e:
        _init_error = f"API Key未配置: {e}"
        print(f"  ❌ {_init_error}")
    except Exception as e:
        _init_error = f"{type(e).__name__}: {e}"
        logger.error(f"初始化失败: {e}\n{traceback.format_exc()}")
        print(f"  ❌ 初始化失败: {e}")

    print(f"  📊 知识图谱: {len(kg.get_all_concepts())}个概念, {len(kg._graph['misconceptions'])}个错误模式")
    print(f"  🔗 Neo4j: {'已连接' if kg._use_neo4j else '内存模式'}")
    yield
    print("\nEduMind 认知诊断系统 关闭")


app = FastAPI(title="EduMind Cognitive API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", "http://localhost:3001", "http://localhost:3002",
        "http://localhost:3003", "http://localhost:5173", "http://localhost:80",
    ],
    allow_credentials=True,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/api/health")
async def health():
    return {
        "status": "ok" if _llm_ready else "degraded",
        "service": "edumind-cognitive",
        "version": "1.0.0",
        "port": int(os.environ.get("COGNITIVE_PORT", "8001")),
        "llm_ready": _llm_ready,
        "init_error": _init_error,
        "kg_concepts": len(kg.get_all_concepts()),
        "kg_misconceptions": len(kg._graph["misconceptions"]),
        "neo4j_connected": kg._use_neo4j,
        "graph_built": _cached_graph is not None,
    }


@app.get("/api/concepts")
async def get_concepts():
    concepts = kg.get_all_concepts()
    return {"concepts": concepts, "total": len(concepts)}


@app.get("/api/mastery/{student_id}")
async def get_mastery(student_id: str):
    mastery = kg._student_mastery.get(student_id, {})
    return {"student_id": student_id, "mastery": mastery}


@app.post("/api/mastery")
async def update_mastery(req: MasteryUpdateRequest):
    if req.level < 0 or req.level > 1:
        return {"error": "掌握度必须在0-1之间"}
    kg.update_mastery(req.student_id, req.concept, req.level)
    return {"success": True, "concept": req.concept, "level": req.level}


@app.post("/api/diagnose")
async def diagnose(req: DiagnoseRequest):
    misconceptions = kg.get_misconceptions(req.topic)
    prerequisites = kg.get_prerequisites(req.topic)
    mastery = kg.get_student_mastery(req.student_id, req.topic)

    return {
        "topic": req.topic,
        "student_id": req.student_id,
        "current_mastery": mastery,
        "misconceptions": misconceptions,
        "prerequisites": prerequisites,
        "missing_prerequisites": kg.get_prerequisite_path(req.topic, req.student_id),
    }


@app.post("/api/teach")
async def teach(req: TeachRequest):
    if not _llm_ready or not _cached_graph:
        error_detail = _init_error or "LLM或Graph未初始化"
        return {
            "error": "服务尚未就绪",
            "message": f"认知诊断服务降级运行。原因: {error_detail}",
            "diagnosis": {},
            "learning_plan": {},
            "emotion": "neutral",
        }

    try:
        from langchain_core.messages import HumanMessage

        state = {
            "messages": [HumanMessage(content=req.message)],
            "student_id": req.student_id,
            "current_topic": req.topic,
            "diagnosis": {},
            "learning_plan": {},
            "last_answer": req.message,
            "iteration": 0,
            "plan_completed": False,
            "awaiting_human": False,
            "human_input": "",
            "human_prompt": "",
            "avatar_emotion": "neutral",
            "next_step": "",
        }

        config = {"configurable": {"thread_id": req.session_id or req.student_id}}
        result = await asyncio.wait_for(
            _cached_graph.ainvoke(state, config),
            timeout=60.0,
        )

        response_text = ""
        for msg in reversed(result.get("messages", [])):
            if hasattr(msg, "content") and msg.content:
                response_text = msg.content
                break

        return {
            "message": response_text,
            "diagnosis": result.get("diagnosis", {}),
            "learning_plan": result.get("learning_plan", {}),
            "emotion": result.get("avatar_emotion", "neutral"),
            "awaiting_human": result.get("awaiting_human", False),
            "human_prompt": result.get("human_prompt", ""),
            "plan_completed": result.get("plan_completed", False),
        }
    except asyncio.TimeoutError:
        return {"error": "timeout", "message": "认知分析超时，请简化问题后重试"}
    except Exception as e:
        logger.error(f"teach异常: {e}\n{traceback.format_exc()}")
        return {"error": type(e).__name__, "message": "处理时出错，请重试"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("COGNITIVE_PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port)
