import os
import logging
from langchain_core.language_models import BaseChatModel

logger = logging.getLogger("edumind-mcp.llm")


def get_llm(provider: str = None) -> BaseChatModel:
    provider = (provider or os.environ.get("LLM_PROVIDER", "")).lower()

    configured = {
        "gemini": bool(os.environ.get("GOOGLE_API_KEY")),
        "qwen": bool(os.environ.get("DASHSCOPE_API_KEY")),
        "kimi": bool(os.environ.get("MOONSHOT_API_KEY")),
        "openai": bool(os.environ.get("OPENAI_API_KEY")),
    }
    logger.info(f"get_llm(provider={provider or 'auto'}) configured={configured}")

    if provider in ("", "gemini") and os.environ.get("GOOGLE_API_KEY"):
        logger.info("使用 Google Gemini")
        return _create_gemini()
    if provider in ("", "qwen", "dashscope", "bailian") and os.environ.get("DASHSCOPE_API_KEY"):
        logger.info("使用 阿里云百炼(通义千问)")
        return _create_qwen()
    if provider in ("", "kimi", "moonshot") and os.environ.get("MOONSHOT_API_KEY"):
        logger.info("使用 Kimi Code(Moonshot)")
        return _create_kimi()
    if provider in ("", "openai") and os.environ.get("OPENAI_API_KEY"):
        logger.info("使用 OpenAI GPT")
        return _create_openai()

    raise ValueError(
        "未配置任何LLM API Key。请设置以下任一环境变量：\n"
        "  - GOOGLE_API_KEY=xxx          # Google Gemini\n"
        "  - DASHSCOPE_API_KEY=xxx       # 阿里云百炼(通义千问)\n"
        "  - MOONSHOT_API_KEY=xxx        # Kimi Code\n"
        "  - OPENAI_API_KEY=xxx          # OpenAI GPT\n"
        "可选: LLM_PROVIDER=gemini|qwen|kimi|openai  # 强制指定\n"
        "提示: 也可在 edumind-mcp/.env 文件中配置"
    )


def _create_gemini():
    from langchain_google_genai import ChatGoogleGenerativeAI
    return ChatGoogleGenerativeAI(
        model=os.environ.get("GEMINI_MODEL", "gemini-2.0-flash"),
        temperature=float(os.environ.get("LLM_TEMPERATURE", "0.7")),
        google_api_key=os.environ["GOOGLE_API_KEY"],
    )


def _create_qwen():
    from langchain_openai import ChatOpenAI
    return ChatOpenAI(
        model=os.environ.get("QWEN_MODEL", "qwen-plus"),
        temperature=float(os.environ.get("LLM_TEMPERATURE", "0.7")),
        api_key=os.environ["DASHSCOPE_API_KEY"],
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        max_retries=2,
        timeout=30,
    )


def _create_kimi():
    from langchain_openai import ChatOpenAI
    return ChatOpenAI(
        model=os.environ.get("KIMI_MODEL", "moonshot-v1-auto"),
        temperature=float(os.environ.get("LLM_TEMPERATURE", "0.7")),
        api_key=os.environ["MOONSHOT_API_KEY"],
        base_url="https://api.moonshot.cn/v1",
        max_retries=2,
        timeout=30,
    )


def _create_openai():
    from langchain_openai import ChatOpenAI
    return ChatOpenAI(
        model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
        temperature=float(os.environ.get("LLM_TEMPERATURE", "0.7")),
        api_key=os.environ["OPENAI_API_KEY"],
        max_retries=2,
        timeout=30,
    )


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
