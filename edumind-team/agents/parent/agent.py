"""家长联络 Agent —— 定时生成日报/周报。"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta

from a2a_bus.protocol import A2AMessage, MsgType, _gen_id

logger = logging.getLogger("edumind-team.parent")


class ParentAgent:
    """Parent liaison: generates daily/weekly reports for parents."""

    AGENT_ID = "parent_liaison"

    def __init__(self, bus=None, llm=None):
        self.a2a = bus
        self.llm = llm
        self._reports: list[dict] = []
        self._student_logs: dict[str, list[dict]] = {}
        self._load_state()

    def _load_state(self):
        if not self.a2a:
            return
        data = self.a2a.persistence.load_learning_progress("_parent_logs")
        if data:
            self._student_logs = data.get("student_logs", {})
        reports = self.a2a.persistence.load_learning_progress("_parent_reports")
        if reports:
            self._reports = reports.get("reports", [])

    def _save_state(self):
        if not self.a2a:
            return
        self.a2a.persistence.save_learning_progress("_parent_logs", {
            "student_logs": self._student_logs,
        })
        self.a2a.persistence.save_learning_progress("_parent_reports", {
            "reports": self._reports[-50:],
        })

    async def handle(self, msg: A2AMessage) -> A2AMessage:
        skill = msg.content.get("skill")
        if skill == "generate_daily_report":
            return await self._generate_daily_report(msg)
        if skill == "generate_weekly_report":
            return await self._generate_weekly_report(msg)
        if skill == "send_report":
            return await self._send_report(msg)
        return A2AMessage(
            task_id=_gen_id(),
            from_agent=self.AGENT_ID,
            to_agent=msg.from_agent,
            msg_type=MsgType.ERROR.value,
            content={"error": f"Unknown skill: {skill}"},
            parent_id=msg.task_id,
        )

    def log_activity(self, student_id: str, activity: str, detail: dict = None) -> None:
        self._student_logs.setdefault(student_id, []).append({
            "time": time.time(),
            "activity": activity,
            "detail": detail or {},
        })
        self._save_state()

    async def _generate_daily_report(self, msg: A2AMessage) -> A2AMessage:
        student_id = msg.content.get("student_id", "anonymous")
        date_str = msg.content.get("date", datetime.now().strftime("%Y-%m-%d"))
        logs = self._student_logs.get(student_id, [])
        day_logs = [l for l in logs if datetime.fromtimestamp(l["time"]).strftime("%Y-%m-%d") == date_str]

        concepts = set()
        quiz_count = 0
        correct_count = 0
        frustration_events = 0
        study_minutes = 0
        for l in day_logs:
            d = l.get("detail", {})
            if "concept" in d:
                concepts.add(d["concept"])
            if l["activity"] == "quiz_attempt":
                quiz_count += 1
                if d.get("correct"):
                    correct_count += 1
            if l["activity"] == "emotion_alert":
                frustration_events += 1
            if l["activity"] == "study_session":
                study_minutes += d.get("duration_minutes", 0)

        accuracy = (correct_count / max(quiz_count, 1)) * 100

        if self.llm and (quiz_count > 0 or frustration_events > 0):
            try:
                from langchain_core.messages import SystemMessage, HumanMessage
                response = await self.llm.ainvoke([
                    SystemMessage(content="你是家长联络Agent，根据学习数据生成个性化建议。简洁温暖，1-2句话。"),
                    HumanMessage(content=f"学生{student_id}日报数据：做题{quiz_count}道，正确率{accuracy:.0f}%，情绪波动{frustration_events}次，学习{study_minutes}分钟。请给出个性化建议："),
                ])
                suggestion = response.content
            except Exception:
                suggestion = "多关注情绪状态" if frustration_events > 1 else "保持当前学习节奏"
        else:
            suggestion = "多关注情绪状态" if frustration_events > 1 else "保持当前学习节奏"

        report = f"""📋 {student_id} 学习日报 ({date_str})
