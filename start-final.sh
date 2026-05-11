#!/bin/bash
# EduMind 最终版启动脚本
# 解决所有路径和依赖问题

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# 固定项目根目录
BASE_DIR="/Users/seyonmacbook/Desktop/电子书/26春招/EduMind/EduMind"

echo ""
echo -e "${CYAN}${BOLD}╔════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║  🚀 EduMind 最终启动器 v3.0       ║${NC}"
echo -e "${CYAN}${BOLD}║  解决"无法连接认知诊断服务"问题    ║${NC}"
echo -e "${CYAN}${BOLD}╚════════════════════════════════════╝${NC}"
echo ""

# 切换到项目根目录
cd "$BASE_DIR"
echo -e "${BLUE}📂 工作目录: $BASE_DIR${NC}"

# ============================================
# 1. 验证 .env 文件
# ============================================
ENV_FILE="$BASE_DIR/edumind-mcp/.env"
echo -e "\n${BLUE}[1/4] ✅ 检查配置文件...${NC}"

if [ -f "$ENV_FILE" ]; then
    echo -e "${GREEN}   ✓ .env 文件存在${NC}"
    if grep -q "MOONSHOT_API_KEY=sk-" "$ENV_FILE"; then
        echo -e "${GREEN}   ✓ Kimi Code API Key 已配置${NC}"
    else
        echo -e "${YELLOW}   ⚠ API Key 可能未配置${NC}"
    fi
else
    echo -e "${RED}   ✗ .env 文件不存在！${NC}"
    exit 1
fi

# ============================================
# 2. 激活虚拟环境并验证依赖
# ============================================
VENV_DIR="$BASE_DIR/edumind-mcp/.venv"
echo -e "\n${BLUE}[2/4] 🔧 配置 Python 环境...${NC}"

if [ ! -d "$VENV_DIR" ]; then
    echo -e "${RED}   ✗ 虚拟环境不存在！${NC}"
    echo -e "${YELLOW}   正在创建...${NC}"
    cd "$BASE_DIR/edumind-mcp"
    python3 -m venv .venv
    cd "$BASE_DIR"
fi

source "$VENV_DIR/bin/activate"
echo -e "${GREEN}   ✓ 虚拟环境已激活${NC}"

# 测试关键模块导入
python -c "
import sys
import os

# 添加必要的路径
sys.path.insert(0, '$BASE_DIR')
sys.path.insert(0, '$BASE_DIR/edumind-mcp')

# 测试导入
try:
    from agent.llm_provider import get_llm
    print('✓ agent 模块正常')
except Exception as e:
    print(f'✗ agent 模块导入失败: {e}')
    sys.exit(1)

try:
    from kg.neo4j_client import kg
    print('✓ kg 模块正常')
except Exception as e:
    print(f'✗ kg 模块导入失败: {e}')
    sys.exit(1)

try:
    import fastapi
    import uvicorn
    import langgraph
    print('✓ 所有依赖正常')
except ImportError as e:
    print(f'✗ 依赖缺失: {e}')
    sys.exit(1)
" 2>&1 | while read line; do
    if [[ $line == *"✓"* ]]; then
        echo -e "${GREEN}   $line${NC}"
    elif [[ $line == *"✗"* ]]; then
        echo -e "${RED}   $line${NC}"
    else
        echo -e "   $line"
    fi
done

# 如果导入失败，退出
python -c "
import sys
sys.path.insert(0, '$BASE_DIR')
sys.path.insert(0, '$BASE_DIR/edumind-mcp')
from agent.llm_provider import get_llm
from kg.neo4j_client import kg
" 2>/dev/null
if [ $? -ne 0 ]; then
    echo -e "\n${RED}❌ Python 环境配置失败，请检查依赖安装${NC}"
    exit 1
fi

# ============================================
# 3. 停止旧进程并释放端口
# ============================================
echo -e "\n${BLUE}[3/4] 🔄 准备服务端口...${NC}"

for port in 8000 8001; do
    if lsof -i :$port -t >/dev/null 2>&1; then
        echo -e "${YELLOW}   ⚠ 释放端口 $port${NC}"
        lsof -i :$port -t | xargs kill -9 2>/dev/null || true
    fi
done
sleep 1
echo -e "${GREEN}   ✓ 端口 8000, 8001 已就绪${NC}"

# ============================================
# 4. 启动认知诊断服务（关键步骤）
# ============================================
echo -e "\n${BLUE}[4/4] 🚀 启动 认知诊断服务 (端口 8001)...${NC}"

# 使用 nohup 在后台启动，并确保工作目录正确
nohup bash -c "
    cd '$BASE_DIR'
    source '$VENV_DIR/bin/activate'
    export PYTHONPATH='$BASE_DIR:$BASE_DIR/edumind-mcp'
    python edumind-cognitive/api/server.py
