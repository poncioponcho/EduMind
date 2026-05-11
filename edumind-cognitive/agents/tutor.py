import os
import sys
import json
import logging
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("edumind-cognitive.tutor")

_COGNITIVE_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
if _COGNITIVE_ROOT not in sys.path:
    sys.path.insert(0, _COGNITIVE_ROOT)

from kg.neo4j_client import kg

TUTOR_PROMPT = """你是EduMind教学Agent。当前教学阶段：{strategy}，针对错误模式：{misconception}

教学原则：
- 讲解阶段：用类比和生活案例，不超过3句话
- 演示阶段：每步说明"为什么这样做"
- 练习阶段：出题后等待学生回答
- 总结阶段：一句话核心要点
- 复习阶段：快速回顾关键概念

当前知识点：{topic}
学生掌握度：{mastery}
诊断信息：{diagnosis_info}

输出JSON格式：
{{
  "message": "教学回复内容",
  "emotion": "happy|explaining|encouraging|thinking|praising",
  "has_question": true/false,
  "step_type": "concept|example|practice|summary|review",
  "is_complete": true/false
}}"""


def _extract_json(text: str) -> dict:
    try:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(text[start:end])
    except json.JSONDecodeError:
        pass
    return {
        "message": text if text else "让我换个角度来讲解这个概念。",
        "emotion": "explaining",
        "has_question": False,
        "step_type": "concept",
        "is_complete": False,
    }


async def tutor_node(state: dict, llm) -> dict:
    topic = state.get("current_topic", "")
    student_id = state.get("student_id", "anonymous")
    diagnosis = state.get("diagnosis", {})
    plan = state.get("learning_plan", {})
    mastery = kg.get_student_mastery(student_id, topic)

    current_step = None
    if plan and "steps" in plan:
        idx = plan.get("current_step_index", 0)
        steps = plan["steps"]
        if idx < len(steps):
            current_step = steps[idx]

    strategy = current_step.get("type", "concept") if current_step else "concept"
    misconception = diagnosis.get("misconception", "无")
    diag_info = json.dumps(diagnosis, ensure_ascii=False) if diagnosis else "无"

    prompt = TUTOR_PROMPT.format(
        strategy=strategy,
        misconception=misconception,
        topic=topic,
        mastery=f"{mastery:.1f}",
        diagnosis_info=diag_info,
    )

    messages = [SystemMessage(content=prompt)]
    for msg in state.get("messages", [])[-4:]:
        if isinstance(msg, (HumanMessage, AIMessage)):
            messages.append(msg)

    try:
        response = await llm.ainvoke(messages)
        result = _extract_json(response.content)
    except Exception as e:
        logger.error(f"教学Agent调用失败: {e}")
        result = {
            "message": "让我重新组织一下思路，再为你讲解。",
            "emotion": "thinking",
            "has_question": False,
            "step_type": strategy,
            "is_complete": False,
        }

    new_step_index = plan.get("current_step_index", 0)
    if result.get("is_complete") and plan.get("steps"):
        new_step_index += 1
        if new_step_index >= len(plan["steps"]):
            plan["completed"] = True

    if plan:
        plan["current_step_index"] = new_step_index

    return {
        "messages": [AIMessage(content=result.get("message", ""))],
        "avatar_emotion": result.get("emotion", "explaining"),
        "learning_plan": plan,
        "plan_completed": plan.get("completed", False) if plan else False,
    }
