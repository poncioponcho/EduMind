import os
import yaml
import json
from langchain_core.messages import SystemMessage, AIMessage, HumanMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_mcp_adapters.client import MultiServerMCPClient
from agent.state import EduState

TEACHER_PROMPT = """你是EduMind超级教师，一位精通高等数学的AI导师。你的教学原则：

1. **数学问题** → 先调用 calculate/solve_equation 验证答案 → 结合工具结果分步讲解
2. **求导/积分** → 调用 derivative_step/integral_step 展示分步过程 → 引导学生理解每一步
3. **编程问题** → 调用 execute_python 执行代码 → 展示运行结果和代码解释
4. **前沿知识** → 调用 search_papers 检索论文 → 总结3篇核心论文要点
5. **可视化需求** → 调用 plot_function/plot_chart 生成图表 → 配合图表讲解

教学风格：
- 每轮回应≤3句话，复杂内容拆步骤
- 先引导思考，再给出答案
- 使用Socratic反问法激发学生思考
- 工具调用后必须结合结果进行教学解释，不能只返回工具输出
- 适时给予鼓励和肯定

当前教学阶段: {phase}
情感状态: {emotion}"""


def _load_registry():
    registry_path = os.path.join(os.path.dirname(__file__), "..", "registry.yaml")
    with open(registry_path) as f:
        return yaml.safe_load(f)


def _detect_emotion(message: str) -> str:
    confused_kw = ["不懂", "为什么", "怎么回事", "不理解", "confused", "不明白"]
    happy_kw = ["懂了", "明白了", "谢谢", "理解了", "got it"]
    if any(kw in message.lower() for kw in confused_kw):
        return "encouraging"
    if any(kw in message.lower() for kw in happy_kw):
        return "praising"
    return "neutral"


def _detect_phase(message: str, history: list) -> str:
    definition_kw = ["定义", "什么是", "概念", "definition"]
    example_kw = ["例子", "怎么算", "演示", "example"]
    practice_kw = ["练习", "做题", "试试", "practice"]

    m = message.lower()
    if any(kw in m for kw in definition_kw):
        return "definition"
    if any(kw in m for kw in example_kw):
        return "example"
    if any(kw in m for kw in practice_kw):
        return "practice"
    return "teaching"


async def build_agent():
    registry = _load_registry()

    mcp_config = {}
    for name, server in registry["servers"].items():
        mcp_config[name] = {
            "command": server["command"],
            "args": server["args"],
            "transport": server["transport"],
        }
        if "url" in server:
            mcp_config[name]["url"] = server["url"]

    mcp = MultiServerMCPClient(mcp_config)
    tools = await mcp.get_tools()

    llm = ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        temperature=0.7,
        google_api_key=os.environ.get("GOOGLE_API_KEY", ""),
    ).bind_tools(tools)

    async def bound_teacher_node(state: EduState) -> dict:
        last_message = state["messages"][-1].content if state["messages"] else ""
        phase = _detect_phase(last_message, state["messages"])
        emotion = _detect_emotion(last_message)

        prompt = TEACHER_PROMPT.format(phase=phase, emotion=emotion)

        msgs = [SystemMessage(content=prompt)]

        if state.get("tools_used"):
            tool_summary = "\n".join(
                f"- {t['name']}: {t.get('result', '')[:200]}" for t in state["tools_used"]
            )
            msgs.append(AIMessage(content=f"[工具调用结果]\n{tool_summary}"))

        msgs.extend(state["messages"])

        response = await llm.ainvoke(msgs)

        return {
            "messages": [response],
            "phase": phase,
            "emotion": emotion,
        }

    g = StateGraph(EduState)

    g.add_node("teacher", bound_teacher_node)
    g.add_node("tools", ToolNode(tools))

    g.add_conditional_edges("teacher", tools_condition, {"tools": "tools", END: END})
    g.add_edge("tools", "teacher")
    g.add_edge(START, "teacher")

    graph = g.compile()

    return graph, tools


async def run_teaching(message: str, history: list = []) -> dict:
    graph, tools = await build_agent()

    state = {
        "messages": [HumanMessage(content=message)],
        "tools_used": [],
        "observation": "",
        "phase": "teaching",
        "emotion": "neutral",
    }

    if history:
        for msg in history[-10:]:
            if msg.get("role") == "student":
                state["messages"].insert(-1, HumanMessage(content=msg["content"]))
            elif msg.get("role") == "tutor":
                state["messages"].insert(-1, AIMessage(content=msg["content"]))

    result = await graph.ainvoke(state)

    tools_used = []
    for msg in result["messages"]:
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            for tc in msg.tool_calls:
                tools_used.append({"name": tc["name"], "args": tc.get("args", {})})
        if isinstance(msg, ToolMessage):
            for tu in tools_used:
                if not tu.get("result"):
                    tu["result"] = msg.content[:500]
                    break

    response_text = ""
    for msg in reversed(result["messages"]):
        if isinstance(msg, AIMessage) and msg.content and not getattr(msg, "tool_calls", None):
            response_text = msg.content
            break

    return {
        "message": response_text or "让我想想这个问题...",
        "tools_used": tools_used,
        "phase": result.get("phase", "teaching"),
        "emotion": result.get("emotion", "neutral"),
    }
