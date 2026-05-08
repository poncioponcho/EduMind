# EduMind - 多Agent智能教育中枢

> Go Goroutine 驱动的多Agent智能教育与个性化学习系统
> 华东师范大学 · 软件工程研究生预备项目

## 在线体验

[https://7mzaddcebn6zm.ok.kimi.link](https://7mzaddcebn6zm.ok.kimi.link)

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
React 19 + TypeScript + Tailwind CSS (前端)
                    ↓ API / WebSocket
Go + Gin Agent调度网关 (goroutine并发)
    ├── 诊断Agent ──→ 5题认知诊断，BKT概率更新
    ├── 教学Agent ──→ Socratic对话式引导教学
    ├── 规划Agent ──→ 知识图谱路径生成
    └── 评估Agent ──→ 可视化学习报告
                    ↓
         SQLite + JSON知识图谱
```

## 技术亮点

- **Go goroutine 替代 C++**：代码量减少80%，并发更安全
- **Socratic 教学法**：AI导师引导思考，而非直接给答案
- **14个高等数学知识点**：完整的知识图谱关联
- **实时Agent通信**：WebSocket广播Agent间消息流
- **认知诊断模型**：简化的BKT算法，小数据场景适用

## 页面功能

| 页面 | 功能 |
|------|------|
| 首页 | 粒子动画背景 + 4个Agent状态卡片 |
| 诊断 | 5题快速测试，定位薄弱知识点 |
| 教学 | Socratic对话，右侧知识面板 |
| 路径 | 知识图谱可视化，个性化学习路径 |
| 报告 | 仪表盘式学习数据分析 |
| 管理 | Agent监控 + 架构图 + 通信日志 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Tailwind CSS + shadcn/ui |
| 网关 | Go 1.21 + Gin + gorilla/websocket |
| 并发 | goroutine + channel |
| 数据 | SQLite + JSON知识图谱 |
| LLM | OpenRouter API |

## 本地开发

### 前端

```bash
cd app
npm install
npm run dev      # 开发
npm run build    # 构建
```

### Go后端

```bash
cd backend/go
go mod tidy
go run main.go   # 启动于 :8080
```

## 项目结构

```
EduMind/
├── backend/
│   └── go/
│       ├── main.go          # Agent调度网关核心
│       └── go.mod
├── src/
│   ├── types/               # TypeScript类型
│   ├── services/            # Agent服务 + 数据库
│   ├── pages/               # 6个页面
│   └── App.tsx
├── public/                  # 静态资源
└── dist/                    # 构建产物
```

## 从CodeRAG到EduMind的演进

```
CodeRAG (Python + C++)
  - 本地RAG文档检索
  - C++多线程并行
  - 小型测试集
  - 仅本地运行

    ↓ 全面升级

EduMind (React + Go + Python)
  - 多Agent协作教学
  - Go goroutine并发
  - 知识图谱驱动
  - 云端部署可用
```

## License

MIT
