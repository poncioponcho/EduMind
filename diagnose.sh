#!/bin/bash
# EduMind 快速诊断工具
# 用于自动检测和解决"无法连接认知诊断服务"等问题

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV_DIR="$PROJECT_ROOT/edumind-mcp/.venv"
ENV_FILE="$PROJECT_ROOT/edumind-mcp/.env"

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

pass() {
    echo -e "${GREEN}✅ $1${NC}"
    ((PASS_COUNT++))
}

fail() {
    echo -e "${RED}❌ $1${NC}"
    ((FAIL_COUNT++))
}

warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((WARN_COUNT++))
}

info() {
    echo -e "${CYAN}ℹ️  $1${NC}"
}

section() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

echo ""
echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   EduMind 环境诊断工具 v1.0           ║${NC}"
echo -e "${CYAN}║   自动检测并修复常见启动问题           ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
echo ""

section "1. 基础环境检查"

# 检查 Python
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}' | cut -d. -f1-2)
    PY_MAJOR=$(echo $PYTHON_VERSION | cut -d. -f1)
    PY_MINOR=$(echo $PYTHON_VERSION | cut -d. -f2)

    if [[ "$PY_MAJOR" -eq 3 && "$PY_MINOR" -ge 10 ]]; then
        pass "Python 版本: $(python3 --version)"
        if [[ "$PY_MINOR" -gt 12 ]]; then
            warn "Python $PYTHON_VERSION 较新，建议使用 3.10-3.12 以获得最佳兼容性"
        fi
    else
        fail "Python 版本过低: $(python3 --version) (需要 3.10+)"
        info "推荐安装: brew install python@3.11"
    fi
else
    fail "Python 未安装"
fi

# 检查 Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version | cut -dv -f2 | cut -d. -f1)
    if [[ "$NODE_VERSION" == "18" || "$NODE_VERSION" == "19" || "$NODE_VERSION" == "20" ]]; then
        pass "Node.js 版本: $(node --version)"
    else
        warn "Node.js 版本较旧: $(node --version) (推荐 18+)"
    fi
else
    fail "Node.js 未安装"
fi

# 检查 npm
if command -v npm &> /dev/null; then
    pass "npm 版本: $(npm --version)"
else
    fail "npm 未安装"
fi

# 检查 Git
if command -v git &> /dev/null; then
    pass "Git 版本: $(git --version)"
else
    fail "Git 未安装"
fi

section "2. 项目结构检查"

# 检查关键目录
for dir in "$PROJECT_ROOT/src" "$PROJECT_ROOT/edumind-cognitive" "$PROJECT_ROOT/edumind-mcp"; do
    if [ -d "$dir" ]; then
        pass "目录存在: $(basename $dir)/"
    else
        fail "目录缺失: $(basename $dir)/"
    fi
done

# 检查关键文件
KEY_FILES=(
    "package.json"
    "start.sh"
    "edumind-cognitive/api/server.py"
    "edumind-cognitive/langgraph/graph.py"
    "edumind-cognitive/kg/neo4j_client.py"
    "edumind-mcp/api/server.py"
    "edumind-mcp/agent/llm_provider.py"
    "src/components/CognitivePanel.tsx"
)

for file in "${KEY_FILES[@]}"; do
    if [ -f "$PROJECT_ROOT/$file" ]; then
        pass "文件存在: $file"
    else
        fail "文件缺失: $file"
    fi
done

section "3. Python 虚拟环境检查"

if [ -d "$VENV_DIR" ]; then
    pass "虚拟环境已创建: .venv/"

    # 激活虚拟环境
    source "$VENV_DIR/bin/activate"

    # 检查 Python 路径
    VENV_PYTHON=$(which python)
    info "虚拟环境Python: $VENV_PYTHON"

    # 检查核心依赖
    DEPS=("fastapi" "uvicorn" "langgraph" "langchain" "pydantic")
    for dep in "${DEPS[@]}"; do
        if python -c "import ${dep}" 2>/dev/null; then
            VERSION=$(python -c "import ${dep}; print(${dep}.__version__)" 2>/dev/null || echo "unknown")
            pass "依赖已安装: ${dep} (${VERSION})"
        else
            fail "依赖未安装: ${dep}"
            info "运行: pip install ${dep}"
        fi
    done

    # 检查 LLM 提供商依赖
    LLM_DEPS=("langchain_google_genai" "langchain_openai")
    for dep in "${LLM_DEPS[@]}"; do
        if python -c "import ${dep}" 2>/dev/null; then
            pass "LLM依赖可选: ${dep} ✓"
        else
            warn "LLM依赖可选: ${dep} (根据使用的API Key决定是否需要)"
        fi
    done

    deactivate
else
    fail "虚拟环境不存在: .venv/"
    info "创建命令: cd edumind-mcp && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
fi

section "4. API Key 配置检查"

