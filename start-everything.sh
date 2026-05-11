#!/bin/bash
# EduMind 一键启动脚本 v2.0
# 解决"无法连接认知诊断服务"问题的终极方案

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV_DIR="$PROJECT_ROOT/edumind-mcp/.venv"
ENV_FILE="$PROJECT_ROOT/edumind-mcp/.env"

echo ""
echo -e "${CYAN}${BOLD}╔════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║   🚀 EduMind 一键启动器 v2.0           ║${NC}"
echo -e "${CYAN}${BOLD}║   自动配置环境 + 启动所有服务          ║${NC}"
echo -e "${CYAN}${BOLD}╚════════════════════════════════════════╝${NC}"
echo ""

cd "$PROJECT_ROOT"

# ============================================
# 步骤 1: 检查 API Key 配置
# ============================================
echo -e "${BLUE}[步骤 1/5] 检查 API Key 配置...${NC}"

if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}⚠️  .env 文件不存在，正在创建...${NC}"
    cat > "$ENV_FILE" << 'EOF'
# EduMind MCP Super Teacher 环境配置

# Google Gemini (推荐)
GOOGLE_API_KEY=

# 阿里云百炼
DASHSCOPE_API_KEY=

# Kimi Code/Moonshot
MOONSHOT_API_KEY=

# OpenAI GPT
OPENAI_API_KEY=
EOF
    echo -e "${GREEN}✅ 已创建 .env 文件（请手动添加 API Key）${NC}"
fi

API_KEY_COUNT=0
if grep -q "MOONSHOT_API_KEY=sk-" "$ENV_FILE"; then
    ((API_KEY_COUNT++))
    echo -e "${GREEN}✅ Kimi Code/Moonshot API Key 已配置${NC}"
elif grep -q "GOOGLE_API_KEY=AIza" "$ENV_FILE"; then
    ((API_KEY_COUNT++))
    echo -e "${GREEN}✅ Google Gemini API Key 已配置${NC}"
elif grep -q "DASHSCOPE_API_KEY=sk-" "$ENV_FILE"; then
    ((API_KEY_COUNT++))
    echo -e "${GREEN}✅ 阿里云百炼 API Key 已配置${NC}"
elif grep -q "OPENAI_API_KEY=sk-" "$ENV_FILE"; then
    ((API_KEY_COUNT++))
    echo -e "${GREEN}✅ OpenAI API Key 已配置${NC}"
else
    echo -e "${YELLOW}⚠️  未检测到有效的 API Key${NC}"
    echo ""
    echo -e "${BOLD}请选择操作：${NC}"
    echo "  1) 我已经配置了，继续启动"
    echo "  2) 帮我配置 Kimi Code API Key"
    echo "  3) 退出并手动配置"
    echo ""
    read -p "请输入选项 (1-3): " choice

    case $choice in
        1)
            echo -e "${YELLOW}继续启动...${NC}"
            ;;
        2)
            echo ""
            read -p "请输入你的 Kimi Code API Key (sk-开头): " kimi_key
            if [[ $kimi_key == sk-* ]]; then
                sed -i '' "s/MOONSHOT_API_KEY=.*/MOONSHOT_API_KEY=$kimi_key/" "$ENV_FILE"
                echo -e "${GREEN}✅ API Key 已保存到 .env 文件${NC}"
                ((API_KEY_COUNT++))
            else
                echo -e "${red}❌ API Key 格式不正确，应以 sk- 开头${NC}"
                exit 1
            fi
            ;;
        3)
            echo -e "${YELLOW}请编辑 edumind-mcp/.env 文件后重新运行此脚本${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}无效选项${NC}"
            exit 1
            ;;
    esac
fi

if [ $API_KEY_COUNT -eq 0 ]; then
    echo -e "${YELLOW}⚠️  警告: 未配置任何 API Key，部分功能可能不可用${NC}"
fi

# ============================================
# 步骤 2: 检查 Python 虚拟环境
# ============================================
echo ""
echo -e "${BLUE}[步骤 2/5] 检查 Python 环境...${NC}"

if [ ! -d "$VENV_DIR" ]; then
    echo -e "${YELLOW}⚠️  虚拟环境不存在，正在创建...${NC}"
    cd edumind-mcp
    python3 -m venv .venv
    cd ..
    echo -e "${GREEN}✅ 虚拟环境已创建${NC}"
fi

source "$VENV_DIR/bin/activate"

PYTHON_VERSION=$(python --version 2>&1 | awk '{print $2}')
echo -e "${GREEN}✅ Python 版本: $PYTHON_VERSION${NC}"

# 检查关键依赖
MISSING_DEPS=""
for dep in fastapi uvicorn langgraph langchain pydantic; do
    if ! python -c "import ${dep}" 2>/dev/null; then
        MISSING_DEPS="$MISSING_DEPS $dep"
    fi
done

if [ -n "$MISSING_DEPS" ]; then
    echo -e "${YELLOW}⚠️  检测到缺失依赖:$MISSING_DEPS${NC}"
    echo "正在安装依赖..."
    pip install -q -r edumind-cognitive/requirements.txt
    pip install -q -r edumind-mcp/requirements.txt
    echo -e "${GREEN}✅ 依赖安装完成${NC}"
else
    echo -e "${GREEN}✅ 所有关键依赖已就绪${NC}"
fi

# ============================================
# 步骤 3: 释放端口
# ============================================
echo ""
echo -e "${BLUE}[步骤 3/5] 检查端口占用...${NC}"

