"""Quiz Teacher Agent — BKT自适应出题与自动批改"""

from __future__ import annotations

import logging
import math
import random
import time

from a2a_bus.protocol import A2AMessage, MsgType

logger = logging.getLogger("edumind-team.agents.quiz")

QUESTION_BANK = [
    {"id": "q1", "concept": "导数", "difficulty": 0.3, "type": "choice",
     "question": "f(x)=x²在x=1处的导数值是？", "options": ["A.1", "B.2", "C.3", "D.4"], "answer": "B",
     "explanation": "f'(x)=2x, f'(1)=2"},
    {"id": "q2", "concept": "导数", "difficulty": 0.5, "type": "choice",
     "question": "f(x)=sin(x)的导数是？", "options": ["A.cos(x)", "B.-cos(x)", "C.sin(x)", "D.-sin(x)"], "answer": "A",
     "explanation": "d/dx[sin(x)] = cos(x)"},
    {"id": "q3", "concept": "导数", "difficulty": 0.7, "type": "choice",
     "question": "f(x)=e^(2x)的导数是？", "options": ["A.e^(2x)", "B.2e^(2x)", "C.2e^x", "D.e^x/2"], "answer": "B",
     "explanation": "链式法则: d/dx[e^(2x)] = 2e^(2x)"},
    {"id": "q4", "concept": "连续性", "difficulty": 0.3, "type": "choice",
     "question": "函数在某点连续的必要条件是？", "options": ["A.可导", "B.极限存在", "C.有定义", "D.B和C"], "answer": "D",
     "explanation": "连续需要: 有定义 + 极限存在 + 极限值=函数值"},
    {"id": "q5", "concept": "连续性", "difficulty": 0.5, "type": "choice",
     "question": "f(x)={x²,x≠2;1,x=2}在x=2处的间断点类型？", "options": ["A.跳跃间断点", "B.可去间断点", "C.无穷间断点", "D.连续"], "answer": "B",
     "explanation": "极限值(4)≠函数值(1)，但极限存在，为可去间断点"},
    {"id": "q6", "concept": "连续性", "difficulty": 0.7, "type": "choice",
     "question": "f(x)=|x|/x在x=0处的间断点类型？", "options": ["A.可去间断点", "B.跳跃间断点", "C.无穷间断点", "D.振荡间断点"], "answer": "B",
     "explanation": "左极限=-1, 右极限=1, 不相等，为跳跃间断点"},
    {"id": "q7", "concept": "积分", "difficulty": 0.3, "type": "choice",
     "question": "∫x dx = ?", "options": ["A.x²", "B.x²/2+C", "C.2x+C", "D.x+C"], "answer": "B",
     "explanation": "幂函数积分: ∫x^n dx = x^(n+1)/(n+1) + C"},
    {"id": "q8", "concept": "积分", "difficulty": 0.5, "type": "choice",
     "question": "∫sin(x)dx = ?", "options": ["A.cos(x)+C", "B.-cos(x)+C", "C.sin(x)+C", "D.-sin(x)+C"], "answer": "B",
     "explanation": "基本积分公式"},
    {"id": "q9", "concept": "积分", "difficulty": 0.8, "type": "choice",
     "question": "∫₀¹ x²dx = ?", "options": ["A.1/2", "B.1/3", "C.1/4", "D.1"], "answer": "B",
     "explanation": "∫₀¹ x²dx = [x³/3]₀¹ = 1/3"},
    {"id": "q10", "concept": "极限", "difficulty": 0.4, "type": "choice",
     "question": "lim(x→0) sin(x)/x = ?", "options": ["A.0", "B.1", "C.∞", "D.不存在"], "answer": "B",
     "explanation": "重要极限: lim(x→0) sin(x)/x = 1"},
    {"id": "q11", "concept": "极限", "difficulty": 0.6, "type": "choice",
     "question": "lim(x→∞) (1+1/x)^x = ?", "options": ["A.1", "B.e", "C.∞", "D.0"], "answer": "B",
     "explanation": "重要极限: lim(1+1/x)^x = e"},
    {"id": "q12", "concept": "导数", "difficulty": 0.9, "type": "choice",
     "question": "f(x)=ln(cos(x))的导数是？", "options": ["A.tan(x)", "B.-tan(x)", "C.cot(x)", "D.-cot(x)"], "answer": "B",
     "explanation": "链式法则: f'(x) = (1/cos(x))·(-sin(x)) = -tan(x)"},
]


class BKTModel:
    """Bayesian Knowledge Tracing — 贝叶斯知识追踪"""

    def __init__(self, p_init: float = 0.2, p_learn: float = 0.15,
                 p_guess: float = 0.2, p_slip: float = 0.1):
        self.p_init = p_init
        self.p_learn = p_learn
        self.p_guess = p_guess
        self.p_slip = p_slip
        self._knowledge: dict[str, float] = {}

    def get_mastery(self, concept: str) -> float:
        return self._knowledge.get(concept, self.p_init)

    def update(self, concept: str, correct: bool) -> float:
        p_know = self._knowledge.get(concept, self.p_init)

        if correct:
            p_know_given_correct = (p_know * (1 - self.p_slip)) / (
                p_know * (1 - self.p_slip) + (1 - p_know) * self.p_guess
            )
        else:
            p_know_given_wrong = (p_know * self.p_slip) / (
                p_know * self.p_slip + (1 - p_know) * (1 - self.p_guess)
            )
            p_know_given_correct = p_know_given_wrong

        p_know_new = p_know_given_correct + (1 - p_know_given_correct) * self.p_learn
        p_know_new = max(0.01, min(0.99, p_know_new))

        self._knowledge[concept] = p_know_new
        return p_know_new

    def select_difficulty(self, concept: str) -> float:
        mastery = self.get_mastery(concept)
        target_difficulty = mastery + 0.2
        return max(0.1, min(0.95, target_difficulty))

    def get_params(self) -> dict:
        return {
            "p_init": self.p_init,
            "p_learn": self.p_learn,
            "p_guess": self.p_guess,
            "p_slip": self.p_slip,
        }


