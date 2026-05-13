#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$PROJECT_ROOT/edumind-mcp/.venv"
ENV_FILE="$PROJECT_ROOT/edumind-mcp/.env"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  EduMind 全栈服务启动脚本${NC}"
echo -e "${BLUE}========================================${NC}"

if [ ! -d "$VENV_DIR" ]; then
    echo -e "${RED}❌ 虚拟环境不存在: $VENV_DIR${NC}"
    echo "请先运行: cd edumind-mcp && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}⚠️  .env 文件不存在，将使用系统环境变量${NC}"
else
    echo -e "${GREEN}✅ 找到 .env 文件${NC}"
fi

source "$VENV_DIR/bin/activate"

MCP_PORT=${MCP_PORT:-8000}
COGNITIVE_PORT=${COGNITIVE_PORT:-8001}
FRONTEND_PORT=3003

echo ""
echo -e "${BLUE}[1/3] 检查端口占用...${NC}"
for port in $MCP_PORT $COGNITIVE_PORT; do
    if lsof -i :$port -t >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  端口 $port 已占用，尝试释放...${NC}"
        lsof -i :$port -t | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
done

echo -e "${GREEN}✅ 端口已就绪 (MCP:$MCP_PORT, Cognitive:$COGNITIVE_PORT)${NC}"

echo ""
echo -e "${BLUE}[2/3] 启动后端服务...${NC}"

cd "$PROJECT_ROOT"

echo -n "  启动 MCP Super Teacher (端口 $MCP_PORT) ... "
python edumind-mcp/api/server.py &
MCP_PID=$!
sleep 8

if kill -0 $MCP_PID 2>/dev/null; then
    echo -e "${GREEN}✅ MCP 已启动 (PID: $MCP_PID)${NC}"
else
    echo -e "${RED}❌ MCP 启动失败${NC}"
fi

echo -n "  启动 认知诊断系统 (端口 $COGNITIVE_PORT) ... "
python edumind-cognitive/api/server.py &
COG_PID=$!
sleep 5

if kill -0 $COG_PID 2>/dev/null; then
    echo -e "${GREEN}✅ Cognitive 已启动 (PID: $COG_PID)${NC}"
else
    echo -e "${RED}❌ Cognitive 启动失败${NC}"
fi

echo ""
echo -e "${BLUE}[3/3] 验证服务状态...${NC}"

sleep 2

echo -n "  MCP Health: "
MCP_HEALTH=$(curl -s http://localhost:$MCP_PORT/api/health 2>/dev/null || echo "{}")
MCP_STATUS=$(echo "$MCP_HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','error'))" 2>/dev/null || echo "error")
if [ "$MCP_STATUS" = "ok" ]; then
    echo -e "${GREEN}✅ 正常${NC}"
else
    echo -e "${YELLOW}⚠️  $MCP_STATUS${NC}"
fi

echo -n "  Cognitive Health: "
COG_HEALTH=$(curl -s http://localhost:$COGNITIVE_PORT/api/health 2>/dev/null || echo "{}")
COG_STATUS=$(echo "$COG_HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','error'))" 2>/dev/null || echo "error")
if [ "$COG_STATUS" = "ok" ] || [ "$COG_STATUS" = "degraded" ]; then
    echo -e "${GREEN}✅ 正常 ($COG_STATUS)${NC}"
else
    echo -e "${RED}❌ 无法连接${NC}"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}  所有服务已启动！${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "  📡 前端地址:     http://localhost:$FRONTEND_PORT"
echo "  🔧 MCP API:     http://localhost:$MCP_PORT"
echo "  🧠 Cognitive:   http://localhost:$COGNITIVE_PORT"
echo ""
echo "  停止所有服务:   kill $MCP_PID $COG_PID"
echo "  或按 Ctrl+C 停止此脚本（后端继续运行）"
echo ""

wait
