#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EVOLVE_DIR="$SCRIPT_DIR/edumind-evolve"

echo "🧬 EduMind 自进化教学系统 启动脚本"
echo "===================================="

if [ ! -d "$EVOLVE_DIR" ]; then
    echo "❌ 找不到 edumind-evolve 目录: $EVOLVE_DIR"
    exit 1
fi

cd "$EVOLVE_DIR"

if [ ! -d ".venv" ]; then
    echo "📦 创建虚拟环境..."
    python3 -m venv .venv
fi

echo "📦 激活虚拟环境..."
source .venv/bin/activate

echo "📦 安装依赖..."
pip install -q -r requirements.txt 2>/dev/null

if [ ! -f ".env" ]; then
    echo "⚠️  未找到 .env 文件，从 .env.example 复制..."
    cp .env.example .env
    echo "⚠️  请编辑 .env 配置 API Key（可选，无LLM时系统以RL-only模式运行）"
fi

PORT=${EVOLVE_PORT:-8003}
echo ""
echo "🚀 启动自进化教学系统 (端口: $PORT)..."
echo "   Dashboard: http://localhost:$PORT/api/dashboard"
echo "   API Docs:  http://localhost:$PORT/docs"
echo "   Health:    http://localhost:$PORT/api/health"
echo ""

python -m api.server