class QuizAgent:
    def __init__(self, bus, llm=None):
        self.bus = bus
        self.llm = llm
        self.agent_id = "quiz_teacher"
        self._bkt = BKTModel()
        self._student_records: dict[str, list[dict]] = {}
        self._load_state()

    def _load_state(self):
        progress = self.bus.persistence.load_learning_progress("_bkt_state")
        if progress:
            self._bkt._knowledge = progress.get("knowledge", {})
        records = self.bus.persistence.load_learning_progress("_student_records")
        if records:
            self._student_records = records.get("records", {})

    def _save_state(self):
        self.bus.persistence.save_learning_progress("_bkt_state", {
            "knowledge": self._bkt._knowledge,
        })
        self.bus.persistence.save_learning_progress("_student_records", {
            "records": self._student_records,
        })

    async def handle(self, msg: A2AMessage) -> A2AMessage:
        if msg.msg_type in (MsgType.TASK_REQUEST.value, MsgType.DELEGATION.value):
            skill = msg.content.get("skill", "")
            if skill == "grade_answer":
                return await self._handle_answer(msg)
            return await self._handle_quiz(msg)
        elif msg.msg_type == MsgType.RESULT.value:
            return await self._handle_answer(msg)
        elif msg.msg_type == MsgType.BROADCAST.value:
            return self._make_response(msg, {"message": "broadcast received"})
        return self._make_response(msg, {"message": "ok"})

    async def _handle_quiz(self, msg: A2AMessage) -> A2AMessage:
        student_id = msg.content.get("student_id", "anonymous")
        concept = msg.content.get("concept", "导数")
        count = msg.content.get("count", 3)

        target_diff = self._bkt.select_difficulty(concept)
        selected = self._select_questions(concept, target_diff, count)

        if not selected:
            selected = random.sample(QUESTION_BANK, min(count, len(QUESTION_BANK)))

        quiz_text = self._format_quiz(selected)

        self.bus.persistence.save_interaction(student_id, {
            "type": "quiz_generated",
            "concept": concept,
            "target_difficulty": target_diff,
            "questions": [q["id"] for q in selected],
            "timestamp": time.time(),
        })

        return self._make_response(msg, {
            "message": quiz_text,
            "quiz_data": {
                "questions": selected,
                "concept": concept,
                "target_difficulty": target_diff,
                "student_mastery": self._bkt.get_mastery(concept),
            },
            "bkt_params": self._bkt.get_params(),
        })

    async def _handle_answer(self, msg: A2AMessage) -> A2AMessage:
        student_id = msg.content.get("student_id", "anonymous")
        question_id = msg.content.get("question_id", "") or msg.content.get("qid", "")
        answer = msg.content.get("answer", "")
        concept = msg.content.get("concept", "导数")

        question = next((q for q in QUESTION_BANK if q["id"] == question_id), None)
        if not question:
            return self._make_response(msg, {"message": "题目不存在", "correct": False})

        correct = answer.strip().upper() == question["answer"].strip().upper()

        new_mastery = self._bkt.update(concept, correct)

        self._student_records.setdefault(student_id, []).append({
            "question_id": question_id,
            "correct": correct,
            "mastery_after": new_mastery,
            "timestamp": time.time(),
        })

        self._save_state()

        result_text = (
            f"✅ 正确！{question['explanation']}" if correct
            else f"❌ 不正确。正确答案是{question['answer']}。{question['explanation']}"
        )
        result_text += f"\n当前掌握度: {new_mastery:.0%}"

        return self._make_response(msg, {
            "message": result_text,
            "correct": correct,
            "new_mastery": new_mastery,
            "explanation": question["explanation"],
        })

    def _select_questions(self, concept: str, target_diff: float, count: int) -> list[dict]:
        candidates = [q for q in QUESTION_BANK if q["concept"] == concept]
        if not candidates:
            candidates = QUESTION_BANK

        candidates.sort(key=lambda q: abs(q["difficulty"] - target_diff))
        return candidates[:count]

    def _format_quiz(self, questions: list[dict]) -> str:
        lines = ["📝 **自适应练习题**\n"]
        for i, q in enumerate(questions, 1):
            lines.append(f"**第{i}题** (难度: {'⭐' * int(q['difficulty'] * 5 + 0.5)})")
            lines.append(f"{q['question']}")
            for opt in q["options"]:
                lines.append(f"  {opt}")
            lines.append("")
        lines.append("请回复题号和答案，如：1-B")
        return "\n".join(lines)

    def grade_answer(self, question_id: str, answer: str) -> dict:
        question = next((q for q in QUESTION_BANK if q["id"] == question_id), None)
        if not question:
            return {"correct": False, "error": "题目不存在"}
        correct = answer.strip().upper() == question["answer"].strip().upper()
        return {
            "correct": correct,
            "correct_answer": question["answer"],
            "explanation": question["explanation"],
        }

    def _make_response(self, orig: A2AMessage, content: dict) -> A2AMessage:
        return A2AMessage(
            task_id=orig.task_id,
            from_agent=self.agent_id,
            to_agent=orig.from_agent,
            msg_type=MsgType.RESULT.value,
            content=content,
            parent_id=orig.task_id,
        )
