"""Tutor Agent — 主讲教师，意图识别与任务委派中枢"""

from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Optional

from a2a_bus.protocol import A2AMessage, MsgType

logger = logging.getLogger("edumind-team.agents.tutor")

INTENT_PATTERNS = {
    "needs_demo": [
        r"(画|绘制|plot|graph|图像|图形|可视化|演示|demo|show me)",
        r"(运行|执行|跑一下|run|execute).*代码",
        r"(计算|算一下|calculate|solve|求解)",
    ],
    "request_quiz": [
        r"(练习|测验|出题|quiz|test|exam|考试|做题)",
        r"(检验|测试|check|assess).*掌握",
    ],
    "frustrated": [
        r"(太难|不会|不懂|放弃|崩溃|绝望|头大|搞不定|想哭)",
        r"(完全不理解|一点都|毫无头绪|confused|lost|stuck)",
        r"(烦|累|讨厌|厌恶|hate|boring)",
    ],
    "direct": [
        r"(什么是|什么是|解释|explain|定义|definition|概念)",
        r"(为什么|why|原因|reason|原理)",
        r"(怎么|如何|how|方法|步骤)",
    ],
}


class TutorAgent:
    def __init__(self, bus, llm=None):
        self.bus = bus
        self.llm = llm
        self.agent_id = "tutor"
        self.student_context = {"student_id": "anonymous"}

    async def handle(self, msg: A2AMessage) -> A2AMessage:
        if msg.msg_type == MsgType.TASK_REQUEST.value:
            return await self._handle_teach(msg)
        elif msg.msg_type == MsgType.RESULT.value:
            return await self._forward_result(msg)
        elif msg.msg_type == MsgType.BROADCAST.value:
            return await self._handle_broadcast(msg)
        return self._make_response(msg, {"message": "未知消息类型"})

    async def teach(self, user_input: str, student_id: str = "anonymous", role: str = "student") -> str:
        intent = self._classify_intent(user_input)
        task_id = str(uuid.uuid4())[:8]

        msg = A2AMessage(
            task_id=task_id,
            from_agent="student",
            to_agent="tutor",
            msg_type=MsgType.TASK_REQUEST.value,
            content={"message": user_input, "student_id": student_id, "intent": intent},
            role=role,
        )
        result = await self.handle(msg)
        return result.content.get("message", "")

    def _classify_intent(self, text: str) -> str:
        text_lower = text.lower()
        scores = {}
        for intent, patterns in INTENT_PATTERNS.items():
            score = 0
            for pattern in patterns:
                if re.search(pattern, text_lower):
                    score += 1
            scores[intent] = score

        max_score = max(scores.values()) if scores else 0
        if max_score == 0:
            return "direct"

        top_intents = [k for k, v in scores.items() if v == max_score]
        priority = ["frustrated", "needs_demo", "request_quiz", "direct"]
        for p in priority:
            if p in top_intents:
                return p
        return top_intents[0]

    async def _handle_teach(self, msg: A2AMessage) -> A2AMessage:
        user_input = msg.content.get("message", "")
        student_id = msg.content.get("student_id", "anonymous")
        intent = msg.content.get("intent") or self._classify_intent(user_input)

        self.bus.persistence.save_interaction(student_id, {
            "type": "user_input",
            "message": user_input,
            "intent": intent,
            "timestamp": msg.timestamp,
        })

        if intent == "frustrated":
            delegate_msg = A2AMessage(
                task_id=msg.task_id,
                from_agent=self.agent_id,
                to_agent="empathy",
                msg_type=MsgType.DELEGATION.value,
                content={"message": user_input, "student_id": student_id, "intent": "frustrated"},
                parent_id=msg.task_id,
                role=msg.role,
            )
            empathy_result = await self.bus.send(delegate_msg)
            empathy_text = empathy_result.content.get("message", "")

            teach_msg = self._make_response(msg, {
                "message": empathy_text,
                "intent": intent,
                "delegated_to": "empathy",
                "avatar_emotion": "caring",
            })
            self.bus.persistence.save_interaction(student_id, {
                "type": "agent_response",
                "message": empathy_text,
                "delegated_to": "empathy",
                "timestamp": msg.timestamp,
            })
            return teach_msg

        elif intent == "needs_demo":
            delegate_msg = A2AMessage(
                task_id=msg.task_id,
                from_agent=self.agent_id,
                to_agent="lab_assistant",
                msg_type=MsgType.DELEGATION.value,
                content={"message": user_input, "student_id": student_id, "intent": "needs_demo"},
                parent_id=msg.task_id,
                role=msg.role,
            )
            lab_result = await self.bus.send(delegate_msg)
            lab_text = lab_result.content.get("message", "")

            if self.llm:
                try:
                    from langchain_core.messages import SystemMessage, HumanMessage
                    response = await self.llm.ainvoke([
                        SystemMessage(content="你是数学教师，基于实验结果给学生讲解。简洁3句话。"),
                        HumanMessage(content=f"学生问：{user_input}\n实验结果：{lab_text}\n请结合结果讲解："),
                    ])
                    final_text = response.content
                except Exception:
                    final_text = lab_text
            else:
                final_text = lab_text

            return self._make_response(msg, {
                "message": final_text,
                "intent": intent,
                "delegated_to": "lab_assistant",
                "avatar_emotion": "explaining",
            })

        elif intent == "request_quiz":
            delegate_msg = A2AMessage(
                task_id=msg.task_id,
                from_agent=self.agent_id,
                to_agent="quiz_teacher",
                msg_type=MsgType.DELEGATION.value,
                content={"message": user_input, "student_id": student_id, "intent": "request_quiz"},
                parent_id=msg.task_id,
                role=msg.role,
            )
            quiz_result = await self.bus.send(delegate_msg)
            return self._make_response(msg, {
                "message": quiz_result.content.get("message", ""),
                "intent": intent,
                "delegated_to": "quiz_teacher",
                "quiz_data": quiz_result.content.get("quiz_data"),
                "avatar_emotion": "encouraging",
            })

        else:
            if self.llm:
                try:
                    from langchain_core.messages import SystemMessage, HumanMessage
                    response = await self.llm.ainvoke([
                        SystemMessage(content="你是EduMind数学导师，用苏格拉底式教学法引导学生。简洁3句话，适当提问。"),
                        HumanMessage(content=user_input),
                    ])
                    reply = response.content
                except Exception:
                    reply = self._fallback_explain(user_input)
            else:
                reply = self._fallback_explain(user_input)

            self.bus.persistence.save_interaction(student_id, {
                "type": "agent_response",
                "message": reply,
                "intent": intent,
                "timestamp": msg.timestamp,
            })

            return self._make_response(msg, {
                "message": reply,
                "intent": intent,
                "avatar_emotion": "explaining",
            })

    async def _forward_result(self, msg: A2AMessage) -> A2AMessage:
        return msg

    async def _handle_broadcast(self, msg: A2AMessage) -> A2AMessage:
        return self._make_response(msg, {"message": "broadcast received"})

    def _fallback_explain(self, question: str) -> str:
        return f"这是一个很好的问题！关于「{question[:20]}」，让我们一步步来思考。你能先告诉我你目前对这个概念的理解吗？"

    def _make_response(self, orig: A2AMessage, content: dict) -> A2AMessage:
        return A2AMessage(
            task_id=orig.task_id,
            from_agent=self.agent_id,
            to_agent=orig.from_agent,
            msg_type=MsgType.RESULT.value,
            content=content,
            parent_id=orig.task_id,
        )
