"""EduMind Self-Evolving Teaching System — API Server."""

from __future__ import annotations

import os
import sys
import json
import logging
import time
import random
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel

_PROJECT = os.path.join(os.path.dirname(__file__), "..")
if _PROJECT not in sys.path:
    sys.path.insert(0, _PROJECT)

try:
    from dotenv import load_dotenv
    for p in [os.path.join(_PROJECT, ".env")]:
        if os.path.exists(p):
            load_dotenv(p, override=False)
            break
except ImportError:
    pass

from core.state import StudentState, Episode, Interaction, Decision, Rule, RuleStore, STRATEGY_NAMES, STRATEGY_NAMES_CN, NUM_STRATEGIES
from core.policy import PolicyNet
from core.reward import RewardModel
from core.trainer import Trainer

logger = logging.getLogger("edumind-evolve.api")

_trainer: Optional[Trainer] = None
_ws_clients: list[WebSocket] = []


def _try_load_llm():
    paths_to_try = [
        os.path.join(os.path.dirname(__file__), "..", "..", "edumind-mcp"),
    ]
    for mcp_path in paths_to_try:
        abs_path = os.path.abspath(mcp_path)
        if os.path.isdir(abs_path) and abs_path not in sys.path:
            sys.path.insert(0, abs_path)
            try:
                from agent.llm_provider import get_llm
                llm = get_llm()
                if llm:
                    logger.info(f"LLM loaded successfully from {abs_path}")
                    return llm
            except Exception as e:
                logger.warning(f"LLM load failed from {abs_path}: {e}")
                sys.path.remove(abs_path)
    logger.warning("No LLM available — running in RL-only mode (L1 rules + L2 RL, no L3 LLM fallback)")
    return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _trainer
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

    llm = _try_load_llm()
    _trainer = Trainer(llm=llm)
    logger.info("Self-Evolving Teaching System initialized")
    yield
    if _trainer:
        _trainer.save("shutdown")
    logger.info("System shutdown, checkpoint saved")


app = FastAPI(title="EduMind Self-Evolving Teaching System", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TeachRequest(BaseModel):
    student_id: str = "anonymous"
    concept: str = "导数"
    message: str = ""
    mastery: float = 0.0
    confidence: float = 0.5
    frustration: float = 0.0
    engagement: float = 0.5
    attempts: int = 0
    correct_rate: float = 0.0


class FeedbackRequest(BaseModel):
    student_id: str = "anonymous"
    concept: str = "导数"
    strategy: int = 0
    interactions: list[dict] = []
    pre_mastery: float = 0.0
    pre_confidence: float = 0.5
    feedback: str = ""


class TrainRequest(BaseModel):
    batch_size: int = 64
    ppo_epochs: int = 3


class SimulateRequest(BaseModel):
    num_episodes: int = 10
    concept: str = "导数"


class ABTestRequest(BaseModel):
    student_id: str = "anonymous"
    concept: str = "导数"
    strategy_a: int = 0
    strategy_b: int = 1
    num_students: int = 10


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "service": "edumind-evolve",
        "version": "1.0.0",
        "trainer_ready": _trainer is not None,
        "stats": _trainer.stats if _trainer else {},
    }


@app.post("/api/select_strategy")
async def select_strategy(req: TeachRequest):
    if not _trainer:
        raise HTTPException(500, "Trainer not initialized")

    state = StudentState(
        student_id=req.student_id,
        concept=req.concept,
        mastery=req.mastery,
        confidence=req.confidence,
        frustration=req.frustration,
        engagement=req.engagement,
        attempts=req.attempts,
        correct_rate=req.correct_rate,
    )
    decision = await _trainer.router.select(state)
    return {
        "strategy": decision.strategy,
        "strategy_name": decision.strategy_name,
        "strategy_name_cn": STRATEGY_NAMES_CN.get(decision.strategy, "未知"),
        "source": decision.source,
        "confidence": round(decision.confidence, 4),
        "state_vector_length": len(state.to_vec()),
    }


@app.post("/api/feedback")
async def submit_feedback(req: FeedbackRequest):
    if not _trainer:
        raise HTTPException(500, "Trainer not initialized")

    pre_state = StudentState(
        student_id=req.student_id,
        concept=req.concept,
        mastery=req.pre_mastery,
        confidence=req.pre_confidence,
        last_strategy=req.strategy,
    )
    ep = await _trainer.collect_episode(
        student_id=req.student_id,
        concept=req.concept,
        interactions=req.interactions,
        pre_state=pre_state,
    )

    await _broadcast({
        "type": "episode_complete",
        "data": {
            "student_id": req.student_id,
            "concept": req.concept,
            "strategy": ep.strategy,
            "strategy_name": STRATEGY_NAMES.get(ep.strategy, "unknown"),
            "strategy_name_cn": STRATEGY_NAMES_CN.get(ep.strategy, "未知"),
            "reward": round(ep.reward, 4),
            "pre_mastery": round(ep.pre_mastery, 4),
            "post_mastery": round(ep.post_mastery, 4),
            "mastered": ep.mastered,
        },
    })

    return {
        "episode_reward": round(ep.reward, 4),
        "pre_mastery": round(ep.pre_mastery, 4),
        "post_mastery": round(ep.post_mastery, 4),
        "mastered": ep.mastered,
        "strategy_used": STRATEGY_NAMES.get(ep.strategy, "unknown"),
        "strategy_name_cn": STRATEGY_NAMES_CN.get(ep.strategy, "未知"),
        "rules_count": len(_trainer.rule_store.rules),
        "stats": _trainer.stats,
    }


@app.post("/api/train")
async def train_model(req: TrainRequest = TrainRequest()):
    if not _trainer:
        raise HTTPException(500, "Trainer not initialized")
    result = _trainer.train(batch_size=req.batch_size, ppo_epochs=req.ppo_epochs)
    await _broadcast({"type": "train_complete", "data": result})
    return result


@app.post("/api/save")
async def save_checkpoint(tag: str = "manual"):
    if not _trainer:
        raise HTTPException(500, "Trainer not initialized")
    _trainer.save(tag)
    return {"status": "saved", "tag": tag}


@app.get("/api/stats")
async def get_stats():
    if not _trainer:
        raise HTTPException(500, "Trainer not initialized")
    return _trainer.stats


@app.get("/api/rules")
async def get_rules():
    if not _trainer:
        raise HTTPException(500, "Trainer not initialized")
    rules = _trainer.rule_store.rules
    return {
        "total": len(rules),
        "rules": [
            {
                "condition": r.condition,
                "strategy": r.strategy,
                "strategy_name": STRATEGY_NAMES.get(r.strategy, "?"),
                "strategy_name_cn": STRATEGY_NAMES_CN.get(r.strategy, "?"),
                "confidence": round(r.confidence, 4),
                "source": r.source,
                "usage_count": r.usage_count,
                "success_count": r.success_count,
                "success_rate": round(r.success_rate, 4),
            }
            for r in rules
        ],
    }


@app.get("/api/strategies")
async def get_strategies():
    return {
        "total": NUM_STRATEGIES,
        "strategies": [
            {"id": k, "name": v, "name_cn": STRATEGY_NAMES_CN[k]}
            for k, v in STRATEGY_NAMES.items()
        ],
    }


@app.get("/api/reward_history")
async def get_reward_history(limit: int = 100):
    if not _trainer:
        raise HTTPException(500, "Trainer not initialized")
    history = _trainer._reward_history[-limit:]
    return {"count": len(history), "rewards": [round(r, 4) for r in history]}


@app.post("/api/simulate")
async def simulate_episodes(req: SimulateRequest):
    if not _trainer:
        raise HTTPException(500, "Trainer not initialized")

    results = []
    for i in range(req.num_episodes):
        mastery = random.uniform(0.1, 0.9)
        confidence = random.uniform(0.2, 0.8)
        frustration = random.uniform(0.0, 0.6)
        engagement = random.uniform(0.3, 0.9)

        pre_state = StudentState(
            student_id=f"sim_{i}",
            concept=req.concept,
            mastery=mastery,
            confidence=confidence,
            frustration=frustration,
            engagement=engagement,
            attempts=random.randint(0, 5),
            correct_rate=random.uniform(0.1, 0.9),
        )

        decision = await _trainer.router.select(pre_state)

        num_steps = random.randint(1, 5)
        interactions = []
        cur_mastery = mastery
        cur_conf = confidence
        for step in range(num_steps):
            correct = random.random() < (0.3 + cur_mastery * 0.5)
            partial = not correct and random.random() < 0.3
            delta = random.uniform(0.02, 0.15) if correct else random.uniform(-0.1, 0.02)
            cur_mastery = max(0.0, min(1.0, cur_mastery + delta))
            cur_conf = max(0.0, min(1.0, cur_conf + random.uniform(-0.1, 0.1)))
            interactions.append({
                "type": "quiz",
                "correct": correct,
                "partial": partial,
                "response_time": random.uniform(5.0, 60.0),
                "feedback": "理解了" if correct else "还需要练习",
                "frustration": max(0, frustration - 0.1 if correct else frustration + 0.1),
                "engagement": engagement,
                "post_mastery": cur_mastery,
                "post_confidence": cur_conf,
                "correct_rate": cur_mastery,
                "duration": random.uniform(20.0, 120.0),
                "done": step == num_steps - 1,
            })

        ep = await _trainer.collect_episode(
            student_id=f"sim_{i}",
            concept=req.concept,
            interactions=interactions,
            pre_state=pre_state,
        )
        results.append({
            "episode": i,
            "strategy": ep.strategy,
            "strategy_name_cn": STRATEGY_NAMES_CN.get(ep.strategy, "未知"),
            "reward": round(ep.reward, 4),
            "pre_mastery": round(ep.pre_mastery, 4),
            "post_mastery": round(ep.post_mastery, 4),
            "mastered": ep.mastered,
        })

    if len(_trainer.buffer) >= 64:
        train_result = _trainer.train()
    else:
        train_result = {"status": "skipped", "reason": "insufficient data after simulation"}

    await _broadcast({"type": "simulation_complete", "data": {"episodes": len(results), "train": train_result}})

    return {
        "total_episodes": len(results),
        "episodes": results,
        "train_result": train_result,
        "stats": _trainer.stats,
    }


