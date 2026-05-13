"""EduMind A2A Message Bus — Enhanced with error handling, permissions, monitoring, and persistence."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Optional

logger = logging.getLogger("edumind-team.a2a_bus")

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
os.makedirs(DATA_DIR, exist_ok=True)


def _gen_id() -> str:
    return str(uuid.uuid4())[:8]


class TaskState(Enum):
    SUBMITTED = "submitted"
    WORKING = "working"
    AWAITING_INPUT = "awaiting_input"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"
    DEGRADED = "degraded"


class MsgType(Enum):
    TASK_REQUEST = "task_request"
    STATUS_UPDATE = "status_update"
    RESULT = "result"
    CLARIFY = "clarify"
    BROADCAST = "broadcast"
    HEARTBEAT = "heartbeat"
    ERROR = "error"
    DELEGATION = "delegation"


@dataclass
class A2AMessage:
    task_id: str
    from_agent: str
    to_agent: str
    msg_type: str
    content: dict
    parent_id: Optional[str] = None
    priority: int = 1
    timestamp: float = field(default_factory=lambda: time.time())
    retry_count: int = 0
    max_retries: int = 3
    timeout_seconds: float = 30.0
    role: str = "student"

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "from_agent": self.from_agent,
            "to_agent": self.to_agent,
            "msg_type": self.msg_type,
            "content": self.content,
            "parent_id": self.parent_id,
            "priority": self.priority,
            "timestamp": self.timestamp,
            "retry_count": self.retry_count,
            "max_retries": self.max_retries,
            "timeout_seconds": self.timeout_seconds,
            "role": self.role,
        }


class PermissionManager:
    ROLE_PERMISSIONS = {
        "student": {"teach", "quiz", "demo", "emotion_support", "view_report"},
        "teacher": {"teach", "quiz", "demo", "emotion_support", "view_report", "manage_quiz", "view_analytics"},
        "parent": {"view_report", "view_analytics"},
        "admin": {"teach", "quiz", "demo", "emotion_support", "view_report", "manage_quiz", "view_analytics", "manage_agents", "system_config"},
    }

    def check_permission(self, role: str, action: str) -> bool:
        perms = self.ROLE_PERMISSIONS.get(role, set())
        return action in perms

    def filter_response(self, role: str, data: dict) -> dict:
        if role == "admin":
            return data
        filtered = dict(data)
        if role == "parent":
            filtered.pop("raw_emotion_data", None)
            filtered.pop("detailed_diagnosis", None)
        if role == "student":
            filtered.pop("internal_delegation_log", None)
            filtered.pop("bkt_params", None)
        return filtered


class HealthMonitor:
    def __init__(self):
        self._agent_health: dict[str, dict] = {}
        self._alert_callbacks: list[Callable] = []
        self._start_time = time.time()
        self._registration_times: dict[str, float] = {}

    def update_heartbeat(self, agent_id: str):
        if agent_id not in self._registration_times:
            self._registration_times[agent_id] = time.time()
        self._agent_health[agent_id] = {
            "last_heartbeat": time.time(),
            "status": "online",
            "uptime": time.time() - self._registration_times.get(agent_id, self._start_time),
        }

    def mark_failed(self, agent_id: str, error: str):
        self._agent_health[agent_id] = {
            "last_heartbeat": time.time(),
            "status": "failed",
            "error": error,
        }
        for cb in self._alert_callbacks:
            try:
                cb(agent_id, "failed", error)
            except Exception:
                pass

    def get_status(self, agent_id: str) -> str:
        info = self._agent_health.get(agent_id, {})
        last_hb = info.get("last_heartbeat", 0)
        if time.time() - last_hb > 60:
            return "offline"
        return info.get("status", "unknown")

    def get_all_status(self) -> dict[str, str]:
        return {aid: self.get_status(aid) for aid in self._agent_health}

    def add_alert_callback(self, cb: Callable):
        self._alert_callbacks.append(cb)


class DataPersistence:
    def __init__(self, data_dir: str = DATA_DIR):
        self._dir = data_dir
        os.makedirs(self._dir, exist_ok=True)

    def save_interaction(self, student_id: str, data: dict):
        path = os.path.join(self._dir, f"interaction_{student_id}.jsonl")
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(data, ensure_ascii=False) + "\n")

    def load_interactions(self, student_id: str, limit: int = 100) -> list[dict]:
        path = os.path.join(self._dir, f"interaction_{student_id}.jsonl")
        if not os.path.exists(path):
            return []
        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()[-limit:]
        return [json.loads(line) for line in lines if line.strip()]

    def save_learning_progress(self, student_id: str, progress: dict):
        path = os.path.join(self._dir, f"progress_{student_id}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(progress, f, ensure_ascii=False, indent=2)

    def load_learning_progress(self, student_id: str) -> dict:
        path = os.path.join(self._dir, f"progress_{student_id}.json")
        if not os.path.exists(path):
            return {}
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)


class A2ABus:
    def __init__(self, max_history: int = 500):
        self._handlers: dict[str, Callable] = {}
        self._history: list[dict] = []
        self._max_history = max_history
        self._monitor_callbacks: list[Callable] = []
        self._task_states: dict[str, TaskState] = {}
        self._permissions = PermissionManager()
        self._health = HealthMonitor()
        self._persistence = DataPersistence()
        self._delegation_count = 0
        self._emotion_count = 0
        self._message_count = 0

    @property
    def permissions(self) -> PermissionManager:
        return self._permissions

    @property
    def health(self) -> HealthMonitor:
        return self._health

    @property
    def persistence(self) -> DataPersistence:
        return self._persistence

    def register(self, agent_id: str, handler: Callable):
        self._handlers[agent_id] = handler
        self._health.update_heartbeat(agent_id)
        logger.info(f"Agent registered: {agent_id}")

    def unregister(self, agent_id: str):
        self._handlers.pop(agent_id, None)
        logger.info(f"Agent unregistered: {agent_id}")

    def add_monitor(self, callback: Callable):
        self._monitor_callbacks.append(callback)

    async def send(self, msg: A2AMessage) -> A2AMessage:
        self._message_count += 1
        self._record(msg)

        if msg.msg_type == MsgType.DELEGATION.value:
            self._delegation_count += 1
        if msg.to_agent == "empathy":
            self._emotion_count += 1

        action_map = {
            MsgType.TASK_REQUEST.value: "teach",
            MsgType.DELEGATION.value: "teach",
            MsgType.BROADCAST.value: "system_config",
        }
        action = action_map.get(msg.msg_type, "teach")
        if not self._permissions.check_permission(msg.role, action):
            return A2AMessage(
                task_id=msg.task_id,
                from_agent="bus",
                to_agent=msg.from_agent,
                msg_type=MsgType.ERROR.value,
                content={"error": f"Permission denied: role '{msg.role}' cannot perform '{action}'"},
                parent_id=msg.task_id,
            )

        handler = self._handlers.get(msg.to_agent)
        if not handler:
            error_msg = A2AMessage(
                task_id=msg.task_id,
                from_agent="bus",
                to_agent=msg.from_agent,
                msg_type=MsgType.ERROR.value,
                content={"error": f"Agent '{msg.to_agent}' not found", "original_task": msg.task_id},
                parent_id=msg.task_id,
            )
            self._record(error_msg)
            return error_msg

        self._task_states[msg.task_id] = TaskState.WORKING
        self._health.update_heartbeat(msg.to_agent)

        try:
            result = await asyncio.wait_for(
                handler(msg),
                timeout=msg.timeout_seconds,
            )
            self._task_states[msg.task_id] = TaskState.COMPLETED
            self._health.update_heartbeat(msg.to_agent)
            return result
        except asyncio.TimeoutError:
            return await self._handle_failure(msg, "Timeout")
        except Exception as exc:
            return await self._handle_failure(msg, str(exc))

    async def _handle_failure(self, msg: A2AMessage, error: str) -> A2AMessage:
        self._health.mark_failed(msg.to_agent, error)
        logger.error(f"Agent {msg.to_agent} failed: {error}")

        if msg.retry_count < msg.max_retries:
            retry_msg = A2AMessage(
                task_id=msg.task_id,
                from_agent=msg.from_agent,
                to_agent=msg.to_agent,
                msg_type=msg.msg_type,
                content=msg.content,
                parent_id=msg.parent_id,
                priority=msg.priority,
                retry_count=msg.retry_count + 1,
                max_retries=msg.max_retries,
                timeout_seconds=msg.timeout_seconds * 1.5,
                role=msg.role,
            )
            self._task_states[msg.task_id] = TaskState.RETRYING
            logger.info(f"Retrying task {msg.task_id} (attempt {retry_msg.retry_count}/{msg.max_retries})")
            await asyncio.sleep(0.5 * retry_msg.retry_count)
            return await self.send(retry_msg)

        degraded_result = self._get_degraded_response(msg, error)
        self._task_states[msg.task_id] = TaskState.DEGRADED
        return degraded_result

    def _get_degraded_response(self, msg: A2AMessage, error: str) -> A2AMessage:
        fallbacks = {
            "tutor": "教学服务暂时不可用，请稍后再试。你可以先尝试独立思考这道题。",
            "lab_assistant": "暂时无法执行实验操作，请稍后再试。你可以先继续理论学习。",
            "quiz_teacher": "出题服务暂时不可用，请稍后再试练习。",
            "empathy": "我在这里陪着你，遇到困难很正常，一步一步来就好。",
            "parent_liaison": "报告生成服务暂时不可用，请稍后再试。",
        }
        fallback_msg = fallbacks.get(msg.to_agent, f"服务暂时不可用，请稍后再试。")
        return A2AMessage(
            task_id=msg.task_id,
            from_agent=msg.to_agent,
            to_agent=msg.from_agent,
            msg_type=MsgType.RESULT.value,
            content={
                "message": fallback_msg,
                "degraded": True,
                "original_error": error,
            },
            parent_id=msg.task_id,
        )

    async def broadcast(self, from_agent: str, content: dict, exclude: list[str] | None = None):
        exclude = exclude or []
        for aid in self._handlers:
            if aid != from_agent and aid not in exclude:
                msg = A2AMessage(
                    task_id=str(uuid.uuid4())[:8],
                    from_agent=from_agent,
                    to_agent=aid,
                    msg_type=MsgType.BROADCAST.value,
                    content=content,
                )
                self._record(msg)
                try:
                    await self._handlers[aid](msg)
                except Exception as exc:
                    logger.warning(f"Broadcast to {aid} failed: {exc}")

    def get_history(self, limit: int = 200) -> list[dict]:
        return self._history[-limit:]

    def get_metrics(self) -> dict:
        return {
            "total_messages": self._message_count,
            "total_delegations": self._delegation_count,
            "total_emotion_interventions": self._emotion_count,
            "agent_status": self._health.get_all_status(),
            "task_states": {tid: ts.value for tid, ts in self._task_states.items() if ts in (TaskState.WORKING, TaskState.RETRYING)},
        }

    def _record(self, msg: A2AMessage):
        entry = msg.to_dict()
        self._history.append(entry)
        if len(self._history) > self._max_history:
            self._history = self._history[-self._max_history:]
        for cb in self._monitor_callbacks:
            try:
                cb(entry)
            except Exception:
                pass
