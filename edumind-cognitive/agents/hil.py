import json
import logging

logger = logging.getLogger("edumind-cognitive.hil")


async def human_approval_node(state: dict, llm=None) -> dict:
    plan = state.get("learning_plan", {})
    diagnosis = state.get("diagnosis", {})

    plan_summary = json.dumps(plan, ensure_ascii=False, indent=2) if plan else "无计划"
    diag_summary = json.dumps(diagnosis, ensure_ascii=False, indent=2) if diagnosis else "无诊断"

    prompt = (
        f"📋 审核学习计划\n\n"
        f"诊断结果：\n{diag_summary}\n\n"
        f"学习计划：\n{plan_summary}\n\n"
        f"请输入：\n"
        f"- confirm：确认执行\n"
        f"- modify:调整内容：修改计划"
    )

    return {
        "human_prompt": prompt,
        "awaiting_human": True,
    }


def approval_decision(state: dict) -> str:
    human_input = state.get("human_input", "").strip().lower()
    if human_input.startswith("confirm"):
        return "approved"
    if human_input.startswith("modify"):
        return "rejected"
    return "pending"
