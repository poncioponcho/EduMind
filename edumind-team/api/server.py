"""FastAPI server for EduMind A2A Team with WebSocket monitoring."""

import asyncio
import json
import logging
import os
import sys
import traceback
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Path setup
_PROJECT_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)
_MCP_ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "edumind-mcp")
if _MCP_ROOT not in sys.path:
    sys.path.insert(0, _MCP_ROOT)

try:
    from dotenv import load_dotenv
    for _env_path in [
        os.path.join(_PROJECT_ROOT, ".env"),
        os.path.join(_MCP_ROOT, ".env"),
    ]:
        if os.path.exists(_env_path):
            load_dotenv(_env_path, override=False)
            break
except ImportError:
    pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("edumind-team.api")

from a2a_bus.protocol import A2ABus, A2AMessage, MsgType, _gen_id
from a2a_bus.registry import AgentRegistry
from agents import TutorAgent, LabAgent, QuizAgent, EmpathyAgent, ParentAgent


# ---------------------------------------------------------------------------
# Global state
# ---------------------------------------------------------------------------
_bus: Optional[A2ABus] = None
_agents: dict[str, Any] = {}
_registry: Optional[AgentRegistry] = None
_active_ws: list[WebSocket] = []
_ws_lock = asyncio.Lock()


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class TeachRequest(BaseModel):
    message: str
    student_id: Optional[str] = "anonymous"
    history: Optional[list] = None


class QuizAnswerRequest(BaseModel):
    qid: Optional[str] = None
    question_id: Optional[str] = None
    answer: str
    student_id: Optional[str] = "anonymous"
    concept: Optional[str] = "通用数学"

    @property
    def effective_qid(self):
        return self.qid or self.question_id or "unknown"


class ReportRequest(BaseModel):
    student_id: str
    report_type: str = "daily"  # daily | weekly
    date: Optional[str] = None


class AgentChatRequest(BaseModel):
    from_agent: str = "student"
    to_agent: str = "tutor"
    skill: Optional[str] = None
    params: Optional[dict] = None
    message: Optional[str] = None
    msg_type: Optional[str] = None


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _bus, _agents, _registry
    logger.info("EduMind A2A Team Server starting...")

    _bus = A2ABus()
    _registry = AgentRegistry()

    # LLM (optional)
    llm = None
    try:
        from agent.llm_provider import get_llm
        llm = get_llm()
        logger.info("LLM ready")
    except Exception as exc:
        logger.warning(f"LLM unavailable: {exc}")

    _agents = {
        "tutor": TutorAgent(_bus, llm),
        "lab_assistant": LabAgent(_bus, llm),
        "quiz_teacher": QuizAgent(_bus, llm),
        "empathy": EmpathyAgent(_bus, llm),
        "parent_liaison": ParentAgent(_bus, llm),
    }
    for aid, agent in _agents.items():
        _bus.register(aid, agent.handle)

    # Wire bus monitor -> websockets
    async def _monitor(msg: A2AMessage):
        payload = {
            "type": "a2a_message",
            "data": msg.to_dict(),
        }
        async with _ws_lock:
            dead = []
            for ws in _active_ws:
                try:
                    await ws.send_json(payload)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                _active_ws.remove(ws)

    _bus.add_monitor(_monitor)

    logger.info("All 5 agents registered. Server ready.")
    yield

    async with _ws_lock:
        for ws in _active_ws[:]:
            try:
                await ws.close()
            except Exception:
                pass
        _active_ws.clear()
    logger.info("Server shutdown complete.")


app = FastAPI(title="EduMind A2A Team API", version="3.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8080",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8080",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend monitor
_FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "a2a_monitor")
if os.path.isdir(_FRONTEND_DIR):
    app.mount("/monitor", StaticFiles(directory=_FRONTEND_DIR, html=True), name="monitor")

# Serve plots (from lab agent)
_PLOTS_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "plots")
os.makedirs(_PLOTS_DIR, exist_ok=True)
app.mount("/plots", StaticFiles(directory=_PLOTS_DIR), name="plots")


# ---------------------------------------------------------------------------
# HTTP endpoints
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health():
    agent_status = _bus.health.get_all_status() if _bus else {}
    return {
        "status": "ok",
        "service": "edumind-a2a-team",
        "version": "3.0.0",
        "agents": list(_agents.keys()) if _agents else [],
        "agent_status": agent_status,
        "llm_ready": _agents.get("tutor") is not None and _agents["tutor"].llm is not None,
        "metrics": _bus.get_metrics() if _bus else {},
    }


@app.post("/api/teach")
async def teach(req: TeachRequest):
    if not req.message or not req.message.strip():
        return {"error": "消息不能为空"}
    if len(req.message) > 2000:
        return {"error": "消息过长"}

    tutor = _agents.get("tutor")
    if not tutor:
        return {"error": "Tutor agent not initialized"}

    try:
        tutor.student_context["student_id"] = req.student_id or "anonymous"
        task_id = _gen_id()
        intent = tutor._classify_intent(req.message)
        a2a_msg = A2AMessage(
            task_id=task_id,
            from_agent="student",
            to_agent="tutor",
            msg_type=MsgType.TASK_REQUEST.value,
            content={"message": req.message, "student_id": req.student_id or "anonymous", "intent": intent},
            role="student",
        )
        result = await asyncio.wait_for(tutor.handle(a2a_msg), timeout=30.0)
        response = {
            "message": result.content.get("message", ""),
            "student_id": req.student_id,
            "intent": result.content.get("intent", intent),
            "delegated_to": result.content.get("delegated_to"),
            "avatar_emotion": result.content.get("avatar_emotion"),
        }
        return response
    except asyncio.TimeoutError:
        return {"error": "请求超时"}
    except Exception as exc:
        logger.error(f"teach error: {exc}\n{traceback.format_exc()}")
        return {"error": str(exc)}


