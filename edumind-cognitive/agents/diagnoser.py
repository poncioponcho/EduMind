import os
import sys
import json
import logging
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("edumind-cognitive.diagnoser")

_COGNITIVE_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
if _COGNITIVE_ROOT not in sys.path:
    sys.path.insert(0, _COGNITIVE_ROOT)

from kg.neo4j_client import kg

DIAG_PROMPT = """你是EduMind认知诊断专家。分析学生回答时：
1. 区分：概念理解错误 / 计算粗心 / 前置知识缺失
2. 匹配已知Misconception模式
3. 追溯根本原因
4. 评估掌握度（0.0-1.0）

当前知识点：{topic}
常见错误模式：{misconceptions}
前置依赖：{prerequisites}
学生当前掌握度：{mastery}

输出JSON格式：
{{
  "error_type": "conceptual|calculation|prerequisite",
  "misconception": "匹配的错误模式名称或null",
  "root_cause": "根本原因",
  "mastery_level": 0.0-1.0,
  "confidence": 0.0-1.0,
  "suggestion": "一句话建议"
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
        "error_type": "unknown",
        "misconception": None,
        "root_cause": "无法解析诊断结果",
        "mastery_level": 0.3,
        "confidence": 0.3,
        "suggestion": "建议重新评估",
    }


async def diagnoser_node(state: dict, llm) -> dict:
    topic = state.get("current_topic", "")
    student_id = state.get("student_id", "anonymous")
    last_answer = state.get("last_answer", "")

    misconceptions = kg.get_misconceptions(topic)
    prerequisites = kg.get_prerequisites(topic)
    mastery = kg.get_student_mastery(student_id, topic)

    mis_str = json.dumps(misconceptions, ensure_ascii=False) if misconceptions else "无"
    pre_str = ", ".join(prerequisites) if prerequisites else "无"
    mastery_str = f"{mastery:.1f}"

    prompt = DIAG_PROMPT.format(
        topic=topic,
        misconceptions=mis_str,
        prerequisites=pre_str,
        mastery=mastery_str,
    )

    messages = state.get("messages", [])
    context_msgs = []
    for msg in messages[-6:]:
        if isinstance(msg, (HumanMessage, AIMessage)):
            context_msgs.append(msg)

    full_messages = [SystemMessage(content=prompt)] + context_msgs
    if last_answer:
        full_messages.append(HumanMessage(content=f"学生回答：{last_answer}"))

    try:
        response = await llm.ainvoke(full_messages)
        diagnosis = _extract_json(response.content)
    except Exception as e:
        logger.error(f"诊断Agent调用失败: {e}")
        diagnosis = {
            "error_type": "unknown",
            "misconception": None,
            "root_cause": f"诊断失败: {type(e).__name__}",
            "mastery_level": mastery,
            "confidence": 0.2,
            "suggestion": "请重新尝试",
        }

    new_level = diagnosis.get("mastery_level", mastery)
    kg.update_mastery(student_id, topic, new_level)

    diagnosis["topic"] = topic
    diagnosis["previous_mastery"] = mastery

    return {"diagnosis": diagnosis}
