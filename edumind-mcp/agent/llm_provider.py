import os
from langchain_core.language_models import BaseChatModel
from langchain_core.tools import BaseTool


def get_llm(provider: str = None) -> BaseChatModel:
    """根据环境变量自动选择LLM提供商。

    支持的提供商（按优先级）：
      1. gemini     → Google Gemini Flash (需要 GOOGLE_API_KEY)
      2. qwen       → 阿里云百炼 通义千问 (需要 DASHSCOPE_API_KEY)
      3. kimi/moonshot → Kimi Code/Moonshot (需要 MOONSHOT_API_KEY)
      4. openai     → OpenAI GPT (需要 OPENAI_API_KEY)

    设置 LLM_PROVIDER 环境变量可强制指定提供商。
    """
    provider = (provider or os.environ.get("LLM_PROVIDER", "")).lower()

    _debug_env = {k: (v[:8]+"..." if v else "None") for k, v in {
        "GOOGLE_API_KEY": os.environ.get("GOOGLE_API_KEY"),
        "DASHSCOPE_API_KEY": os.environ.get("DASHSCOPE_API_KEY"),
        "MOONSHOT_API_KEY": os.environ.get("MOONSHOT_API_KEY"),
        "OPENAI_API_KEY": os.environ.get("OPENAI_API_KEY"),
    }.items()}
    import sys
    print(f"[LLM-DEBUG] get_llm(provider={provider}) env={_debug_env}", file=sys.stderr)

    if provider in ("", "gemini") and os.environ.get("GOOGLE_API_KEY"):
        return _create_gemini()
    if provider in ("", "qwen", "dashscope", "bailian") and os.environ.get("DASHSCOPE_API_KEY"):
        return _create_qwen()
    if provider in ("", "kimi", "moonshot") and os.environ.get("MOONSHOT_API_KEY"):
        return _create_kimi()
    if provider in ("", "openai") and os.environ.get("OPENAI_API_KEY"):
        return _create_openai()

    raise ValueError(
        "未配置任何LLM API Key。请设置以下任一环境变量：\n"
        "  - GOOGLE_API_KEY=xxx          # Google Gemini\n"
        "  - DASHSCOPE_API_KEY=xxx       # 阿里云百炼(通义千问)\n"
        "  - MOONSHOT_API_KEY=xxx        # Kimi Code\n"
        "  - OPENAI_API_KEY=xxx          # OpenAI GPT\n"
        "可选: LLM_PROVIDER=gemini|qwen|kimi|openai  # 强制指定"
    )


def _create_gemini(tools=None):
    from langchain_google_genai import ChatGoogleGenerativeAI
    llm = ChatGoogleGenerativeAI(
        model=os.environ.get("GEMINI_MODEL", "gemini-2.0-flash"),
        temperature=float(os.environ.get("LLM_TEMPERATURE", "0.7")),
        google_api_key=os.environ["GOOGLE_API_KEY"],
    )
    return llm.bind_tools(tools) if tools else llm


def _create_qwen(tools=None):
    from langchain_openai import ChatOpenAI
    llm = ChatOpenAI(
        model=os.environ.get("QWEN_MODEL", "qwen-plus"),
        temperature=float(os.environ.get("LLM_TEMPERATURE", "0.7")),
        api_key=os.environ["DASHSCOPE_API_KEY"],
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    )
    return llm.bind_tools(tools) if tools else llm


def _create_kimi(tools=None):
    from langchain_openai import ChatOpenAI
    llm = ChatOpenAI(
        model=os.environ.get("KIMI_MODEL", "moonshot-v1-auto"),
        temperature=float(os.environ.get("LLM_TEMPERATURE", "0.7")),
        api_key=os.environ["MOONSHOT_API_KEY"],
        base_url="https://api.moonshot.cn/v1",
    )
    return llm.bind_tools(tools) if tools else llm


def _create_openai(tools=None):
    from langchain_openai import ChatOpenAI
    llm = ChatOpenAI(
        model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
        temperature=float(os.environ.get("LLM_TEMPERATURE", "0.7")),
        api_key=os.environ["OPENAI_API_KEY"],
    )
    return llm.bind_tools(tools) if tools else llm


PROVIDER_INFO = {
    "gemini": {
        "name": "Google Gemini",
        "env": "GOOGLE_API_KEY",
        "url": "https://aistudio.google.com/apikey",
        "free_tier": True,
        "models": ["gemini-2.0-flash", "gemini-2.5-pro"],
    },
    "qwen": {
        "name": "阿里云百炼(通义千问)",
        "env": "DASHSCOPE_API_KEY",
        "url": "https://bailian.console.aliyun.com/",
        "free_tier": True,
        "models": ["qwen-max", "qwen-plus", "qwen-turbo"],
    },
    "kimi": {
        "name": "Kimi Code(Moonshot)",
        "env": "MOONSHOT_API_KEY",
        "url": "https://platform.moonshot.cn/console/api-keys",
        "free_tier": True,
        "models": ["moonshot-v1-128k", "moonshot-v1-auto"],
    },
    "openai": {
        "name": "OpenAI GPT",
        "env": "OPENAI_API_KEY",
        "url": "https://platform.openai.com/api-keys",
        "free_tier": False,
        "models": ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"],
    },
}