@app.post("/api/quiz/answer")
async def quiz_answer(req: QuizAnswerRequest):
    quiz = _agents.get("quiz_teacher")
    if not quiz:
        return {"error": "Quiz agent not initialized"}

    msg = A2AMessage(
        task_id=_gen_id(),
        from_agent="api",
        to_agent="quiz_teacher",
        msg_type="task_request",
        content={
            "skill": "grade_answer",
            "qid": req.effective_qid,
            "answer": req.answer,
            "student_id": req.student_id,
            "concept": req.concept,
        },
    )
    try:
        resp = await asyncio.wait_for(_bus.send(msg), timeout=15.0)
        return resp.content
    except Exception as exc:
        return {"error": str(exc)}


@app.get("/api/quiz/{concept}")
async def get_quiz(concept: str, student_id: Optional[str] = "anonymous", count: int = 3):
    msg = A2AMessage(
        task_id=_gen_id(),
        from_agent="api",
        to_agent="quiz_teacher",
        msg_type="task_request",
        content={
            "skill": "generate_quiz",
            "concept": concept,
            "student_id": student_id,
            "count": count,
            "difficulty": "adaptive",
        },
    )
    try:
        resp = await asyncio.wait_for(_bus.send(msg), timeout=15.0)
        return resp.content
    except Exception as exc:
        return {"error": str(exc)}


class QuizRequest(BaseModel):
    concept: str = "导数"
    student_id: Optional[str] = "anonymous"
    count: int = 3


@app.post("/api/quiz")
async def post_quiz(req: QuizRequest):
    msg = A2AMessage(
        task_id=_gen_id(),
        from_agent="api",
        to_agent="quiz_teacher",
        msg_type="task_request",
        content={
            "skill": "generate_quiz",
            "concept": req.concept,
            "student_id": req.student_id,
            "count": req.count,
            "difficulty": "adaptive",
        },
    )
    try:
        resp = await asyncio.wait_for(_bus.send(msg), timeout=15.0)
        return resp.content
    except Exception as exc:
        return {"error": str(exc)}


@app.post("/api/report")
async def generate_report(req: ReportRequest):
    parent = _agents.get("parent_liaison")
    if not parent:
        return {"error": "Parent agent not initialized"}

    skill = "generate_daily_report" if req.report_type == "daily" else "generate_weekly_report"
    date_val = req.date or datetime.now().strftime("%Y-%m-%d")
    msg = A2AMessage(
        task_id=_gen_id(),
        from_agent="api",
        to_agent="parent_liaison",
        msg_type="task_request",
        content={"skill": skill, "student_id": req.student_id, "date": date_val, "week_start": date_val},
    )
    try:
        resp = await asyncio.wait_for(_bus.send(msg), timeout=15.0)
        return resp.content
    except Exception as exc:
        return {"error": str(exc)}


@app.post("/api/agent/chat")
async def agent_chat(req: AgentChatRequest):
    """Direct A2A endpoint to send a task_request between agents."""
    content = {}
    if req.skill:
        content["skill"] = req.skill
    if req.params:
        content.update(req.params)
    if req.message:
        content["message"] = req.message
    if not content:
        content = {"message": ""}

    msg_type = req.msg_type or "task_request"
    msg = A2AMessage(
        task_id=_gen_id(),
        from_agent=req.from_agent,
        to_agent=req.to_agent,
        msg_type=msg_type,
        content=content,
    )
    try:
        resp = await asyncio.wait_for(_bus.send(msg), timeout=20.0)
        return {"result": resp.content, "meta": resp.to_dict()}
    except Exception as exc:
        return {"error": str(exc)}


@app.get("/api/a2a/history")
async def a2a_history(limit: int = 200):
    return {"history": _bus.get_history(limit)}


@app.get("/api/agents")
async def list_agents():
    agents_info = []
    for aid, agent in _agents.items():
        desc = _registry.get_descriptor(aid) if _registry else None
        agents_info.append({
            "agent_id": aid,
            "skills": [s.name for s in desc.skills] if desc else [],
            "can_delegate_to": desc.can_delegate_to if desc else [],
        })
    return {"agents": agents_info}


# ---------------------------------------------------------------------------
# WebSocket for real-time A2A monitor
# ---------------------------------------------------------------------------
@app.websocket("/ws/monitor")
async def ws_monitor(websocket: WebSocket):
    await websocket.accept()
    async with _ws_lock:
        _active_ws.append(websocket)
    logger.info(f"Monitor WS connected (total: {len(_active_ws)})")

    # Send current agent list
    try:
        await websocket.send_json({
            "type": "agent_list",
            "agents": list(_agents.keys()),
        })
    except Exception:
        pass

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
            elif msg.get("type") == "get_history":
                await websocket.send_json({
                    "type": "history",
                    "history": _bus.get_history(msg.get("limit", 100)),
                })
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        async with _ws_lock:
            if websocket in _active_ws:
                _active_ws.remove(websocket)
        logger.info(f"Monitor WS disconnected (total: {len(_active_ws)})")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("A2A_PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port)
