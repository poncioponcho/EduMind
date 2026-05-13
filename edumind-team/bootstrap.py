"""Bootstrap script for EduMind A2A Team."""

import asyncio
import logging
import os
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("edumind-team.bootstrap")

# Ensure project roots are on path
_PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

_MCP_ROOT = os.path.join(_PROJECT_ROOT, "edumind-mcp")
if _MCP_ROOT not in sys.path:
    sys.path.insert(0, _MCP_ROOT)

from a2a_bus.protocol import A2ABus
from a2a_bus.registry import AgentRegistry
from agents import TutorAgent, LabAgent, QuizAgent, EmpathyAgent, ParentAgent


async def bootstrap() -> tuple[A2ABus, AgentRegistry, dict]:
    """Initialize A2A bus, register all agents, and return handles."""
    bus = A2ABus()
    registry = AgentRegistry()

    # Try to load LLM (optional)
    llm = None
    try:
        from agent.llm_provider import get_llm
        llm = get_llm()
        logger.info("LLM loaded successfully")
    except Exception as exc:
        logger.warning(f"LLM not available: {exc}")

    agent_map = {
        "tutor": TutorAgent(bus, llm),
        "lab_assistant": LabAgent(bus, llm),
        "quiz_teacher": QuizAgent(bus, llm),
        "empathy": EmpathyAgent(bus, llm),
        "parent_liaison": ParentAgent(bus, llm),
    }

    for aid, agent in agent_map.items():
        bus.register(aid, agent.handle)
        logger.info(f"Registered agent: {aid}")

    logger.info("A2A Team bootstrap complete — %d agents online", len(agent_map))
    return bus, registry, agent_map


async def demo():
    bus, registry, agents = await bootstrap()
    tutor = agents["tutor"]

    print("\n=== Demo 1: Direct question ===")
    resp = await tutor.teach("什么是导数？")
    print(resp)

    print("\n=== Demo 2: Code demo request ===")
    resp = await tutor.teach("帮我运行代码：print(2+3)")
    print(resp)

    print("\n=== Demo 3: Quiz request ===")
    resp = await tutor.teach("我想做几道练习题")
    print(resp)

    print("\n=== Demo 4: Frustrated student ===")
    resp = await tutor.teach("太难了，我完全不懂，想放弃")
    print(resp)

    print("\n=== A2A Message History ===")
    for m in bus.get_history():
        print(f"[{m['msg_type']}] {m['from_agent']} -> {m['to_agent']}: {list(m['content'].keys())}")


if __name__ == "__main__":
    asyncio.run(demo())