if [ -f "$ENV_FILE" ]; then
    pass ".env 文件已配置"

    # 检查各个 API Key
    HAS_KEY=false

    if grep -q "GOOGLE_API_KEY=" "$ENV_FILE" && ! grep -q "GOOGLE_API_KEY=$" "$ENV_FILE"; then
        KEY_PREVIEW=$(grep "GOOGLE_API_KEY=" "$ENV_FILE" | head -1 | cut -d'=' -f2 | cut -c1-6)"***"
        pass "Google Gemini API Key: $KEY_PREVIEW"
        HAS_KEY=true
    fi

    if grep -q "DASHSCOPE_API_KEY=" "$ENV_FILE" && ! grep -q "DASHSCOPE_API_KEY=$" "$ENV_FILE"; then
        KEY_PREVIEW=$(grep "DASHSCOPE_API_KEY=" "$ENV_FILE" | head -1 | cut -d'=' -f2 | cut -c1-6)"***"
        pass "阿里云百炼 API Key: $KEY_PREVIEW"
        HAS_KEY=true
    fi

    if grep -q "MOONSHOT_API_KEY=" "$ENV_FILE" && ! grep -q "MOONSHOT_API_KEY=$" "$ENV_FILE"; then
        KEY_PREVIEW=$(grep "MOONSHOT_API_KEY=" "$ENV_FILE" | head -1 | cut -d'=' -f2 | cut -c1-6)"***"
        pass "Kimi Code API Key: $KEY_PREVIEW"
        HAS_KEY=true
    fi

    if grep -q "OPENAI_API_KEY=" "$ENV_FILE" && ! grep -q "OPENAI_API_KEY=$" "$ENV_FILE"; then
        KEY_PREVIEW=$(grep "OPENAI_API_KEY=" "$ENV_FILE" | head -1 | cut -d'=' -f2 | cut -c1-6)"***"
        pass "OpenAI API Key: $KEY_PREVIEW"
        HAS_KEY=true
    fi

    if [ "$HAS_KEY" = false ]; then
        fail "未配置任何 API Key（至少需要一个）"
        info "请编辑 edumind-mcp/.env 文件，添加至少一个 API Key"
    fi
else
    fail ".env 文件不存在"
    info "创建命令: cp edumind-mcp/.env.example edumind-mcp/.env"
    info "然后编辑文件添加 API Key"
fi

section "5. 前端依赖检查"

if [ -f "$PROJECT_ROOT/package.json" ]; then
    if [ -d "$PROJECT_ROOT/node_modules" ]; then
        pass "前端依赖已安装 (node_modules/)"

        # 检查关键包
        if [ -d "$PROJECT_ROOT/node_modules/react" ]; then
            REACT_VERSION=$(cat "$PROJECT_ROOT/node_modules/react/package.json" | grep version | head -1 | cut -d'"' -f4)
            pass "React 已安装: v$REACT_VERSION"
        fi

        if [ -d "$PROJECT_ROOT/node_modules/vite" ]; then
            VITE_VERSION=$(cat "$PROJECT_ROOT/node_modules/vite/package.json" | grep version | head -1 | cut -d'"' -f4)
            pass "Vite 已安装: v$VITE_VERSION"
        fi
    else
        fail "前端依赖未安装"
        info "运行: npm install"
    fi
fi

section "6. 端口占用检查"

MCP_PORT=${MCP_PORT:-8000}
COGNITIVE_PORT=${COGNITIVE_PORT:-8001}
FRONTEND_PORT=3003

PORTS=("$MCP_PORT" "$COGNITIVE_PORT")

for port in "${PORTS[@]}"; do
    if lsof -i :$port -t >/dev/null 2>&1; then
        PROCESS=$(lsof -i :$port -t | head -1)
        CMD_LINE=$(ps -p $PROCESS -o command= 2>/dev/null | head -c 50)
        warn "端口 $port 已被占用 (PID: $PROCESS, $CMD_LINE...)"
        info "释放端口: kill -9 $PROCESS"
    else
        pass "端口 $port 可用"
    fi
done

section "7. 服务连通性测试"

