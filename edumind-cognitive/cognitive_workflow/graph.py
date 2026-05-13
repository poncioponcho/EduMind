import os
import sys
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("edumind-cognitive.graph")

try:
    from dotenv import load_dotenv
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    if os.path.exists(env_path):
        load_dotenv(env_path)
except ImportError:
    pass

_COGNITIVE_ROOT = os.path.dirname(os.path.dirname(__file__))
_PROJECT_ROOT = os.path.dirname(_COGNITIVE_ROOT)
_MCP_ROOT = os.path.join(_PROJECT_ROOT, "edumind-mcp")

if _MCP_ROOT not in sys.path:
    sys.path.insert(0, _MCP_ROOT)
if _COGNITIVE_ROOT not in sys.path:
    sys.path.insert(0, _COGNITIVE_ROOT)

from langgraph.graph import StateGraph as _StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from cognitive_workflow.state import CognitiveState
from agents.diagnoser import diagnoser_node
from agents.planner import planner_node
from agents.tutor import tutor_node
from agents.hil import human_approval_node, approval_decision
from agent.llm_provider import get_llm

_llm = None
_graph = None
_checkpointer = MemorySaver()


def _get_llm():
    global _llm
    if _llm is None:
        _llm = get_llm()
    return _llm


def after_diagnose(state: dict) -> str:
    diagnosis = state.get("diagnosis", {})
    confidence = diagnosis.get("confidence", 0.5)
    if confidence < 0.5:
        return "ask_human"
    return "plan"


def after_tutor(state: dict) -> str:
    iteration = state.get("iteration", 0)
    plan_completed = state.get("plan_completed", False)
    if plan_completed or iteration > 5:
        return END
    return "diagnose"


async def bound_diagnoser(state: dict) -> dict:
    return await diagnoser_node(state, _get_llm())


async def bound_planner(state: dict) -> dict:
    return await planner_node(state, _get_llm())


async def bound_tutor(state: dict) -> dict:
    return await tutor_node(state, _get_llm())


async def bound_hil(state: dict) -> dict:
    return await human_approval_node(state)


def build_graph():
    builder = _StateGraph(CognitiveState)

    builder.add_node("diagnose", bound_diagnoser)
    builder.add_node("plan", bound_planner)
    builder.add_node("tutor", bound_tutor)
    builder.add_node("hil", bound_hil)

    builder.add_edge(START, "diagnose")
    builder.add_conditional_edges("diagnose", after_diagnose, {"plan": "plan", "ask_human": "hil"})
    builder.add_edge("hil", "plan")
    builder.add_edge("plan", "tutor")
    builder.add_conditional_edges("tutor", after_tutor, {"diagnose": "diagnose", END: END})

    graph = builder.compile(checkpointer=_checkpointer)
    return graph


def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph
