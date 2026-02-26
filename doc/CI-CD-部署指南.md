# GovAI CI/CD 部署指南

## 架构总览

```
┌───────────────────────────────────────────────────────────────┐
│  本地电脑 (Windows)                                           │
│                                                               │
│  VS Code 开发 → git commit → git push deploy main            │
└──────────────────────┬────────────────────────────────────────┘
                       │  SSH (port 8989) 推送代码
                       ▼
┌───────────────────────────────────────────────────────────────┐
│  内网服务器 10.16.49.100                                      │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ ~/GovAI.git (裸仓库)                                    │  │
│  │   └─ hooks/post-receive → 自动触发部署                   │  │
│  └──────────────┬──────────────────────────────────────────┘  │
│                 │ git checkout + docker build                  │
│                 ▼                                              │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ Docker Compose (docker-compose.prod.yml)                │  │
│  │                                                         │  │
│  │  ┌───────────┐  ┌──────────┐  ┌──────────────────────┐ │  │
│  │  │  Nginx    │  │ Backend  │  │   PostgreSQL         │ │  │
│  │  │ (port 80) │→ │ (8000)   │→ │   (5432 内部)        │ │  │
│  │  │ 前端+反代  │  │ FastAPI  │  │   + Redis            │ │  │
│  │  └───────────┘  └────┬─────┘  └──────────────────────┘ │  │
│  └───────────────────────┼─────────────────────────────────┘  │
│                          │ host.docker.internal               │
│  ┌───────────────────────▼─────────────────────────────────┐  │
│  │ Dify (已有部署)                                          │  │
│  │ UI: port 8990  │  API: port 5001                        │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

## 工作流程

```
本地开发 → git push deploy main → 服务器 post-receive 钩子 → Docker 构建 → 服务上线
```

**不需要外网！** 本地通过 SSH 直接推送代码到服务器，服务器收到后自动构建部署。

---

## 一次性设置步骤

### 第 1 步：本地配置 SSH 免密登录（可选但推荐）

在本地 PowerShell 中执行：

```powershell
# 生成 SSH 密钥（如果还没有的话）
ssh-keygen -t ed25519

# 上传公钥到服务器（需输一次密码）
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh -p 8989 wy@10.16.49.100 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

之后 SSH 就不用每次输密码了。

### 第 2 步：SSH 登录服务器，初始化部署环境

```bash
ssh -p 8989 wy@10.16.49.100
# 密码: wy62487732
```

首先把初始化脚本从本地传到服务器。**在本地新开一个终端**执行：

```powershell
# 在本地执行：先创建目录，再传文件
ssh -p 8989 wy@10.16.49.100 "mkdir -p ~/setup-tmp"
scp -P 8989 deploy/setup-server.sh wy@10.16.49.100:~/setup-tmp/
scp -P 8989 deploy/deploy.sh wy@10.16.49.100:~/setup-tmp/
```

然后**回到服务器 SSH 终端**执行：

```bash
bash ~/setup-tmp/setup-server.sh
```

脚本会自动完成：
- 创建 Git 裸仓库 `~/GovAI.git`
- 创建工作目录 `~/GovAI`
- 安装 `post-receive` 自动部署钩子

### 第 3 步：本地添加服务器远程仓库

在本地项目目录执行：

```powershell
git remote add deploy ssh://wy@10.16.49.100:8989/home/wy/GovAI.git
```

验证远程仓库：

```powershell
git remote -v
# 应该看到:
# deploy  ssh://wy@10.16.49.100:8989/home/wy/GovAI.git (fetch)
# deploy  ssh://wy@10.16.49.100:8989/home/wy/GovAI.git (push)
# origin  https://github.com/jianghao-jianghao-jianghao/GovAI.git (fetch)
# origin  https://github.com/jianghao-jianghao-jianghao/GovAI.git (push)
```

### 第 4 步：配置生产环境变量

在服务器上执行（首次推送前必须完成）：

```bash
cd ~/GovAI
cp .env.production.example .env.production
nano .env.production   # 或 vim
```

**必须修改的配置项：**

| 变量 | 说明 | 建议值 |
|------|------|--------|
| `JWT_SECRET_KEY` | JWT 签名密钥 | `openssl rand -hex 32` 生成 |
| `POSTGRES_PASSWORD` | 数据库密码 | 随机强密码 |
| `REDIS_PASSWORD` | Redis 密码 | 随机强密码 |
| `DIFY_DATASET_API_KEY` | Dify 知识库 Key | 从 Dify 后台获取 |
| `DIFY_APP_*` | 各功能 App Key | 从 Dify 后台获取 |