# 测试 MCP 服务
MCP_HEALTH=$(curl -s --connect-timeout 2 http://localhost:$MCP_PORT/api/health 2>/dev/null || echo "{}")
if echo "$MCP_HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('status') in ['ok','degraded'] else 1)" 2>/dev/null; then
    MCP_STATUS=$(echo "$MCP_HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null)
    pass "MCP 服务可达 (状态: $MCP_STATUS) - http://localhost:$MCP_PORT"
else
    fail "MCP 服务不可达 - http://localhost:$MCP_PORT"
    info "服务可能未启动或端口不正确"
fi

# 测试认知诊断服务
COG_HEALTH=$(curl -s --connect-timeout 2 http://localhost:$COGNITIVE_PORT/api/health 2>/dev/null || echo "{}")
if echo "$COG_HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('status') in ['ok','degraded'] else 1)" 2>/dev/null; then
    COG_STATUS=$(echo "$COG_HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null)
    COG_LLM=$(echo "$COG_HEALTH" | python3 -c "import sys,json; print('就绪' if json.load(sys.stdin).get('llm_ready') else '未就绪')" 2>/dev/null)

    if [ "$COG_STATUS" = "ok" ]; then
        pass "认知诊断服务正常 (状态: $COG_STATUS, LLM: $COG_LLM) - http://localhost:$COGNITIVE_PORT"
    else
        warn "认知诊断服务降级运行 (状态: $COG_STATUS, LLM: $COG_LLM) - http://localhost:$COGNITIVE_PORT"

        # 显示详细错误信息
        INIT_ERROR=$(echo "$COG_HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('init_error','无'))" 2>/dev/null)
        if [ "$INIT_ERROR" != "无" ] && [ -n "$INIT_ERROR" ]; then
            fail "初始化错误: $INIT_ERROR"
        fi
    fi
else
    fail "认知诊断服务不可达 - http://localhost:$COGNITIVE_PORT"
    info "这是导致\"无法连接认知诊断服务\"错误的直接原因！"
    info "解决方案：参考 STARTUP_GUIDE.md 的启动步骤"
fi

section "8. 功能接口测试"

# 测试诊断接口
DIAG_RESPONSE=$(curl -s --connect-timeout 5 -X POST http://localhost:$COGNITIVE_PORT/api/diagnose \
  -H "Content-Type: application/json" \
  -d '{"student_id":"diag_test","topic":"一次函数"}' 2>/dev/null || echo "{}")

if echo "$DIAG_RESPONSE" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    if 'topic' in d and 'current_mastery' in d:
        print('OK')
    else:
        print('FAIL')
except:
    print('FAIL')
" 2>/dev/null | grep -q "OK"; then
    pass "诊断接口测试通过 (/api/diagnose)"
else
    warn "诊断接口无响应或异常（服务可能降级运行）"
fi

# 显示统计信息
echo ""
echo -e "${BLUE}═════════════════════════════════════════════${NC}"
echo -e "${CYAN}                    诊断结果汇总                 ${NC}"
echo -e "${BLUE}═════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}✅ 通过: $PASS_COUNT 项${NC}"
echo -e "  ${YELLOW}⚠️  警告: $WARN_COUNT 项${NC}"
echo -e "  ${RED}❌ 失败: $FAIL_COUNT 项${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}🎉 所有检查通过！项目应该可以正常运行。${NC}"
    echo ""
    echo -e "下一步操作:${CYAN}"
    echo "  1. 启动所有服务: ./start.sh"
    echo "  2. 启动前端: npm run dev"
    echo "  3. 打开浏览器: http://localhost:3003"
    echo -e "${NC}"
elif [ $FAIL_COUNT -le 3 ] && [ "$(echo "$COG_HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)" = "ok" ]; then
    echo -e "${YELLOW}⚠️  有少量失败项，但认知诊断服务已经可以连接。${NC}"
    echo -e "${CYAN}建议先尝试启动服务，查看是否能正常运行。${NC}"
else
    echo -e "${RED}🔴 发现 $FAIL_COUNT 个问题需要修复！${NC}"
    echo ""
    echo -e "${CYAN}最可能的失败原因（按优先级排序）：${NC}"
    echo ""

    if [ ! -f "$ENV_FILE" ] || ! grep -qE "(GOOGLE_API_KEY|DASHSCOPE_API_KEY|MOONSHOT_API_KEY|OPENAI_API_KEY)=" "$ENV_FILE" 2>/dev/null; then
        echo -e "${RED}1. [高优先级] API Key 未配置${NC}"
        echo -e "   解决方案:"
        echo -e "   ${CYAN}   cp edumind-mcp/.env.example edumind-mcp/.env${NC}"
        echo -e "   ${CYAN}   nano edumind-mcp/.env  # 添加你的API Key${NC}"
        echo ""
    fi

    if [ ! -d "$VENV_DIR" ]; then
        echo -e "${RED}2. [高优先级] Python 虚拟环境未创建${NC}"
        echo -e "   解决方案:"
        echo -e "   ${CYAN}   cd edumind-mcp && python3 -m venv .venv${NC}"
        echo -e "   ${CYAN}   source .venv/bin/activate${NC}"
        echo -e "   ${CYAN}   pip install -r requirements.txt${NC}"
        echo ""
    fi

    if ! curl -s --connect-timeout 2 http://localhost:$COGNITIVE_PORT/api/health > /dev/null 2>&1; then
        echo -e "${RED}3. [高优先级] 认知诊断服务未运行${NC}"
        echo -e "   这就是\"无法连接认知诊断服务\"错误的原因！"
        echo -e "   解决方案:"
        echo -e "   ${CYAN}   ./start.sh  # 一键启动所有后端服务${NC}"
        echo -e "   ${CYAN}   或手动启动:${NC}"
        echo -e "   ${CYAN}     source edumind-mcp/.venv/bin/activate${NC}"
        echo -e "   ${CYAN}     python edumind-cognitive/api/server.py${NC}"
        echo ""
    fi

    echo -e "${CYAN}完整排查指南请查看: STARTUP_GUIDE.md${NC}"
fi

echo ""
echo -e "${BLUE}═════════════════════════════════════════════${NC}"
echo ""

exit $FAIL_COUNT
