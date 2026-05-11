import os
import logging
import traceback
import yaml
from langchain_core.messages import SystemMessage, AIMessage, HumanMessage, ToolMessage
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_mcp_adapters.client import MultiServerMCPClient
from agent.state import EduState
from agent.llm_provider import get_llm

logger = logging.getLogger("edumind-mcp.graph")

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
- 如果工具调用失败，不要暴露技术细节，用通俗语言解释并继续教学

当前教学阶段: {phase}
情感状态: {emotion}"""


def _load_registry():
    registry_path = os.path.join(os.path.dirname(__file__), "..", "registry.yaml")
    if not os.path.exists(registry_path):
        logger.warning(f"registry.yaml 不存在: {registry_path}")
        return {"servers": {}}
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

    if not registry.get("servers"):
        logger.warning("registry.yaml 中无服务器配置，将使用无工具模式")

    mcp_config = {}
    for name, server in registry.get("servers", {}).items():
        mcp_config[name] = {
            "command": server["command"],
            "args": server["args"],
            "transport": server["transport"],
        }
        if "url" in server:
            mcp_config[name]["url"] = server["url"]

    tools = []
    mcp_client = None
    if mcp_config:
        try:
            mcp_client = MultiServerMCPClient(mcp_config)
            tools = await mcp_client.get_tools()
            logger.info(f"MCP工具加载成功: {len(tools)}个工具")
        except Exception as e:
            logger.error(f"MCP工具加载失败: {e}\n{traceback.format_exc()}")
            logger.info("将以无工具模式继续运行")
    else:
        logger.info("无MCP服务器配置，使用无工具模式")

    provider_name = os.environ.get("LLM_PROVIDER", "") or ""
    logger.info(f"初始化LLM提供商: {provider_name or 'auto-detect'}")

    llm = get_llm(provider_name)

    if tools:
        try:
            llm = llm.bind_tools(tools)
            logger.info(f"LLM已绑定 {len(tools)} 个工具")
        except Exception as e:
            logger.error(f"工具绑定失败: {e}，将以无工具模式运行")
            tools = []

    async def bound_teacher_node(state: EduState) -> dict:
        last_message = ""
        if state["messages"]:
            last_msg = state["messages"][-1]
            raw_content = last_msg.content if hasattr(last_msg, 'content') else str(last_msg)
            if isinstance(raw_content, list):
                parts = []
                for part in raw_content:
                    if isinstance(part, dict) and part.get("text"):
                        parts.append(part["text"])
                last_message = " ".join(parts)
            else:
                last_message = str(raw_content)

        phase = _detect_phase(last_message, state["messages"])
        emotion = _detect_emotion(last_message)

        prompt = TEACHER_PROMPT.format(phase=phase, emotion=emotion)

        msgs = [SystemMessage(content=prompt)]

        if state.get("tools_used"):
            tool_summary = "\n".join(
                f"- {t['name']}: {t.get('result', '')[:200]}" for t in state["tools_used"]
            )
            msgs.append(AIMessage(content=f"[工具调用结果]\n{tool_summary}"))

        for msg in state["messages"]:
            if isinstance(msg, (HumanMessage, AIMessage)):
                msgs.append(msg)
            elif isinstance(msg, ToolMessage):
                msgs.append(msg)

        try:
            response = await llm.ainvoke(msgs)
        except Exception as e:
            logger.error(f"LLM调用失败: {type(e).__name__}: {e}")
            error_response = "抱歉，我暂时无法处理你的问题。"
            if "401" in str(e) or "unauthorized" in str(e).lower():
                error_response = "API Key验证失败，请联系管理员检查配置。"
            elif "429" in str(e):
                error_response = "请求过于频繁，请稍后再试。"
            elif "timeout" in str(e).lower():
                error_response = "思考时间过长，请换个简单的问题试试。"
            return {
                "messages": [AIMessage(content=error_response)],
                "phase": phase,
                "emotion": "neutral",
            }

        return {
            "messages": [response],
            "phase": phase,
            "emotion": emotion,
        }

    g = StateGraph(EduState)

    g.add_node("teacher", bound_teacher_node)

    if tools:
        g.add_node("tools", ToolNode(tools))
        g.add_conditional_edges("teacher", tools_condition, {"tools": "tools", END: END})
        g.add_edge("tools", "teacher")
    else:
        g.add_edge("teacher", END)

    g.add_edge(START, "teacher")

    graph = g.compile()

    return graph, tools


async def run_teaching(message: str, history: list = []) -> dict:
    graph, tools = await build_agent()

    history_msgs = []
    if history:
        for msg in history[-10:]:
            role = msg.get("role", "")
            content = msg.get("content", "")
            if not content:
                continue
            if role == "student":
                history_msgs.append(HumanMessage(content=content))
            elif role == "tutor":
                history_msgs.append(AIMessage(content=content))

    state = {
        "messages": history_msgs + [HumanMessage(content=message)],
        "tools_used": [],
        "observation": "",
        "phase": "teaching",
        "emotion": "neutral",
    }

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
