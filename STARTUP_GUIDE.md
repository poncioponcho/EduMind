# EduMind 项目完整启动指南

## 📋 目录
1. [环境配置要求](#环境配置要求)
2. [项目结构说明](#项目结构说明)
3. [详细启动步骤](#详细启动步骤)
4. [认知诊断服务配置](#认知诊断服务配置)
5. [常见问题排查](#常见问题排查)
6. [服务验证检查](#服务验证检查)

---

## 环境配置要求

### 1. 操作系统要求
- **推荐**: macOS 12+ / Ubuntu 20.04+ / Windows 10+
- **开发工具**: 终端 (Terminal/iTerm2/PowerShell)

### 2. 必需软件及版本

#### Node.js (前端)
```bash
# 检查版本（需要 18.x 或更高）
node --version  # 应显示 v18.x 或 v20.x
npm --version   # 应显示 9.x 或更高

# 如果未安装，推荐使用 nvm 安装：
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

#### Python (后端)
```bash
# 检查版本（需要 3.10-3.12，推荐 3.11）
python3 --version  # 应显示 Python 3.11.x

# 如果未安装（macOS）：
brew install python@3.11

# 如果未安装（Ubuntu）：
sudo apt update
sudo apt install python3.11 python3.11-venv python3-pip
```

#### Git
```bash
git --version  # 应显示 2.x
```

### 3. 环境变量配置

创建 API 密钥配置文件：

**文件位置**: `edumind-mcp/.env`

```bash
# 进入项目目录
cd /Users/seyonmacbook/Desktop/电子书/26春招/EduMind/EduMind

# 创建 .env 文件（如果不存在）
touch edumind-mcp/.env
```

**编辑 `.env` 文件**，选择以下任一 LLM 提供商的密钥：

```env
# ===== 选择 1: Google Gemini（推荐）=====
GOOGLE_API_KEY=你的Gemini_API_Key

# ===== 选择 2: 阿里云百炼 =====
DASHSCOPE_API_KEY=你的百炼_API_Key

# ===== 选择 3: Kimi Code =====
MOONSHOT_API_KEY=你的Kimi_API_Key

# ===== 选择 4: OpenAI =====
OPENAI_API_KEY=你的OpenAI_API_Key

# ===== 可选：Neo4j 配置（高级功能）=====
# NEO4J_URI=bolt://localhost:7687
# NEO4J_USER=neo4j
# NEO4J_PASSWORD=your_password

# ===== 可选：端口配置 =====
MCP_PORT=8000
COGNITIVE_PORT=8001
```

**获取 API Key 的方式**:
- **Google Gemini**: https://aistudio.google.com/app/apikey （免费额度充足）
- **阿里云百炼**: https://bailian.console.aliyun.com/ （新用户有免费额度）
- **Kimi Code**: https://platform.moonshot.cn/ （新用户有免费额度）
- **OpenAI**: https://platform.openai.com/api-keys （需付费）

---

## 项目结构说明

```
EduMind/
├── src/                    # React 前端源码
│   ├── components/         # UI组件
│   │   ├── CognitivePanel.tsx    # 认知诊断面板 ⭐
│   │   └── MathContent.tsx       # 数学公式渲染
│   ├── pages/              # 页面组件
│   │   └── TeachingPage.tsx      # 教学页面
│   ├── services/           # 服务层
│   │   ├── mcpBridge.ts          # MCP服务桥接
│   │   └── agentService.ts       # Agent服务
│   └── App.tsx             # 主应用
├── edumind-cognitive/      # 认知诊断系统 ⭐⭐⭐
│   ├── api/server.py       # 认知诊断API服务（端口8001）
│   ├── agents/             # 三大Agent实现
│   │   ├── diagnoser.py    # 诊断Agent
│   │   ├── planner.py      # 规划Agent
│   │   ├── tutor.py        # 教学Agent
│   │   └── hil.py          # 人工审核节点
│   ├── kg/                 # 知识图谱
│   │   └── neo4j_client.py # Neo4j客户端
│   ├── langgraph/          # LangGraph工作流
│   │   └── graph.py        # 图定义
│   └── requirements.txt    # Python依赖
├── edumind-mcp/            # MCP超级教师系统
│   ├── api/server.py       # MCP API服务（端口8000）
│   ├── agent/              # Agent核心
│   │   └── llm_provider.py # 多LLM适配器
│   ├── mcp_servers/        # MCP工具服务器
│   │   ├── math_server.py  # 数学计算
│   │   ├── code_server.py  # 代码执行
│   │   ├── viz_server.py   # 可视化
│   │   └── paper_server.py # 论文检索
│   └── requirements.txt    # Python依赖
├── backend/go/             # Go后端（可选）
│   └── main.go            # Go后端服务
├── package.json            # 前端依赖配置
├── start.sh                # 一键启动脚本 ⭐
└── docker-compose.yml      # Docker部署配置
```

---

## 详细启动步骤

### 方法一：使用一键启动脚本（推荐新手）

#### 步骤 0: 克隆项目（如果还没有）
```bash
cd ~/Desktop/电子书/26春招/EduMind
# 如果是从GitHub克隆：
git clone https://github.com/poncioponcho/EduMind.git
cd EduMind
```

#### 步骤 1: 配置 API 密钥
```bash
# 复制示例文件
cp edumind-mcp/.env.example edumind-mcp/.env

# 编辑 .env 文件，填入你的API Key
nano edumind-mcp/.env  # 或使用其他编辑器
```

#### 步骤 2: 初始化 Python 虚拟环境
```bash
cd /Users/seyonmacbook/Desktop/电子书/26春招/EduMind/EduMind

# 为MCP服务创建虚拟环境
cd edumind-mcp
python3 -m venv .venv
source .venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 验证关键包是否安装成功
python -c "import fastapi; import langgraph; import langchain; print('✅ Python依赖安装成功')"

deactivate
```

#### 步骤 3: 初始化前端依赖
```bash
cd /Users/seyonmacbook/Desktop/电子书/26春招/EduMind/EduMind

# 安装Node.js依赖
npm install

# 验证安装
npx vite --version  # 应显示 Vite 7.x
```

#### 步骤 4: 使用一键脚本启动所有服务
```bash
cd /Users/seyonmacbook/Desktop/电子书/26春招/EduMind/EduMind

# 赋予执行权限
chmod +x start.sh

# 运行启动脚本
./start.sh
```

**脚本会自动完成**:
- ✅ 检查并释放占用的端口
- ✅ 启动 MCP Super Teacher 服务（端口 8000）
- ✅ 启动认知诊断服务（端口 8001）
- ✅ 验证服务健康状态
- ✅ 显示访问地址和服务状态

#### 步骤 5: 启动前端开发服务器
**打开新的终端窗口**，运行：
```bash
cd /Users/seyonmacbook/Desktop/电子书/26春招/EduMind/EduMind

# 启动前端开发服务器
npm run dev
```

前端将运行在 `http://localhost:3003`

---

### 方法二：手动分步启动（推荐开发者）

#### 步骤 1: 启动 MCP Super Teacher 服务
```bash
# 终端窗口 1
cd /Users/seyonmacbook/Desktop/电子书/26春招/EduMind/EduMind/edumind-mcp
source .venv/bin/activate
python api/server.py

# 预期输出：
# ==================================================
# EduMind MCP Super Teacher 启动中...
# --------------------------------------------------
#   支持的LLM提供商: gemini, qwen, kimi, openai
# --------------------------------------------------
#   ✅ LLM已就绪: auto-detect
#   🔑 使用Key: GOOGLE_API_KEY=AIzaSy***
# INFO:     Started server process [xxxxx]
# INFO:     Uvicorn running on http://0.0.0.0:8000
```

#### 步骤 2: 启动认知诊断服务
```bash
# 终端窗口 2
cd /Users/seyonmacbook/Desktop/电子书/26春招/EduMind/EduMind
source edumind-mcp/.venv/bin/activate  # 使用同一个虚拟环境
python edumind-cognitive/api/server.py

# 预期输出：
# ==================================================
# EduMind 认知诊断多Agent系统 启动中...
# --------------------------------------------------
#   ✅ LLM已就绪
#   🔑 使用Key: GOOGLE_API_KEY=AIzaSy***
#   🧠 LangGraph认知图已构建
#   📊 知识图谱: 15个概念, 8个错误模式
#   🔗 Neo4j: 内存模式
# INFO:     Started server process [xxxxx]
# INFO:     Uvicorn running on http://0.0.0.0:8001
```

#### 步骤 3: 启动前端开发服务器
```bash
# 终端窗口 3
cd /Users/seyonmacbook/Desktop/电子书/26春招/EduMind/EduMind
npm run dev

# 预期输出：
# VITE v7.2.4  ready in xxx ms
# ➜  Local:   http://localhost:3003/
# ➜  Network: http://192.168.x.x:3003/
```

---

## 认知诊断服务配置

### 核心架构
认知诊断系统采用 **三Agent协作架构**:

```
学生提问 → [Diagnoser诊断] → [Planner规划] → [Tutor教学] → 回答
              ↑                                    │
              └──────────── 重新诊断 ←─────────────┘
```

### 关键配置参数

#### 1. 端口配置
```bash
# 默认端口
COGNITIVE_PORT=8001  # 认知诊断服务

# 修改端口（在 .env 文件或环境变量中设置）
export COGNITIVE_PORT=8001
```

#### 2. LLM 提供商选择
认知诊断服务自动检测可用的 LLM 提供商，优先级：
1. **Google Gemini** (GOOGLE_API_KEY) - 推荐，响应快
2. **阿里云百炼** (DASHSCOPE_API_KEY) - 中文优化好
3. **Kimi Code** (MOONSHOT_API_KEY) - 长文本能力强
4. **OpenAI** (OPENAI_API_KEY) - 通用性强

#### 3. Neo4j 知识图谱（可选）
默认使用内存知识图谱，如需使用 Neo4j：

```bash
# 安装 Neo4j（使用 Docker）
docker run \
  --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password \
  -d neo4j:5-community

# 在 .env 中配置
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
```

#### 4. 性能调优参数
在 `edumind-cognitive/api/server.py` 中可以调整：

```python
# 超时时间（秒）
timeout=60.0  # 第213行

# 最大迭代次数
iteration > 5  # 第56行（graph.py）

# 掌握度阈值
mastery < 0.7  # neo4j_client.py 第78行
```

---

## 常见问题排查

### ❌ 问题 1: "无法连接认知诊断服务"

**症状**: 前端显示 "无法连接认知诊断服务"

**原因分析**:
1. 认知诊断服务未启动
2. 端口被占用或不匹配
3. CORS 跨域配置问题
4. Python 依赖未安装

**解决方案**:

```bash
# 1. 检查服务是否运行
lsof -i :8001
# 如果没有输出，说明服务未启动

# 2. 手动启动服务
cd /Users/seyonmacbook/Desktop/电子书/26春招/EduMind/EduMind
source edumind-mcp/.venv/bin/activate
python edumind-cognitive/api/server.py

# 3. 检查健康状态
curl http://localhost:8001/api/health
# 预期返回: {"status":"ok","service":"edumind-cognitive",...}

# 4. 检查端口是否被占用
lsof -i :8001 | grep LISTEN
# 如果被占用，杀掉进程：
kill -9 $(lsof -t -i :8001)
```

**前端配置检查**:
查看 [CognitivePanel.tsx:4](src/components/CognitivePanel.tsx#L4):
```typescript
const COGNITIVE_API = import.meta.env.VITE_COGNITIVE_API_URL || 'http://localhost:8001';
```
确保前端请求地址与实际服务端口一致。

---

### ❌ 问题 2: "服务尚未就绪" 或 "降级运行"

**症状**: 认知诊断返回错误信息，提示服务降级

**原因分析**:
1. API Key 未配置或无效
2. LLM 依赖未正确安装
3. LangGraph 图构建失败

**解决方案**:

```bash
# 1. 检查 API Key 是否配置
cat edumind-mcp/.env | grep API_KEY

# 2. 测试 LLM 连接
cd /Users/seyonmacbook/Desktop/电子书/26春招/EduMind/EduMind/edumind-mcp
source .venv/bin/activate
python -c "
from agent.llm_provider import get_llm
llm = get_llm()
print('✅ LLM连接成功')
"

# 3. 检查完整错误信息
curl http://localhost:8001/api/health | python3 -m json.tool
# 查看 init_error 字段
```

**修复 API Key 问题**:
```bash
# 编辑 .env 文件
nano edumind-mcp/.env

# 确保 API Key 格式正确（无空格、无引号）
GOOGLE_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxx

# 重启服务
# 先 Ctrl+C 停止当前服务
python edumind-cognitive/api/server.py
```

---

### ❌ 问题 3: "ModuleNotFoundError: No module named 'xxx'"

**症状**: 启动时报错缺少模块

**常见缺失模块**:
- `langgraph`
- `langchain_google_genai`
- `fastapi`
- `pydantic`
- `dotenv`

**解决方案**:

```bash
# 1. 确保虚拟环境已激活
cd /Users/seyonmacbook/Desktop/电子书/26春招/EduMind/EduMind/edumind-mcp
source .venv/bin/activate

# 2. 升级 pip
pip install --upgrade pip

# 3. 重新安装依赖
pip install -r requirements.txt

# 4. 如果仍然报错，手动安装缺失的包
pip install langgraph langchain fastapi pydantic python-dotenv

# 5. 验证安装
python -c "
import langgraph
import langchain
import fastapi
import pydantic
print('✅ 所有关键依赖已安装')
"
```

---

### ❌ 问题 4: 端口冲突 (Address already in use)

**症状**: 启动时报错 `[Errno 48] Address already in use`

**解决方案**:

```bash
# 1. 查看占用端口的进程
lsof -i :8000  # MCP服务端口
lsof -i :8001  # 认知诊断端口

# 2. 杀掉占用进程
kill -9 $(lsof -t -i :8000)
kill -9 $(lsof -t -i :8001)

# 3. 或者修改端口
export MCP_PORT=8002
export COGNITIVE_PORT=8003

# 4. 重启服务
./start.sh
```

**或者修改默认端口**（编辑 `start.sh` 第32-33行）:
```bash
MCP_PORT=${MCP_PORT:-8000}
COGNITIVE_PORT=${COGNITIVE_PORT:-8001}
```

---

### ❌ 问题 5: CORS 跨域错误

**症状**: 浏览器控制台报错 "Access-Control-Allow-Origin"

**原因**: 前端端口未在后端的 CORS 允许列表中

**解决方案**:

检查 [server.py:117-124](edumind-cognitive/api/server.py#L117-L124) 的 CORS 配置：
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",  # 前端默认端口
        "http://localhost:5173",  # Vite默认端口
        "http://localhost:80",
    ],
    ...
)
```

如果前端运行在其他端口，添加到列表中。

---

### ❌ 问题 6: 认知诊断响应慢或超时

**症状**: 请求超过60秒返回超时

**原因分析**:
1. LLM API 响应慢
2. 网络延迟
3. Neo4j 查询慢

**解决方案**:

**短期方案 - 增加超时时间**:
编辑 [server.py:211-214](edumind-cognitive/api/server.py#L211-L214):
```python
result = await asyncio.wait_for(
    _cached_graph.ainvoke(state, config),
    timeout=120.0,  # 从60改为120秒
)
```

**长期方案 - 优化性能**:
1. 使用更快的 LLM（推荐 Gemini Flash）
2. 启用 Neo4j 缓存
3. 减少每次诊断的知识点数量

---

### ❌ 问题 7: Python 版本不兼容

**症状**: 导入报错 SyntaxError 或 AttributeError

**检查当前版本**:
```bash
python3 --version
# 需要 Python 3.10 - 3.12
```

**解决方案**:

```bash
# macOS - 使用 Homebrew 安装指定版本
brew install python@3.11

# 创建新的虚拟环境
cd /Users/seyonmacbook/Desktop/电子书/26春招/EduMind/EduMind/edumind-mcp
rm -rf .venv
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

---

## 服务验证检查

### 1. 健康检查接口

#### MCP Super Teacher 服务
```bash
curl http://localhost:8000/api/health

# 预期成功响应:
{
  "status": "ok",
  "service": "edumind-mcp",
  "llm_ready": true,
  "provider": "gemini",
  "tools_registered": ["calculate", "solve_equation", ...]
}
```

#### 认知诊断服务
```bash
curl http://localhost:8001/api/health

# 预期成功响应:
{
  "status": "ok",  # 或 "degraded"（如果LLM未就绪）
  "service": "edumind-cognitive",
  "version": "1.0.0",
  "port": 8001,
  "llm_ready": true,
  "kg_concepts": 15,
  "kg_misconceptions": 8,
  "neo4j_connected": false,
  "graph_built": true
}
```

### 2. 功能测试

#### 测试认知诊断接口
```bash
curl -X POST http://localhost:8001/api/diagnose \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "test_student_001",
    "topic": "二次函数",
    "answer": "y = x^2 + 2x + 1"
  }'

# 预期响应:
{
  "topic": "二次函数",
  "student_id": "test_student_001",
  "current_mastery": 0.5,
  "misconceptions": [...],
  "prerequisites": ["一元二次方程"],
  "missing_prerequisites": []
}
```

#### 测试教学接口
```bash
curl -X POST http://localhost:8001/api/teach \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "test_student_001",
    "topic": "二次函数",
    "message": "请讲解一下二次函数的顶点式",
    "session_id": "test_session_001"
  }'

# 预期响应:
{
  "message": "好的！让我们来学习二次函数的顶点式...",
  "diagnosis": {...},
  "learning_plan": {...},
  "emotion": "explaining",
  "awaiting_human": false
}
```

### 3. 前端界面验证

打开浏览器访问: **http://localhost:3003**

#### 检查清单:
- [ ] 页面正常加载，无控制台错误
- [ ] 导航到"教学页面"或"诊断页面"
- [ ] 选择知识点（如"二次函数"）
- [ ] 认知诊断面板显示正常（不再出现"无法连接"错误）
- [ ] 显示掌握度进度条
- [ ] 显示常见错误模式（如有）
- [ ] 显示前置知识路径
- [ ] 发送教学消息后收到 AI 回复
- [ ] Avatar 表情和动作正常

### 4. 日志监控

#### 查看实时日志
```bash
# 终端 1 - MCP 服务日志
# 直接观察终端输出

# 终端 2 - 认知诊断服务日志
# 直接观察终端输出
```

#### 关键日志信息
```
✅ 成功标志:
- "LLM已就绪"
- "LangGraph认知图已构建"
- "Uvicorn running on http://0.0.0.0:8001"
- "INFO:     xxxxx POST /api/diagnose HTTP/1.1 200 OK"

❌ 错误标志:
- "API Key未配置"
- "依赖缺失"
- "初始化失败"
- "POST /api/teach HTTP/1.1 500 Internal Server Error"
```

### 5. 性能基准测试

```bash
# 测试响应时间
time curl -X POST http://localhost:8001/api/diagnose \
  -H "Content-Type: application/json" \
  -d '{"student_id":"test","topic":"一次函数"}'

# 正常响应时间:
- 诊断接口: < 3 秒
- 教学接口: < 30 秒（涉及LLM调用）
```

---

## 快速故障排除命令速查表

```bash
# ===== 查看所有服务状态 =====
echo "=== 端口占用 ==="
lsof -i :8000 -i :8001 -i :3003 | grep LISTEN || echo "无服务运行"

echo ""
echo "=== 健康检查 ==="
curl -s http://localhost:8000/api/health | python3 -m json.tool 2>/dev/null || echo "❌ MCP服务不可达"
curl -s http://localhost:8001/api/health | python3 -m json.tool 2>/dev/null || echo "❌ 认知诊断服务不可达"

# ===== 一键重启所有服务 =====
restart_all() {
  echo "停止所有服务..."
  kill -9 $(lsof -t -i :8000) 2>/dev/null || true
  kill -9 $(lsof -t -i :8001) 2>/dev/null || true
  sleep 2
  echo "重新启动..."
  cd /Users/seyonmacbook/Desktop/电子书/26春招/EduMind/EduMind
  ./start.sh
}

# ===== 查看详细错误日志 =====
show_logs() {
  echo "=== 最近20行Python错误 ==="
  cd /Users/seyonmacbook/Desktop/电子书/26春招/EduMind/EduMind
  tail -f nohup.out 2>/dev/null || echo "无日志文件"
}
```

---

## 下一步操作

### ✅ 启动成功后的使用流程

1. **打开浏览器** → 访问 http://localhost:3003
2. **进入教学页面** → 点击导航菜单中的"教学"或"诊断"
3. **选择知识点** → 从下拉菜单中选择要学习的数学概念
4. **查看诊断结果** → 右侧面板显示认知诊断信息
5. **开始交互学习** → 输入问题，接收个性化教学

### 📚 进阶配置选项

- **启用 Neo4j 知识图谱**: 参考[认知诊断服务配置](#认知诊断服务配置)第3节
- **Docker 部署**: 使用 `docker-compose.yml` 进行生产部署
- **自定义知识点**: 编辑 [neo4j_client.py](edumind-cognitive/kg/neo4j_client.py) 中的 `MATH_KNOWLEDGE_GRAPH` 字典
- **调整教学策略**: 修改 [tutor.py](edumind-cognitive/agents/tutor.py) 中的 `TUTOR_PROMPT`

---

## 技术支持

遇到无法解决的问题？

1. **查看日志**: 检查终端输出的详细错误信息
2. **运行健康检查**: `curl http://localhost:8001/api/health`
3. **检查依赖**: `pip list | grep -E "(langgraph|langchain|fastapi)"`
4. **重启服务**: 使用 `./start.sh` 或手动重启

---

## 版本信息

- **文档版本**: 1.0.0
- **更新日期**: 2026-05-11
- **适用项目**: EduMind 认知诊断多Agent导师网络
- **作者**: EduMind 开发团队

---

**🎉 现在你已经掌握了完整的项目启动流程！按照以上步骤操作，应该能够成功解决"无法连接认知诊断服务"的问题。**

如有疑问，请参考[常见问题排查](#常见问题排查)章节，或检查服务的健康状态输出。
