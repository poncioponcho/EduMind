# EduMind - 多Agent智能教育中枢

> Go Goroutine 驱动的多Agent智能教育 + MCP超级教师系统
> 华东师范大学 · 软件工程研究生预备项目

## 🌐 在线体验

**[https://edu-mind-ebon.vercel.app](https://edu-mind-ebon.vercel.app)**

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

## 技术亮点

### 🔌 MCP超级教师（新增）
- **4个MCP Server**：数学(SymPy) / 代码(Python执行) / 可视化(Matplotlib) / 论文(ArXiv)
- **LangGraph ReAct图**：自动选择工具链，支持链式调用（算方程→画图→讲解）
- **热插拔设计**：MCP Server可独立启停，registry.yaml声明式注册
- **前端一键切换**：教学页面 MCP ON/OFF 按钮，实时显示工具调用过程

### 🔒 安全加固（2轮审计，32项漏洞修复）
- CORS 白名单校验 + WebSocket Origin 验证
- IP 速率限制（60次/min）+ 请求超时保护（30s）
- XSS 防护（sanitizeHtml）+ 安全响应头（CSP/HSTS/X-Frame-Options）
- Panic recovery + 并发写锁保护

### 🧠 Socratic 教学状态机
- 5阶段教学流程：引入 → 定义 → 例题 → 练习 → 总结
- 意图识别：6种用户意图（困惑/求定义/求例/继续/回答/问候）
- 递归深度限制 + 对话状态 TTL 自动清理

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
| "画sin(x+t)动画" | animate_function | 参数变化多帧叠加图 |

## 页面功能

| 页面 | 功能 |
|------|------|
| 🏠 首页 | 粒子动画背景 + 4个Agent实时状态卡片 |
| 🔍 诊断 | 27题库随机5题测试，精准定位薄弱知识点 |
| 📖 教学 | Socratic对话 + **MCP超级教师模式**，右侧知识面板 |
| 🗺️ 路径 | 知识图谱可视化，个性化学习路径生成 |
| 📊 报告 | 仪表盘式学习数据分析 + 趋势图 |
| ⚙️ 管理 | Agent监控 + 架构图 + 通信日志 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Tailwind CSS + shadcn/ui |
| 网关 | Go 1.21 + Gin + gorilla/websocket |
| MCP | LangGraph + LangChain MCP Adapters + 多LLM提供商 |
| LLM | Gemini / 通义千问(百炼) / Kimi Code / OpenAI GPT（4选1） |
| 工具 | SymPy(数学) + Python(代码) + Matplotlib(可视化) + ArXiv(论文) |
| 并发 | goroutine + channel (替代 C++ pthread) |
| 数据 | localStorage + JSON知识图谱 |
| 部署 | Vercel (前端) + Docker (后端+MCP) |

## 快速启动

### 方式一：Docker Compose（推荐）

```bash
# 设置 LLM API Key（4选1）
export GOOGLE_API_KEY=xxx          # Google Gemini（免费）
export DASHSCOPE_API_KEY=xxx       # 阿里云百炼 通义千问（免费）
export MOONSHOT_API_KEY=xxx        # Kimi Code（免费）
export OPENAI_API_KEY=xxx          # OpenAI GPT

# 可选：强制指定 LLM 提供商
export LLM_PROVIDER=qwen          # gemini | qwen | kimi | openai

docker-compose up --build
# 前端: http://localhost:3000
# Go后端: http://localhost:8080
# MCP服务: http://localhost:8000
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

# 设置 LLM Key（4选1）
export DASHSCOPE_API_KEY=your_key_here   # 推荐：阿里云百炼，国内访问快

python api/server.py  # http://localhost:8000
```

### 单独测试MCP Server

```bash
cd edumind-mcp

# 测试数学服务器
python mcp_servers/math_server.py

# 测试代码服务器
python mcp_servers/code_server.py

# 测试可视化服务器
python mcp_servers/viz_server.py

# 测试论文服务器
python mcp_servers/paper_server.py
```

## 项目结构

```
EduMind/
├── backend/go/
│   ├── main.go              # Agent调度网关核心（1500+行）
│   ├── Dockerfile           # 后端容器化
│   └── go.mod
├── edumind-mcp/             # MCP超级教师
│   ├── mcp_servers/
│   │   ├── math_server.py   # SymPy数学计算+绘图
│   │   ├── code_server.py   # Python代码执行
│   │   ├── viz_server.py    # Matplotlib可视化
│   │   └── paper_server.py  # ArXiv论文检索
│   ├── langgraph/
│   │   ├── graph.py         # ReAct图构建
│   │   └── state.py         # 状态定义
│   ├── api/
│   │   └── server.py        # FastAPI服务
│   ├── registry.yaml        # MCP Server注册表
│   ├── Dockerfile           # MCP容器化
│   └── requirements.txt
├── src/
│   ├── types/index.ts       # TypeScript 类型定义
│   ├── services/
│   │   ├── agentService.ts  # Agent调度 + 教学状态机
│   │   ├── mcpBridge.ts     # MCP桥接（WebSocket+HTTP）
│   │   └── database.ts      # 数据持久化层
│   ├── pages/               # 6个页面组件
│   └── App.tsx              # 路由 + 认证
├── docker-compose.yml       # 一键启动（前端+后端+MCP）
├── Dockerfile               # 前端容器化
├── nginx.conf               # Nginx 配置
├── vercel.json              # Vercel 部署配置
└── CHANGELOG.md             # 安全审计记录
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