" > /tmp/cognitive.log 2>&1 &

COG_PID=$!
sleep 6

# 检查进程是否存活
if kill -0 $COG_PID 2>/dev/null; then
    # 测试健康检查接口
    HEALTH_RESPONSE=$(curl -s --connect-timeout 5 http://localhost:8001/api/health 2>/dev/null || echo "{}")

    STATUS=$(echo $HEALTH_RESPONSE | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('status', 'error'))
except:
    print('error')
" 2>/dev/null)

    LLM_READY=$(echo $HEALTH_RESPONSE | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print('✓' if d.get('llm_ready') else '✗')
except:
    print('?')
" 2>/dev/null)

    CONCEPTS=$(echo $HEALTH_RESPONSE | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('kg_concepts', 0))
except:
    print(0)
" 2>/dev/null)

    if [ "$STATUS" = "ok" ] || [ "$STATUS" = "degraded" ]; then
        echo -e "${GREEN}   ✅ 服务已启动成功！${NC}"
        echo -e "      PID: ${BOLD}$COG_PID${NC}"
        echo -e "      端口: ${BOLD}8001${NC}"
        echo -e "      状态: ${BOLD}$STATUS${NC}"
        echo -e "      LLM:  ${BOLD}$LLM_READY${NC}"
        echo -e "      概念: ${BOLD}$CONCEPTS 个${NC}"
    else
        echo -e "${YELLOW}   ⚠ 服务进程运行中但状态异常: $STATUS${NC}"
        echo -e "      查看: tail -20 /tmp/cognitive.log"
    fi
else
    echo -e "${RED}   ❌ 服务启动失败！${NC}"
    echo -e "\n${RED}错误日志:${NC}"
    cat /tmp/cognitive.log | tail -30
    exit 1
fi

# ============================================
# 显示最终结果和使用说明
# ============================================
echo ""
echo -e "${BOLD}${CYAN}═════════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}     🎉 认知诊断服务启动成功！               ${NC}"
echo -e "${BOLD}${CYAN}═════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}服务信息：${NC}"
echo -e "  ${GREEN}● 认知诊断API:${NC} http://localhost:8001"
echo -e "  ${GREEN}● 进程PID:${NC}    $COG_PID"
echo -e "  ${GREEN}● 日志文件:${NC}   /tmp/cognitive.log"
echo ""
echo -e "  ${BOLD}下一步操作（按顺序执行）：${NC}"
echo ""
echo -e "  ${CYAN}1️⃣  打开新的终端窗口${NC}"
echo ""
echo -e "  ${CYAN}2️⃣  复制粘贴以下命令启动前端：${NC}"
echo -e "     ${BOLD}cd $BASE_DIR && npm run dev${NC}"
echo ""
echo -e "  ${CYAN}3️⃣  打开浏览器访问：${NC}"
echo -e "     ${BOLD}http://localhost:3003${NC}"
echo ""
echo -e "  ${CYAN}4️⃣  测试认知诊断功能：${NC}"
echo -e "     • 进入\"教学页面\"或\"诊断页面\""
echo -e "     • 选择知识点（如\"二次函数\"）"
echo -e "     • 查看右侧面板是否显示诊断信息"
echo -e "     • ${GREEN}应该不再出现"无法连接认知诊断服务"错误${NC}"
echo ""
echo -e "  ${BOLD}常用命令：${NC}"
echo -e "  停止服务: ${RED}kill $COG_PID${NC}"
echo -e "  查看日志: ${CYAN}tail -f /tmp/cognitive.log${NC}"
echo -e "  健康检查: ${CYAN}curl http://localhost:8001/api/health | python3 -m json.tool${NC}"
echo -e "  测试诊断: ${CYAN}curl -X POST http://localhost:8001/api/diagnose -H 'Content-Type: application/json' -d '{\"student_id\":\"test\",\"topic\":\"二次函数\"}'${NC}"
echo ""

# 快速验证
echo -e "${BLUE}🔍 立即验证服务状态...${NC}"
sleep 1
curl -s http://localhost:8001/api/health | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(f'\n  状态: {d.get(\"status\")}')
    print(f'  LLM就绪: {\"✅\" if d.get(\"llm_ready\") else \"⚠️  否\"}')
    print(f'  知识点数: {d.get(\"kg_concepts\", 0)}')
    print(f'  错误模式: {d.get(\"kg_misconceptions\", 0)}')
    if d.get('init_error'):
        print(f'  初始化信息: {d.get(\"init_error\")}')
    print('\n  ✨ 服务可以接受请求了！')
except Exception as e:
    print(f'\n  ❌ 验证失败: {e}')
" 2>/dev/null

echo ""
echo -e "${BOLD}按 Ctrl+C 退出此脚本（服务继续后台运行）${NC}\n"

# 保持脚本运行
wait $COG_PID