### 第 5 步：首次推送并部署

在本地执行：

```powershell
git push deploy main
```

推送过程中会看到服务器的实时构建日志。首次构建需要拉取 Docker 镜像，会比较慢（约 10-20 分钟）。

部署完成后，在浏览器打开：`http://10.16.49.100`

---

## 日常使用

### 自动部署（推荐 — 一条命令搞定）

```powershell
# 正常开发、提交
git add .
git commit -m "feat: 新增XX功能"

# 推送到服务器，自动部署
git push deploy main

# （可选）同时推送到 GitHub 备份
git push origin main
```

或者使用一键脚本（同时推送 GitHub + 服务器）：

```powershell
.\deploy\push-deploy.bat
```

### 查看部署日志

推送时终端会实时显示部署日志。也可以 SSH 到服务器查看历史日志：

```bash
cat ~/GovAI/deploy/deploy.log
```

### 手动部署（无需 push）

```bash
# SSH 到服务器
cd ~/GovAI
bash deploy/deploy.sh deploy   # 完整部署
bash deploy/deploy.sh quick    # 快速部署（增量构建）
```

### 其他运维命令

```bash
bash deploy/deploy.sh status   # 查看服务状态
bash deploy/deploy.sh logs     # 查看所有日志
bash deploy/deploy.sh logs backend   # 查看后端日志
bash deploy/deploy.sh stop     # 停止所有服务
bash deploy/deploy.sh restart  # 重启所有服务
```

---

## 访问地址

| 服务 | 地址 |
|------|------|
| 前端页面 | `http://10.16.49.100` |
| 后端 API | `http://10.16.49.100/api/v1/` |
| Dify UI | `http://10.16.49.100:8990` |

---

## 故障排查

### push 时提示连接失败

```powershell
# 确认 SSH 能连通
ssh -p 8989 wy@10.16.49.100 "echo ok"

# 确认 remote 地址正确
git remote -v
```

### push 成功但部署失败

```bash
# SSH 到服务器查看部署日志
cat ~/GovAI/deploy/deploy.log

# 查看容器状态
cd ~/GovAI
docker compose -f docker-compose.prod.yml --env-file .env.production ps

# 查看具体服务日志
docker compose -f docker-compose.prod.yml --env-file .env.production logs backend --tail=100
```

### 容器异常

```bash
cd ~/GovAI
# 重启单个服务
docker compose -f docker-compose.prod.yml --env-file .env.production restart backend

# 完全重建
bash deploy/deploy.sh deploy
```

### 数据库问题

```bash
# 进入数据库
docker exec -it govai-postgres psql -U govai_user -d govai_db
\dt   -- 列出表
\q    -- 退出
```

### 磁盘空间不足

```bash
docker system prune -af         # 清理未使用的镜像/容器
docker builder prune -af        # 清理构建缓存
```

---

## 文件说明

| 文件 | 说明 |
|------|------|
| `docker-compose.prod.yml` | 生产环境 Docker 编排 |
| `.env.production.example` | 生产环境变量模板 |
| `nginx.prod.conf` | 生产 Nginx 配置（Gzip、缓存） |
| `backend/Dockerfile.prod` | 后端生产镜像（多 worker，无热重载） |
| `deploy/setup-server.sh` | 服务器初始化脚本（裸仓库+钩子） |
| `deploy/deploy.sh` | 部署脚本（build/start/stop/logs） |
| `deploy/push-deploy.bat` | 本地一键推送脚本（Windows） |

---

## 与本地开发环境的区别

| 对比项 | 本地开发 | 服务器生产 |
|--------|---------|-----------|
| compose 文件 | `docker-compose.yml` | `docker-compose.prod.yml` |
| 环境变量 | `.env` | `.env.production` |
| Nginx 配置 | `nginx.conf` | `nginx.prod.conf` |
| 后端 Dockerfile | `Dockerfile` | `Dockerfile.prod` |
| 前端端口 | 3000 | 80 |
| Dify 连接 | SSH 隧道 → localhost | host.docker.internal（同服务器） |
| 数据库端口 | 15432（对外暴露） | 5432（仅容器内部） |
| 后端热重载 | 开启 (`--reload`) | 关闭（4 workers） |
| 部署方式 | 手动 docker compose up | `git push deploy main` 自动 |
