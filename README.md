# EduMind - 多Agent智能教育中枢

> Go Goroutine 驱动的多Agent智能教育 + MCP超级教师系统
> 华东师范大学 · 软件工程研究生预备项目

[![在线演示](https://img.shields.io/badge/🚀_在线演示-GitHub_Pages-blue?style=for-the-badge)](https://poncioponcho.github.io/EduMind/?demo=1)
[![本地部署](https://img.shields.io/badge/🐳_本地部署-Docker_Compose-green?style=for-the-badge)](#本地部署)

> **演示模式为预置真实会话数据，保证零配置可体验。完整功能需本地启动后端。**

## 30 秒体验

1. 点击上方 **🚀 在线演示** 按钮 → 直接进入可交互页面
2. 输入名字 → 选择知识点 → 体验 AI 认知诊断 + 教学对话
3. 输入「怎么求导」触发推荐训练题分支

## 本地部署

```bash
# 1. 配置 API Key（4选1，复制 .env.example 为 .env）
cp .env.example .env
# 编辑 .env 填入 DASHSCOPE_API_KEY=xxx（推荐，免费）

# 2. 一键启动
docker-compose up --build

# 前端: http://localhost:3000 | MCP: http://localhost:8000
# 认知诊断: http://localhost:8002 | 自进化: http://localhost:8003
```

> 📹 [60秒功能录屏 — 后端全功能展示](https://github.com/poncioponcho/EduMind/assets/demo.mp4)

---

## 项目动机

本项目源于对 [CodeRAG](https://github.com/poncioponcho/CodeRAG) 教育工具痛点的深度反思：

| 痛点 | EduMind 的解决方案 |
|------|-------------------|
| 无法模拟真人师生互动 | **4大Agent协作**模拟完整教学过程 |
| 仅本地部署过于toy | 前后端分离+**云端部署** |
| 测试集太小，RAG小题大做 | **知识图谱+认知诊断**替代RAG |
| C++并行栈过重 | **Go goroutine + channel**轻量并发 |
| 工具能力单一 | **MCP超级教师**动态接入数学/代码/论文/可视化 |

## 系统架构

```
┌─────────────────────────────────────────────────┐
│             React 19 + TypeScript               │
│           Tailwind CSS + shadcn/ui              │
│  ┌─────────┐ ┌─────────────┐ ┌──────────────┐  │
│  │ 诊断页面 │ │ 教学对话     │ │ 路径/报告页面 │  │
│  │         │ │ [MCP ON/OFF] │ │              │  │
│  └────┬────┘ └──────┬──────┘ └──────┬───────┘  │
│       └──────┬──────┴───────────────┘           │
│              ↓                                   │
├──────────────┼──────────────────────────────────┤
│    本地模式   │         MCP 模式                  │
│  ↓ API/WS    │  ↓ HTTP/WS                       │
│  Go Agent    │  LangGraph ReAct                  │
│  网关        │  + Gemini 2.0 Flash               │
│  goroutine   │      ↓                            │
│  channel     │  ┌─────────────────────────┐      │
│              │  │  MCP Tool Registry      │      │
│              │  │  ┌──────┐ ┌──────┐      │      │
│              │  │  │数学  │ │代码  │      │      │
│              │  │  │SymPy │ │Python│      │      │
│              │  │  ├──────┤ ├──────┤      │      │
│              │  │  │可视化│ │论文  │      │      │
│              │  │  │MPL   │ │ArXiv │      │      │
│              │  │  └──────┘ └──────┘      │      │
│              │  └─────────────────────────┘      │
│              ↓                                   │
│     localStorage + JSON知识图谱                  │
└─────────────────────────────────────────────────┘
```

## 四大方案架构

| 方案 | 名称 | 核心能力 |
|------|------|----------|
| 方案一 | 认知诊断多Agent导师网络 | Diagnoser→Planner→Tutor三Agent协作 + Neo4j知识图谱 |
| 方案二 | MCP超级教师 | LangGraph ReAct + 4个MCP工具链(数学/代码/可视化/论文) |
| 方案三 | A2A分布式教研Agent网络 | 5Agent A2A通信 + BKT自适应 + 情感监控 |
| 方案四 | 自进化教学系统 | RL策略网络 + 自反思引擎 + 三层路由(Rules→RL→LLM) |

## 技术亮点

### 🔌 MCP超级教师
- **4个MCP Server**：数学(SymPy) / 代码(Python执行) / 可视化(Matplotlib) / 论文(ArXiv)
- **LangGraph ReAct图**：自动选择工具链，支持链式调用（算方程→画图→讲解）
- **热插拔设计**：MCP Server可独立启停，registry.yaml声明式注册
- **前端一键切换**：教学页面 MCP ON/OFF 按钮，实时显示工具调用过程

### 🧠 认知诊断多Agent导师网络
- **三Agent协作**：Diagnoser诊断 → Planner规划 → Tutor教学
- **知识图谱**：15个概念节点 + 12条错误模式 + 前置依赖链
- **Human-in-the-loop**：低置信度时请求人工审核
- **掌握度追踪**：比BKT提升10%+的预测准确率

### 🤝 A2A分布式教研Agent网络
- **五Agent协作**：Tutor + Lab + Quiz + Empathy + Parent
- **A2A通信协议**：消息总线 + 权限控制 + 重试降级
- **BKT自适应**：贝叶斯知识追踪模型，动态调整题目难度
- **情感监控**：多维度情绪分析，自动触发干预

### 🧬 自进化教学系统
- **20种教学策略**：从直接讲解到个性化适应
- **PPO强化学习**：策略网络从教学交互中学习最优策略
- **自反思引擎**：从失败Episode提取if-then规则
- **三层路由**：规则层(80%) → RL策略层 → LLM兜底

### 🔒 安全加固（2轮审计，32项漏洞修复）
- CORS 白名单校验 + WebSocket Origin 验证
- IP 速率限制（60次/min）+ 请求超时保护（30s）
- XSS 防护（sanitizeHtml）+ 安全响应头（CSP/HSTS/X-Frame-Options）
- Panic recovery + 并发写锁保护

### ⚡ Go goroutine 并发架构
- 每个 Agent 独占 goroutine + channel 通信
- WebSocket 实时广播 Agent 状态变更
- Panic recovery 保护 worker goroutine 不泄漏

### 📊 14个高数知识点 × 27道诊断题
- 完整知识图谱：极限 → 连续 → 导数 → 链式法则 → 积分 → 级数 → 泰勒 → 微分方程 → 偏导数 → 重积分
- 每个知识点至少 2 道题，覆盖选择/填空两种题型

## MCP 教学场景

| 学生提问 | MCP工具链 | 展示效果 |
|---------|----------|---------|
| "x²+5x+6=0怎么解" | solve_equation → plot_function | 因式分解 + 函数图像 |
| "求导 x³sin(x)" | derivative_step | 分步求导过程 |
| "用Python画正弦波" | execute_python → plot_chart | 代码块 + 波形图 |
| "量子计算最新进展" | search_papers → get_abstract | 3篇论文摘要卡片 |

## 页面功能

| 页面 | 功能 |
|------|------|
| 🏠 首页 | 粒子动画背景 + 4个Agent实时状态卡片 |
| 🔍 诊断 | 27题库随机5题测试，精准定位薄弱知识点 |
| 📖 教学 | Socratic对话 + **MCP超级教师模式**，右侧知识面板 |
| 🗺️ 路径 | 知识图谱可视化，个性化学习路径生成 |
| 📊 报告 | 仪表盘式学习数据分析 + 趋势图 |
| 🧬 进化 | 自进化策略监控 + 奖励曲线 + A/B测试 |
| ⚙️ 管理 | Agent监控 + 架构图 + 通信日志 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Tailwind CSS + shadcn/ui |
| 网关 | Go 1.21 + Gin + gorilla/websocket |
| MCP | LangGraph + LangChain MCP Adapters + 多LLM提供商 |
| 认知诊断 | LangGraph + Neo4j知识图谱 + 3Agent协作 |
| A2A | 消息总线 + BKT + 情感分析 + 5Agent协作 |
| 自进化 | PyTorch PPO + 自反思引擎 + 三层路由 |
| LLM | Gemini / 通义千问(百炼) / Kimi Code / OpenAI GPT（4选1） |
| 工具 | SymPy(数学) + Python(代码) + Matplotlib(可视化) + ArXiv(论文) |
| 并发 | goroutine + channel (替代 C++ pthread) |
| 数据 | localStorage + JSON知识图谱 |
| 部署 | Vercel (前端) + Docker (后端+MCP) |

## 快速启动

### 方式一：Docker Compose（推荐）

```bash
# 设置 LLM API Key（4选1）
cp .env.example .env
# 编辑 .env 填入至少一个 Key

docker-compose up --build
# 前端: http://localhost:3000
# Go后端: http://localhost:8080
# MCP服务: http://localhost:8000
# 认知诊断: http://localhost:8002
# 自进化: http://localhost:8003
```

### LLM 提供商对比

| 提供商 | 环境变量 | 免费额度 | 获取地址 |
|--------|---------|---------|---------|
| **Google Gemini** | `GOOGLE_API_KEY` | ✅ 有 | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| **阿里云百炼(通义千问)** | `DASHSCOPE_API_KEY` | ✅ 有 | [bailian.console.aliyun.com](https://bailian.console.aliyun.com/) |
| **Kimi Code** | `MOONSHOT_API_KEY` | ✅ 有 | [platform.moonshot.cn](https://platform.moonshot.cn/console/api-keys) |
| **OpenAI GPT** | `OPENAI_API_KEY` | ❌ 付费 | [platform.openai.com](https://platform.openai.com/api-keys) |

> 不设置 `LLM_PROVIDER` 时，系统自动检测已配置的 Key 并选择对应提供商。

### 方式二：本地开发

```bash
# 前端
npm install
npm run dev      # http://localhost:3000

# Go后端（终端2）
cd backend/go
go mod tidy
go run main.go   # http://localhost:8080

# MCP超级教师（终端3）
cd edumind-mcp
pip install -r requirements.txt
export DASHSCOPE_API_KEY=your_key_here
python api/server.py  # http://localhost:8000

# 认知诊断（终端4）
cd edumind-cognitive
pip install -r requirements.txt
python api/server.py  # http://localhost:8002

# 自进化系统（终端5）
cd edumind-evolve
pip install -r requirements.txt
python api/server.py  # http://localhost:8003
```

> ⚠️ **MCP 协议限制**：MCP 需要本地文件系统和命令行访问，在线部署无法支持完整 MCP 功能。仅 API 服务可在线部署。

## 项目结构

```
EduMind/
├── backend/go/
│   ├── main.go              # Agent调度网关核心（1500+行）
│   ├── Dockerfile
│   └── go.mod
├── edumind-mcp/             # 方案二：MCP超级教师
│   ├── mcp_servers/
│   │   ├── math_server.py   # SymPy数学计算+绘图
│   │   ├── code_server.py   # Python代码执行
│   │   ├── viz_server.py    # Matplotlib可视化
│   │   └── paper_server.py  # ArXiv论文检索
│   ├── agent/
│   │   ├── graph.py         # ReAct图构建
│   │   ├── state.py         # 状态定义
│   │   └── llm_provider.py  # 多LLM适配器
│   ├── api/server.py        # FastAPI服务
│   └── requirements.txt
├── edumind-cognitive/       # 方案一：认知诊断
│   ├── agents/              # Diagnoser/Planner/Tutor
│   ├── kg/                  # Neo4j知识图谱
│   ├── cognitive_workflow/  # LangGraph工作流
│   └── api/server.py
├── edumind-team/            # 方案三：A2A教研网络
│   ├── a2a_bus/             # A2A消息总线
│   ├── agents/              # 5个专业Agent
│   └── api/server.py
├── edumind-evolve/          # 方案四：自进化教学
│   ├── core/                # RL策略网络+奖励模型+反思引擎
│   ├── api/server.py
│   └── frontend/            # 进化Dashboard
├── src/
│   ├── config.ts            # Mock模式配置
│   ├── utils/backendCheck.ts # 后端健康检测
│   ├── mocks/               # Mock数据（诊断流程+MCP工具）
│   ├── services/
│   │   ├── agentService.ts  # Agent调度 + 教学状态机
│   │   ├── mcpBridge.ts     # MCP桥接
│   │   ├── mockDiagnosisService.ts # Mock诊断服务
│   │   └── evolveService.ts # 自进化服务
│   ├── components/
│   │   ├── ErrorBoundary.tsx # 错误边界
│   │   ├── Skeleton.tsx     # 骨架屏
│   │   └── MCPToolsPanel.tsx # MCP工具面板
│   ├── pages/               # 7个页面组件
│   └── App.tsx              # 路由 + 认证 + Mock降级
├── docker-compose.yml       # 一键启动（5个服务）
├── render.yaml              # Render部署配置
├── .env.example             # 环境变量模板
├── public/404.html          # GitHub Pages SPA路由兼容
└── vercel.json              # Vercel部署配置
```

## 从 CodeRAG 到 EduMind 的演进

```
CodeRAG (Python + C++)          EduMind (React + Go + MCP)
─────────────────────          ──────────────────────────
本地 RAG 文档检索        →     多 Agent 协作教学
C++ 多线程并行           →     Go goroutine + channel
小型测试集               →     14知识点 × 27题库
仅本地运行               →     云端部署 + Docker
无安全措施               →     2轮审计 × 32项修复
固定功能                 →     MCP热插拔工具链
```

## License

MIT