MCP_PORT=${MCP_PORT:-8000}
COGNITIVE_PORT=${COGNITIVE_PORT:-8001}

for port in $MCP_PORT $COGNITIVE_PORT; do
    if lsof -i :$port -t >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  端口 $port 已占用，正在释放...${NC}"
        lsof -i :$port -t | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
done
echo -e "${GREEN}✅ 端口已就绪 (MCP:$MCP_PORT, Cognitive:$COGNITIVE_PORT)${NC}"

# ============================================
# 步骤 4: 启动后端服务
# ============================================
echo ""
echo -e "${BLUE}[步骤 4/5] 启动后端服务...${NC}"

echo -n "  🧠 启动 认知诊断服务 (端口 $COGNITIVE_PORT) ... "
python edumind-cognitive/api/server.py > /tmp/edumind-cognitive.log 2>&1 &
COG_PID=$!
sleep 6

if kill -0 $COG_PID 2>/dev/null; then
    # 验证服务是否真正可用
    COG_HEALTH=$(curl -s http://localhost:$COGNITIVE_PORT/api/health 2>/dev/null || echo "{}")
    COG_STATUS=$(echo "$COG_HEALTH" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('status', 'error'))
except:
    print('error')
" 2>/dev/null)

    if [ "$COG_STATUS" = "ok" ] || [ "$COG_STATUS" = "degraded" ]; then
        echo -e "${GREEN}✅ 成功 (PID: $COG_PID, 状态: $COG_STATUS)${NC}"
    else
        echo -e "${YELLOW}⚠️  进程已启动但健康检查异常 ($COG_STATUS)${NC}"
        echo -e "  日志: tail -f /tmp/edumind-cognitive.log"
    fi
else
    echo -e "${RED}❌ 失败${NC}"
    echo -e "${RED}  请查看日志: cat /tmp/edumind-cognitive.log${NC}"
fi

echo -n "  🔧 启动 MCP Super Teacher (端口 $MCP_PORT) ... "
python edumind-mcp/api/server.py > /tmp/edumind-mcp.log 2>&1 &
MCP_PID=$!
sleep 6

if kill -0 $MCP_PID 2>/dev/null; then
    MCP_HEALTH=$(curl -s http://localhost:$MCP_PORT/api/health 2>/dev/null || echo "{}")
    MCP_STATUS=$(echo "$MCP_HEALTH" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('status', 'error'))
except:
    print('error')
" 2>/dev/null)

    if [ "$MCP_STATUS" = "ok" ] || [ "$MCP_STATUS" = "degraded" ]; then
        echo -e "${GREEN}✅ 成功 (PID: $MCP_PID, 状态: $MCP_STATUS)${NC}"
    else
        echo -e "${YELLOW}⚠️  进程已启动但健康检查异常 ($MCP_STATUS)${NC}"
    fi
else
    echo -e "${RED}❌ 失败${NC}"
fi

# ============================================
# 步骤 5: 显示启动结果
# ============================================
echo ""
echo -e "${BLUE}[步骤 5/5] 验证服务状态...${NC}"
sleep 2

echo ""
echo -e "${BOLD}${CYAN}═════════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}              ✨ 启动完成！                    ${NC}"
echo -e "${BOLD}${CYAN}═════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}🌐 前端地址:${NC}     ${BOLD}http://localhost:3003${NC}"
echo -e "  ${GREEN}🧠 认知诊断:${NC}     http://localhost:$COGNITIVE_PORT"
echo -e "  ${GREEN}🔧 MCP 服务:${NC}     http://localhost:$MCP_PORT"
echo ""
echo -e "  ${YELLOW}进程ID: 认知诊断=$COG_PID, MCP=$MCP_PID${NC}"
echo ""
echo -e "${BOLD}下一步操作：${NC}"
echo -e "  1️⃣  打开浏览器访问: ${CYAN}http://localhost:3003${NC}"
echo -e "  2️⃣  进入教学页面，选择知识点测试认知诊断功能"
echo ""
echo -e "${BOLD}停止所有服务：${NC}"
echo -e "  ${RED}kill $COG_PID $MCP_PID${NC}"
echo -e "  或按 ${YELLOW}Ctrl+C${NC} 停止此脚本（后端继续运行）"
echo ""
echo -e "${BOLD}查看日志：${NC}"
echo -e "  认知诊断: ${CYAN}tail -f /tmp/edumind-cognitive.log${NC}"
echo -e "  MCP服务:   ${CYAN}tail -f /tmp/edumind-mcp.log${NC}"
echo ""
echo -e "${BOLD}快速验证：${NC}"
echo -e "  ${CYAN}curl http://localhost:$COGNITIVE_PORT/api/health | python3 -m json.tool${NC}"
echo ""

# 保持脚本运行，显示实时日志预览
echo -e "${BLUE}最近的服务日志（按 Ctrl+C 退出）：${NC}"
echo -e "${BLUE}─────────────────────────────────────────────${NC}"

tail -f /tmp/edumind-cognitive.log /tmp/edumind-mcp.log 2>/dev/null &
TAIL_PID=$!

cleanup() {
    echo ""
    echo -e "\n${YELLOW}正在清理...${NC}"
    kill $TAIL_PID 2>/dev/null || true
    echo -e "${GREEN}✅ 清理完成。后端服务仍在后台运行。${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

wait
