import os
import sys
import json
import logging
from langchain_core.messages import SystemMessage, HumanMessage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("edumind-cognitive.planner")

_COGNITIVE_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
if _COGNITIVE_ROOT not in sys.path:
    sys.path.insert(0, _COGNITIVE_ROOT)

from kg.neo4j_client import kg

PLAN_PROMPT = """你是EduMind学习规划专家。基于诊断结果制定个性化学习计划。

遵循原则：
1. 最近发展区：题目难度在当前水平+0.2内
2. 前置依赖优先：先补缺失的前置知识，再学当前概念
3. 间隔重复：久未复习的概念薄弱时加入复习环节
4. 多样化策略：概念讲解→例题演示→练习题→总结，四步循环
5. 总时长控制在20分钟内

当前知识点：{topic}
诊断结果：{diagnosis}
前置缺失：{missing_prerequisites}
当前掌握度：{mastery}

输出JSON格式：
{{
  "steps": [
    {{
      "order": 1,
      "type": "concept|example|practice|summary|review",
      "concept": "知识点名称",
      "duration_minutes": 3,
      "description": "步骤描述"
    }}
  ],
  "total_minutes": 15,
  "strategy": "remedial|reinforcement|advanced",
  "focus": "核心关注点"
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
        "steps": [
            {"order": 1, "type": "concept", "concept": "基础概念", "duration_minutes": 5, "description": "回顾基础概念"},
            {"order": 2, "type": "practice", "concept": "基础概念", "duration_minutes": 10, "description": "练习巩固"},
        ],
        "total_minutes": 15,
        "strategy": "remedial",
        "focus": "基础巩固",
    }


async def planner_node(state: dict, llm) -> dict:
    topic = state.get("current_topic", "")
    student_id = state.get("student_id", "anonymous")
    diagnosis = state.get("diagnosis", {})

    missing = kg.get_prerequisite_path(topic, student_id)
    mastery = kg.get_student_mastery(student_id, topic)

    diag_str = json.dumps(diagnosis, ensure_ascii=False)
    missing_str = ", ".join(missing) if missing else "无"
    mastery_str = f"{mastery:.1f}"

    prompt = PLAN_PROMPT.format(
        topic=topic,
        diagnosis=diag_str,
        missing_prerequisites=missing_str,
        mastery=mastery_str,
    )

    messages = [SystemMessage(content=prompt)]
    if diagnosis:
        messages.append(HumanMessage(content=f"请基于以上诊断结果制定学习计划"))

    try:
        response = await llm.ainvoke(messages)
        plan = _extract_json(response.content)
    except Exception as e:
        logger.error(f"规划Agent调用失败: {e}")
        plan = {
            "steps": [
                {"order": 1, "type": "concept", "concept": topic, "duration_minutes": 5, "description": f"讲解{topic}基础概念"},
                {"order": 2, "type": "practice", "concept": topic, "duration_minutes": 10, "description": "练习巩固"},
            ],
            "total_minutes": 15,
            "strategy": "remedial",
            "focus": topic,
        }

    plan["current_step_index"] = 0
    plan["missing_prerequisites"] = missing

    return {"learning_plan": plan}