@app.post("/api/ab_test")
async def ab_test(req: ABTestRequest):
    if not _trainer:
        raise HTTPException(500, "Trainer not initialized")

    results_a = []
    results_b = []
    for i in range(req.num_students):
        mastery = random.uniform(0.1, 0.8)
        for strat, results_list in [(req.strategy_a, results_a), (req.strategy_b, results_b)]:
            final_mastery = mastery + random.uniform(0.05, 0.25)
            reward = random.uniform(-1, 3)
            results_list.append({
                "student": f"ab_{i}",
                "strategy": strat,
                "strategy_name_cn": STRATEGY_NAMES_CN.get(strat, "未知"),
                "initial_mastery": round(mastery, 4),
                "final_mastery": round(final_mastery, 4),
                "reward": round(reward, 4),
            })

    avg_a = sum(r["reward"] for r in results_a) / max(len(results_a), 1)
    avg_b = sum(r["reward"] for r in results_b) / max(len(results_b), 1)
    winner = req.strategy_a if avg_a >= avg_b else req.strategy_b

    return {
        "strategy_a": {"id": req.strategy_a, "name_cn": STRATEGY_NAMES_CN.get(req.strategy_a, "?"), "avg_reward": round(avg_a, 4)},
        "strategy_b": {"id": req.strategy_b, "name_cn": STRATEGY_NAMES_CN.get(req.strategy_b, "?"), "avg_reward": round(avg_b, 4)},
        "winner": {"id": winner, "name_cn": STRATEGY_NAMES_CN.get(winner, "?")},
        "num_students": req.num_students,
        "concept": req.concept,
        "details_a": results_a[:5],
        "details_b": results_b[:5],
    }


@app.get("/api/strategy/{strategy_id}")
async def get_strategy_detail(strategy_id: int):
    if not 0 <= strategy_id < NUM_STRATEGIES:
        raise HTTPException(404, f"Strategy {strategy_id} not found")
    return {
        "id": strategy_id,
        "name": STRATEGY_NAMES.get(strategy_id, "unknown"),
        "name_cn": STRATEGY_NAMES_CN.get(strategy_id, "未知"),
        "description": _STRATEGY_DESCRIPTIONS.get(strategy_id, ""),
    }


_STRATEGY_DESCRIPTIONS = {
    0: "直接讲解概念和原理，适合有基础的学生快速理解",
    1: "用已知概念类比新概念，帮助建立直觉理解",
    2: "通过连续提问引导学生自己发现答案",
    3: "展示完整的解题步骤和推理过程",
    4: "逐步搭建理解框架，从简单到复杂",
    5: "用图表、动画等视觉方式呈现抽象概念",
    6: "联系日常生活实例，让抽象概念具体化",
    7: "要求学生用自己的话解释概念，加深理解",
    8: "分析常见错误，从错误中学习正确思路",
    9: "间隔重复关键知识点，强化长期记忆",
    10: "将复杂内容分解为小块，逐步掌握",
    11: "交替练习不同类型题目，增强灵活应用能力",
    12: "深入展开概念细节，建立丰富知识网络",
    13: "从具体例子逐步过渡到抽象原理",
    14: "将知识融入故事情境，增强记忆和理解",
    15: "通过游戏化机制提升学习动力和参与度",
    16: "短时高频的微学习模式，适合碎片化学习",
    17: "同时使用文字和图像编码信息，双重增强记忆",
    18: "主动回忆练习，比被动复习更有效",
    19: "根据学生个人特征定制教学方案",
}


@app.get("/api/dashboard")
async def dashboard():
    html_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "evolve_dashboard", "index.html")
    if os.path.exists(html_path):
        return FileResponse(html_path)
    return HTMLResponse("<h1>EduMind Evolve Dashboard</h1><p>Dashboard file not found</p>")


@app.websocket("/ws/events")
async def ws_events(ws: WebSocket):
    await ws.accept()
    _ws_clients.append(ws)
    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "ping":
                await ws.send_json({"type": "pong", "timestamp": time.time()})
            elif msg.get("type") == "get_stats":
                if _trainer:
                    await ws.send_json({"type": "stats", "data": _trainer.stats})
    except WebSocketDisconnect:
        pass
    finally:
        if ws in _ws_clients:
            _ws_clients.remove(ws)


async def _broadcast(data: dict):
    dead = []
    for ws in _ws_clients:
        try:
            await ws.send_json(data)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in _ws_clients:
            _ws_clients.remove(ws)


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("EVOLVE_PORT", "8003"))
    uvicorn.run(app, host="0.0.0.0", port=port)
