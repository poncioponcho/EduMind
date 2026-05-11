#!/bin/bash
# EduMind 认知诊断服务启动脚本（最终版）
# 用法: ./start-cognitive.sh

BASE_DIR="/Users/seyonmacbook/Desktop/电子书/26春招/EduMind/EduMind"
VENV_DIR="$BASE_DIR/edumind-mcp/.venv"
ENV_FILE="$BASE_DIR/edumind-mcp/.env"

echo "🚀 启动 EduMind 认知诊断服务..."
echo ""

# 切换到项目根目录
cd "$BASE_DIR" || exit 1

# 激活虚拟环境
if [ ! -d "$VENV_DIR" ]; then
    echo "❌ 虚拟环境不存在: $VENV_DIR"
    exit 1
fi
source "$VENV_DIR/bin/activate"

# 加载 .env 文件到环境变量
if [ -f "$ENV_FILE" ]; then
    echo "✅ 加载配置文件: $ENV_FILE"
    export $(grep -v '^#' $ENV_FILE | xargs)
else
    echo "⚠️  .env 文件不存在"
fi

# 设置 Python 路径
export PYTHONPATH="$BASE_DIR:$BASE_DIR/edumind-mcp:$BASE_DIR/edumind-cognitive"

# 显示 API Key 状态
if [ -n "$MOONSHOT_API_KEY" ]; then
    echo "✅ Kimi Code API Key: ${MOONSHOT_API_KEY:0:6}***"
elif [ -n "$GOOGLE_API_KEY" ]; then
    echo "✅ Google Gemini API Key: ${GOOGLE_API_KEY:0:6}***"
elif [ -n "$DASHSCOPE_API_KEY" ]; then
    echo "✅ 阿里云百炼 API Key: ${DASHSCOPE_API_KEY:0:6}***"
elif [ -n "$OPENAI_API_KEY" ]; then
    echo "✅ OpenAI API Key: ${OPENAI_API_KEY:0:6}***"
else
    echo "⚠️  未检测到任何 API Key"
fi

echo ""
echo "📂 工作目录: $(pwd)"
echo "🐍 Python: $(which python)"
echo "🔧 PYTHONPATH: $PYTHONPATH"
echo ""

# 启动服务
echo "🚀 启动认知诊断服务 (端口 8001)..."
exec python edumind-cognitive/api/server.py
