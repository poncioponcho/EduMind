# EduMind 推送指南

## 方式一：命令行推送（推荐）

在你的本地机器上运行：

```bash
# 1. 克隆仓库
git clone https://github.com/poncioponcho/EduMind.git
cd EduMind

# 2. 或者直接在现有目录推送
git push -u origin main
```

如果提示输入凭据，使用 Personal Access Token：
- 用户名: `poncioponcho`
- 密码: 你的 GitHub Personal Access Token

### 创建 Personal Access Token
1. 访问 https://github.com/settings/tokens
2. 点击 "Generate new token (classic)"
3. 勾选 `repo` 权限
4. 生成后复制 token 作为密码使用

## 方式二：手动上传

1. 将项目文件压缩为 zip
2. 在 GitHub 仓库页面点击 "Upload files"
3. 拖拽上传

## 项目结构

```
EduMind/
├── backend/
│   └── go/
│       ├── main.go          # Go Agent调度网关 (核心)
│       └── go.mod           # Go模块定义
├── src/
│   ├── types/               # TypeScript类型定义
│   ├── services/            # Agent服务 + 数据库
│   ├── pages/               # 6个页面组件
│   └── App.tsx              # 主应用
├── public/                  # 静态资源 (Agent图标)
└── dist/                    # 构建产物 (已部署)
```

## 已部署地址

前端: https://7mzaddcebn6zm.ok.kimi.link

## Go后端启动

```bash
cd backend/go
go mod tidy
go run main.go
# 服务启动于 :8080
```