━━━━━━━━━━━━━━━━━━━━
📚 学习知识点：{', '.join(concepts) if concepts else '暂无记录'}
📝 做题数量：{quiz_count} 道
✅ 正确率：{accuracy:.0f}%
⏱️ 学习时长：{study_minutes} 分钟
😟 情绪波动：{frustration_events} 次
💡 建议：{suggestion}
━━━━━━━━━━━━━━━━━━━━
"""
        self._reports.append({"student_id": student_id, "type": "daily", "date": date_str, "content": report})
        self._save_state()
        return A2AMessage(
            task_id=_gen_id(),
            from_agent=self.AGENT_ID,
            to_agent=msg.from_agent,
            msg_type=MsgType.RESULT.value,
            content={"report": report, "type": "daily", "date": date_str},
            parent_id=msg.task_id,
        )

    async def _generate_weekly_report(self, msg: A2AMessage) -> A2AMessage:
        student_id = msg.content.get("student_id", "anonymous")
        week_start_str = msg.content.get("week_start", (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d"))
        week_start = datetime.strptime(week_start_str, "%Y-%m-%d")
        week_end = week_start + timedelta(days=6)

        logs = self._student_logs.get(student_id, [])
        week_logs = [
            l for l in logs
            if week_start <= datetime.fromtimestamp(l["time"]) <= week_end
        ]

        daily_quiz = [0] * 7
        daily_correct = [0] * 7
        concepts = set()
        total_study_minutes = 0
        for l in week_logs:
            d = l.get("detail", {})
            day_idx = (datetime.fromtimestamp(l["time"]) - week_start).days
            if 0 <= day_idx < 7:
                if l["activity"] == "quiz_attempt":
                    daily_quiz[day_idx] += 1
                    if d.get("correct"):
                        daily_correct[day_idx] += 1
                if l["activity"] == "study_session":
                    total_study_minutes += d.get("duration_minutes", 0)
            if "concept" in d:
                concepts.add(d["concept"])

        total_quiz = sum(daily_quiz)
        total_correct = sum(daily_correct)
        accuracy = (total_correct / max(total_quiz, 1)) * 100
        active_days = sum(1 for q in daily_quiz if q > 0)

        if self.llm and total_quiz > 0:
            try:
                from langchain_core.messages import SystemMessage, HumanMessage
                response = await self.llm.ainvoke([
                    SystemMessage(content="你是家长联络Agent，根据周报数据给出综合建议。2-3句话，关注趋势。"),
                    HumanMessage(content=f"学生{student_id}周报：做题{total_quiz}道，正确率{accuracy:.0f}%，活跃{active_days}天，学习{total_study_minutes}分钟。请给出综合建议："),
                ])
                suggestion = response.content
            except Exception:
                suggestion = "学习节奏良好，建议适当增加难度" if accuracy > 80 else "建议巩固基础知识点，多多练习"
        else:
            suggestion = "学习节奏良好，建议适当增加难度" if accuracy > 80 else "建议巩固基础知识点，多多练习"

        report = f"""📊 {student_id} 学习周报 ({week_start_str} ~ {week_end.strftime('%Y-%m-%d')})
━━━━━━━━━━━━━━━━━━━━
📚 本周知识点：{', '.join(concepts) if concepts else '暂无记录'}
📝 总做题数：{total_quiz} 道
✅ 平均正确率：{accuracy:.0f}%
📅 活跃天数：{active_days}/7
⏱️ 学习时长：{total_study_minutes} 分钟
📈 每日做题：{daily_quiz}
💡 综合建议：{suggestion}
━━━━━━━━━━━━━━━━━━━━
"""
        self._reports.append({"student_id": student_id, "type": "weekly", "week_start": week_start_str, "content": report})
        self._save_state()
        return A2AMessage(
            task_id=_gen_id(),
            from_agent=self.AGENT_ID,
            to_agent=msg.from_agent,
            msg_type=MsgType.RESULT.value,
            content={"report": report, "type": "weekly", "week_start": week_start_str},
            parent_id=msg.task_id,
        )

    async def _send_report(self, msg: A2AMessage) -> A2AMessage:
        report = msg.content.get("report", "")
        contact = msg.content.get("contact", "")
        logger.info(f"ParentAgent: report sent to {contact} ({len(report)} chars)")
        return A2AMessage(
            task_id=_gen_id(),
            from_agent=self.AGENT_ID,
            to_agent=msg.from_agent,
            msg_type=MsgType.RESULT.value,
            content={"sent": True, "contact": contact, "length": len(report)},
            parent_id=msg.task_id,
        )
