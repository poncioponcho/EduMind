#!/bin/bash
# EduMind 超级简单启动器
# 只需运行: ./start-simple.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${CYAN}${BOLD}╔════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║  🚀 EduMind 一键启动 (简单版)      ║${NC}"
echo -e "${CYAN}${BOLD}╚════════════════════════════════════╝${NC}"
echo ""

# 使用固定路径
BASE_DIR="/Users/seyonmacbook/Desktop/电子书/26春招/EduMind/EduMind"
cd "$BASE_DIR"

# 检查 .env 文件
ENV_FILE="$BASE_DIR/edumind-mcp/.env"
if [ -f "$ENV_FILE" ]; then
    echo -e "${GREEN}✅ 找到配置文件: .env${NC}"

    # 检查 API Key
    if grep -q "MOONSHOT_API_KEY=sk-" "$ENV_FILE"; then
        echo -e "${GREEN}✅ Kimi Code API Key 已配置${NC}"
    elif grep -q "GOOGLE_API_KEY=AIza" "$ENV_FILE"; then
        echo -e "${GREEN}✅ Google Gemini API Key 已配置${NC}"
    else
        echo -e "${YELLOW}⚠️  未检测到有效的 API Key${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  .env 文件不存在${NC}"
fi

# 激活虚拟环境
VENV_DIR="$BASE_DIR/edumind-mcp/.venv"
if [ -d "$VENV_DIR" ]; then
    source "$VENV_DIR/bin/activate"
    echo -e "${GREEN}✅ Python 虚拟环境已激活${NC}"
else
    echo -e "${RED}❌ 虚拟环境不存在！请先运行：${NC}"
    echo -e "   cd $BASE_DIR/edumind-mcp && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

# 检查依赖
python -c "import fastapi, uvicorn, langgraph, langchain" 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Python 依赖已就绪${NC}"
else
    echo -e "${YELLOW}⚠️  正在安装缺失的依赖...${NC}"
    pip install -q -r edumind-cognitive/requirements.txt
    pip install -q -r edumind-mcp/requirements.txt
fi

# 释放端口
echo ""
echo -e "${BLUE}📋 检查端口...${NC}"
for port in 8000 8001; do
    if lsof -i :$port -t >/dev/null 2>&1; then
        echo -e "${YELLOW}  ⚠️  释放端口 $port${NC}"
        lsof -i :$port -t | xargs kill -9 2>/dev/null || true
    fi
done
sleep 1
echo -e "${GREEN}✅ 端口就绪 (8000, 8001)${NC}"

# 启动认知诊断服务
echo ""
echo -e "${BLUE}🧠 启动 认知诊断服务...${NC}"
python edumind-cognitive/api/server.py > /tmp/cognitive.log 2>&1 &
COG_PID=$!
sleep 5

if kill -0 $COG_PID 2>/dev/null; then
    # 测试健康检查
    HEALTH=$(curl -s http://localhost:8001/api/health 2>/dev/null || echo "{}")
    STATUS=$(echo $HEALTH | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','error'))" 2>/dev/null || echo "unknown")

    if [ "$STATUS" = "ok" ] || [ "$STATUS" = "degraded" ]; then
        echo -e "${GREEN}✅ 认知诊断服务启动成功！${NC}"
        echo -e "   状态: ${BOLD}$STATUS${NC} | PID: $COG_PID | 端口: 8001"
    else
        echo -e "${YELLOW}⚠️  服务进程存在但可能未完全就绪 (状态: $STATUS)${NC}"
        echo -e "   查看: tail /tmp/cognitive.log"
    fi
else
    echo -e "${RED}❌ 认知诊断服务启动失败！${NC}"
    echo -e "${RED}   错误日志:${NC}"
    cat /tmp/cognitive.log
fi

# 启动 MCP 服务
echo ""
echo -e "${BLUE}🔧 启动 MCP Super Teacher...${NC}"
python edumind-mcp/api/server.py > /tmp/mcp.log 2>&1 &
MCP_PID=$!
sleep 5

if kill -0 $MCP_PID 2>/dev/null; then
    MCP_HEALTH=$(curl -s http://localhost:8000/api/health 2>/dev/null || echo "{}")
    MCP_STATUS=$(echo $MCP_HEALTH | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','error'))" 2>/dev/null || echo "unknown")

    if [ "$MCP_STATUS" = "ok" ] || [ "$MCP_STATUS" = "degraded" ]; then
        echo -e "${GREEN}✅ MCP 服务启动成功！${NC}"
        echo -e "   状态: ${BOLD}$MCP_STATUS${NC} | PID: $MCP_PID | 端口: 8000"
    else
        echo -e "${YELLOW}⚠️  MCP 服务进程存在但可能未完全就绪${NC}"
    fi
else
    echo -e "${RED}❌ MCP 服务启动失败${NC}"
fi

# 显示结果
echo ""
echo -e "${BOLD}${CYAN}═══════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}         🎉 所有后端服务已启动！          ${NC}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}访问地址：${NC}"
echo -e "  ${GREEN}🌐 前端界面:${NC} http://localhost:3003"
echo -e "  ${GREEN}🧠 认知诊断:${NC} http://localhost:8001/api/health"
echo -e "  ${GREEN}🔧 MCP API:${NC}  http://localhost:8000/api/health"
echo ""
echo -e "  ${BOLD}进程管理：${NC}"
echo -e "  停止所有服务: ${RED}kill $COG_PID $MCP_PID${NC}"
echo -e "  查看日志:     tail -f /tmp/cognitive.log /tmp/mcp.log"
echo ""
echo -e "  ${BOLD}下一步：${NC}"
echo -e "  1. 打开新终端窗口"
echo -e "  2. 运行: cd $BASE_DIR && npm run dev"
echo -e "  3. 打开浏览器访问: ${CYAN}http://localhost:3003${NC}"
echo -e "  4. 进入教学页面测试认知诊断功能"
echo ""

# 快速验证
echo -e "${BLUE}🔍 快速验证服务状态...${NC}"
sleep 1
echo -n "  认知诊断: "
curl -s http://localhost:8001/api/health | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    s = d.get('status', 'error')
    llm = '✓' if d.get('llm_ready') else '✗'
    concepts = d.get('kg_concepts', 0)
    print(f'{GREEN}状态: {s} | LLM: {llm} | 概念数: {concepts}{NC}')
except:
    print(f'{RED}无法连接{NC}')
" 2>/dev/null || echo -e "${RED}连接失败${NC}"

echo -n "  MCP 服务:   "
curl -s http://localhost:8000/api/health | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    s = d.get('status', 'error')
    print(f'{GREEN}状态: {s}{NC}')
except:
    print(f'{RED}无法连接{NC}')
" 2>/dev/null || echo -e "${RED}连接失败${NC}"

echo ""
echo -e "${BOLD}${CYAN}按 Ctrl+C 退出此脚本（后端服务继续运行）${NC}"
echo ""

# 保持运行
wait
