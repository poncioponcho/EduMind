# Go 后端部署指南

## 方案一：Railway 部署（推荐）

```bash
# 安装 Railway CLI
npm install -g @railway/cli

# 登录
railway login

# 初始化项目
cd backend/go
railway init

# 部署
railway up

# 获取公网 URL
railway domain
```

## 方案二：Fly.io 部署

```bash
# 安装 Fly CLI
curl -L https://fly.io/install.sh | sh

# 登录
fly auth login

# 启动应用
cd backend/go
fly launch

# 部署
fly deploy

# 获取公网 URL
fly apps list
```

## 方案三：Render 部署

1. 访问 https://render.com 并注册
2. 创建新的 Web Service
3. 连接 GitHub 仓库
4. 设置:
   - Root Directory: `backend/go`
   - Build Command: `go build -o edumind-server main.go`
   - Start Command: `./edumind-server`
   - Environment: Go 1.21

## 部署后更新前端 API 地址

部署完成后，在 Vercel 项目设置中添加环境变量：

```
VITE_API_BASE_URL=https://your-backend-url.railway.app
VITE_WS_URL=wss://your-backend-url.railway.app/ws/agents
```

然后在 `src/services/agentService.ts` 中将 API 调用地址替换为环境变量。
