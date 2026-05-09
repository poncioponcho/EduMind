# EduMind - 多Agent智能教育中枢

> Go Goroutine 驱动的多Agent智能教育与个性化学习系统
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

## 系统架构

```
┌─────────────────────────────────────────────┐
│           React 19 + TypeScript             │
│         Tailwind CSS + shadcn/ui            │
│  ┌─────────┐ ┌─────────┐ ┌──────────────┐  │
│  │ 诊断页面 │ │ 教学对话 │ │ 路径/报告页面 │  │
│  └────┬────┘ └────┬────┘ └──────┬───────┘  │
│       └──────┬────┴─────────────┘           │
│              ↓ API / WebSocket               │
├─────────────────────────────────────────────┤
│         Go + Gin Agent 调度网关              │
│              goroutine 并发                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ 诊断Agent │ │ 教学Agent │ │ 规划Agent │    │
│  │ BKT诊断   │ │ Socratic │ │ 知识图谱  │    │
│  └──────────┘ └──────────┘ └──────────┘    │
│              ┌──────────┐                    │
│              │ 评估Agent │                    │
│              │ 可视化    │                    │
│              └──────────┘                    │
│              ↓                               │
│     localStorage / SQLite + JSON知识图谱     │
└─────────────────────────────────────────────┘
```

## 技术亮点

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

## 页面功能

| 页面 | 功能 |
|------|------|
| 🏠 首页 | 粒子动画背景 + 4个Agent实时状态卡片 |
| 🔍 诊断 | 27题库随机5题测试，精准定位薄弱知识点 |
| 📖 教学 | Socratic对话式引导教学，右侧知识面板 |
| 🗺️ 路径 | 知识图谱可视化，个性化学习路径生成 |
| 📊 报告 | 仪表盘式学习数据分析 + 趋势图 |
| ⚙️ 管理 | Agent监控 + 架构图 + 通信日志 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Tailwind CSS + shadcn/ui |
| 网关 | Go 1.21 + Gin + gorilla/websocket |
| 并发 | goroutine + channel (替代 C++ pthread) |
| 数据 | localStorage + JSON知识图谱 |
| 部署 | Vercel (前端) + Docker (后端) |

## 快速启动

### 方式一：Docker Compose（推荐）

```bash
docker-compose up --build
# 前端: http://localhost:3000
# 后端: http://localhost:8080
```

### 方式二：本地开发

```bash
# 前端
npm install
npm run dev      # http://localhost:3000

# Go后端（另一个终端）
cd backend/go
go mod tidy
go run main.go   # http://localhost:8080
```

## 项目结构

```
EduMind/
├── backend/go/
│   ├── main.go              # Agent调度网关核心（1500+行）
│   ├── Dockerfile           # 后端容器化
│   └── go.mod
├── src/
│   ├── types/index.ts       # TypeScript 类型定义
│   ├── services/
│   │   ├── agentService.ts  # Agent调度 + 教学状态机
│   │   └── database.ts      # 数据持久化层
│   ├── pages/               # 6个页面组件
│   └── App.tsx              # 路由 + 认证
├── docker-compose.yml       # 一键启动
├── Dockerfile               # 前端容器化
├── nginx.conf               # Nginx 配置
├── vercel.json              # Vercel 部署配置
└── CHANGELOG.md             # 安全审计记录
```

## 从 CodeRAG 到 EduMind 的演进

```
CodeRAG (Python + C++)          EduMind (React + Go)
─────────────────────          ────────────────────
本地 RAG 文档检索        →     多 Agent 协作教学
C++ 多线程并行           →     Go goroutine + channel
小型测试集               →     14知识点 × 27题库
仅本地运行               →     云端部署 + Docker
无安全措施               →     2轮审计 × 32项修复
```

## License

MIT
