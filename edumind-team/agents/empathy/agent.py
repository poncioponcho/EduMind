"""Empathy Agent — 情感陪伴，多维度情绪监测与自动介入"""

from __future__ import annotations

import logging
import random
import time

from a2a_bus.protocol import A2AMessage, MsgType

logger = logging.getLogger("edumind-team.agents.empathy")

FRUSTRATION_THRESHOLD = 0.6

EMOTION_KEYWORDS = {
    "frustration": {
        "high": ["放弃", "崩溃", "绝望", "想哭", "hate", "give up", "impossible"],
        "medium": ["太难", "不会", "不懂", "搞不定", "头大", "stuck", "confused"],
        "low": ["有点难", "不太明白", "卡住了", "不确定"],
    },
    "confusion": {
        "high": ["完全不理解", "一点都", "毫无头绪", "totally lost"],
        "medium": ["不太懂", "有点困惑", "什么意思", "不明白"],
        "low": ["不太确定", "好像懂了", "大概"],
    },
    "engagement": {
        "positive": ["有趣", "想学", "继续", "还有吗", "interesting", "cool"],
        "neutral": ["嗯", "好的", "ok", "明白"],
        "negative": ["无聊", "烦", "boring", "tired"],
    },
    "confidence": {
        "high": ["我懂了", "明白了", "会了", "简单", "easy"],
        "medium": ["大概懂", "差不多", "基本理解"],
        "low": ["不确定", "可能不对", "猜的", "不太会"],
    },
}

ENCOURAGEMENT_TEMPLATES = {
    "high_frustration": [
        "我完全理解你的感受，这个概念确实有挑战性。但请记住，每个数学高手都曾在这里挣扎过。让我们换个角度，从最基础的部分重新开始？",
        "遇到困难是学习的一部分，你愿意坚持就已经很棒了！我们放慢节奏，一步一步来，好吗？",
        "别对自己太苛刻！这个知识点确实需要时间消化。我们先休息一下，或者换个更简单的例子来建立信心？",
    ],
    "medium_frustration": [
        "我看出你有些困难，这很正常。让我们把问题拆小一点，先从你理解的部分开始？",
        "学习新概念时卡住是常有的事。你已经走在正确的路上了，只是还需要多一点练习。试试这个更简单的版本？",
        "别着急，我们慢慢来。你能告诉我具体哪个部分让你困惑吗？我们一起解决它。",
    ],
    "low_frustration": [
        "有点挑战对吧？但你已经在思考了，这本身就是进步！让我给你一个小提示...",
        "这个概念确实需要多想几遍。让我用一个生活中的例子帮你理解？",
        "你比想象中做得更好！让我们再试一次，这次我会给你更多引导。",
    ],
}


class EmotionAnalyzer:
    def analyze(self, text: str) -> dict:
        text_lower = text.lower()
        scores = {
            "frustration": 0.0,
            "confusion": 0.0,
            "engagement": 0.5,
            "confidence": 0.5,
        }

        for emotion, levels in EMOTION_KEYWORDS.items():
            for level, keywords in levels.items():
                for kw in keywords:
                    if kw in text_lower:
                        if emotion == "frustration":
                            if level == "high":
                                scores["frustration"] = max(scores["frustration"], 0.9)
                            elif level == "medium":
                                scores["frustration"] = max(scores["frustration"], 0.6)
                            else:
                                scores["frustration"] = max(scores["frustration"], 0.3)
                        elif emotion == "confusion":
                            if level == "high":
                                scores["confusion"] = max(scores["confusion"], 0.8)
                            elif level == "medium":
                                scores["confusion"] = max(scores["confusion"], 0.5)
                            else:
                                scores["confusion"] = max(scores["confusion"], 0.3)
                        elif emotion == "engagement":
                            if level == "positive":
                                scores["engagement"] = max(scores["engagement"], 0.8)
                            elif level == "negative":
                                scores["engagement"] = min(scores["engagement"], 0.2)
                        elif emotion == "confidence":
                            if level == "high":
                                scores["confidence"] = max(scores["confidence"], 0.9)
                            elif level == "medium":
                                scores["confidence"] = max(scores["confidence"], 0.6)
                            else:
                                scores["confidence"] = min(scores["confidence"], 0.3)

        scores["should_intervene"] = scores["frustration"] >= FRUSTRATION_THRESHOLD
        scores["intervention_urgency"] = (
            "high" if scores["frustration"] >= 0.8
            else "medium" if scores["frustration"] >= 0.6
            else "low"
        )

        return scores


class EmpathyAgent:
    def __init__(self, bus, llm=None):
        self.bus = bus
        self.llm = llm
        self.agent_id = "empathy"
        self._analyzer = EmotionAnalyzer()
        self._student_emotions: dict[str, list[dict]] = {}
        self._load_state()

    def _load_state(self):
        data = self.bus.persistence.load_learning_progress("_empathy_emotions")
        if data:
            self._student_emotions = data.get("student_emotions", {})

    def _save_state(self):
        trimmed = {}
        for sid, history in self._student_emotions.items():
            trimmed[sid] = history[-100:]
        self.bus.persistence.save_learning_progress("_empathy_emotions", {
            "student_emotions": trimmed,
        })

    async def handle(self, msg: A2AMessage) -> A2AMessage:
        if msg.msg_type in (MsgType.TASK_REQUEST.value, MsgType.DELEGATION.value):
            return await self._handle_emotion(msg)
        elif msg.msg_type == MsgType.BROADCAST.value:
            return self._make_response(msg, {"message": "broadcast received"})
        return self._make_response(msg, {"message": "ok"})

    async def _handle_emotion(self, msg: A2AMessage) -> A2AMessage:
        user_input = msg.content.get("message", "")
        student_id = msg.content.get("student_id", "anonymous")

        emotions = self._analyzer.analyze(user_input)

        self._student_emotions.setdefault(student_id, []).append({
            "timestamp": time.time(),
            "emotions": emotions,
            "input_preview": user_input[:50],
        })
        if len(self._student_emotions.get(student_id, [])) > 100:
            self._student_emotions[student_id] = self._student_emotions[student_id][-100:]

        encouragement = self._generate_encouragement(emotions, user_input)

        if self.llm and emotions.get("should_intervene"):
            try:
                from langchain_core.messages import SystemMessage, HumanMessage
                response = await self.llm.ainvoke([
                    SystemMessage(content="你是EduMind情感陪伴Agent。学生情绪低落，请给予温暖鼓励。2-3句话，真诚不空洞。"),
                    HumanMessage(content=f"学生说：{user_input}\n情绪分析：{emotions}\n请给予鼓励："),
                ])
                encouragement = response.content
            except Exception:
                pass

        avatar_emotion = "caring" if emotions["frustration"] >= 0.6 else "encouraging"

        self._save_state()

        if emotions.get("should_intervene") and self.bus:
            try:
                parent_agent = self.bus._handlers.get("parent_liaison")
                if parent_agent:
                    parent = self.bus._handlers.get("parent_liaison")
                    import inspect
                    if hasattr(parent, 'log_activity'):
                        parent.log_activity(student_id, "emotion_alert", {
                            "frustration": emotions["frustration"],
                            "urgency": emotions.get("intervention_urgency", "medium"),
                        })
            except Exception:
                pass

        return self._make_response(msg, {
            "message": encouragement,
            "emotion_analysis": emotions,
            "avatar_emotion": avatar_emotion,
            "intervention_triggered": emotions.get("should_intervene", False),
            "raw_emotion_data": emotions,
        })

    def _generate_encouragement(self, emotions: dict, user_input: str) -> str:
        frustration = emotions.get("frustration", 0)
        if frustration >= 0.8:
            return random.choice(ENCOURAGEMENT_TEMPLATES["high_frustration"])
        elif frustration >= 0.6:
            return random.choice(ENCOURAGEMENT_TEMPLATES["medium_frustration"])
        elif frustration >= 0.3:
            return random.choice(ENCOURAGEMENT_TEMPLATES["low_frustration"])
        else:
            return "你做得很好！继续保持这个学习节奏，有任何问题随时告诉我。"

    def get_emotion_history(self, student_id: str) -> list[dict]:
        return self._student_emotions.get(student_id, [])

    def _make_response(self, orig: A2AMessage, content: dict) -> A2AMessage:
        return A2AMessage(
            task_id=orig.task_id,
            from_agent=self.agent_id,
            to_agent=orig.from_agent,
            msg_type=MsgType.RESULT.value,
            content=content,
            parent_id=orig.task_id,
        )
