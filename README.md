<div align="center">

# 🏛️ GovAI · 智政公文处理系统

**AI 驱动的政务公文全流程智能处理平台**

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-336791?logo=postgresql)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)](https://docs.docker.com/compose/)
[![Dify](https://img.shields.io/badge/Dify-LLM%20Backend-7C3AED)](https://dify.ai/)

</div>

---

## 📖 项目简介

GovAI 是一个面向政务场景的 AI 公文处理平台，集成了公文**智能起草**、**审查优化**、**格式规范化**三大流水线阶段，以及**知识库问答（RAG）**、**知识图谱**、**敏感词管理**等辅助功能。系统通过接入 [Dify](https://dify.ai/) 工作流引擎调用大语言模型（LLM），实现公文处理的端到端智能化。

### ✨ 核心特性

| 功能模块                 | 说明                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| 📝 **智能公文起草**      | 点击或拖拽上传文档 → AI 根据指令自动起草公文，支持流式输出                                                |
| 🔍 **审查优化**          | AI 逐条审查公文，给出结构化修改建议（含严重程度、原文/建议对照），支持一键采纳                            |
| 🎨 **格式规范化**        | 按 GB/T 9704 等标准自动排版（字体、字号、行距、缩进、颜色），结构化段落实时预览                           |
| 💬 **智能知识问答**      | 基于 Dify RAG 的知识库问答，支持多轮对话与引用溯源                                                        |
| 🕸️ **知识图谱**          | 实体与关系自动抽取，Apache AGE 图数据库存储与可视化                                                       |
| 📚 **知识库管理**        | 数据集 / 文档 / 分段的全生命周期管理，对接 Dify Dataset API                                               |
| 🛡️ **敏感词管理**        | 多级别（高/中/低）敏感词规则库，支持阻断与告警                                                            |
| 👥 **用户与权限**        | RBAC 角色权限体系，JWT 认证，操作审计日志                                                                 |
| 📋 **版本管理**          | 公文内容版本快照，支持撤销/重做与历史版本回退                                                             |
| 🗂️ **素材库 & 常用指令** | 可复用的公文素材片段 + 三阶段常用 AI 指令模板                                                             |
| 🖨️ **格式预设**          | 内置 6 套排版预设（GB/T 9704、学术论文、法律文书等），支持自定义 CRUD                                     |
| 📥 **高精度导出**        | DOCX（python-docx 原生 Word XML）+ PDF（WeasyPrint CSS 精准渲染），内置完整公文字体 + fontconfig 别名映射 |

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    用户浏览器 (React SPA)                  │
│   React 19 + TypeScript + Vite + Tailwind CSS            │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP / SSE
                      ▼
┌─────────────────────────────────────────────────────────┐
│              Nginx 反向代理 (:3000)                       │
│   静态文件 + /api → backend:8000                         │
│   SSE proxy_read_timeout 300s                            │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│             FastAPI 后端 (:8000)                          │
│   异步 SQLAlchemy + httpx 流式代理                        │
│   JWT 认证 · RBAC 权限 · 审计日志                         │
├──────────┬──────────┬───────────┬───────────────────────┤
│ PostgreSQL│  Redis   │ Converter │    Dify 工作流引擎      │
│  + AGE    │ (缓存)   │ WeasyPrint │  (LLM / RAG / DSL)    │
│  :15432   │  :6379   │ +LO :8001 │   外部服务              │
└──────────┴──────────┴───────────┴───────────────────────┘
```

### 技术栈

#### 前端

- **React 19** + **TypeScript 5.8** — 函数组件 + Hooks
- **Vite 6** — 极速开发服务器与构建
- **Tailwind CSS** — 原子化样式（通过 CDN）
- **Lucide React** — 图标库
- **React Markdown** + remark-gfm — Markdown 渲染
- **SSE (Server-Sent Events)** — AI 流式输出实时展示

#### 后端

- **Python 3.12** + **FastAPI 0.115** — 高性能异步 API
- **SQLAlchemy 2.0** (asyncpg) — 异步 ORM
- **Alembic** — 数据库迁移
- **httpx** — 异步 HTTP 客户端（Dify API 流式代理）
- **python-jose** + **passlib** — JWT 认证
- **Redis 7** — 会话缓存
- **python-docx 1.1** — 原生 Word XML 文档生成（四槽字体、numPr 清理）
- **WeasyPrint 62.3** — CSS 精准 HTML→PDF 渲染（@font-face + @page 支持）
- **Jinja2** — 导出 HTML 模板引擎
- **fontconfig** — 字体名称别名映射（仿宋\_GB2312→FangSong 等）

#### 数据库

- **PostgreSQL 17** + **Apache AGE** — 关系型 + 图数据库
- **pgAdmin 4** — 数据库管理面板 (:5050)

#### AI / LLM

- **Dify** — 工作流编排引擎，管理所有 LLM 调用
  - Chatflow DSL：起草、审查、格式化、知识问答、实体抽取等
  - Dataset API：知识库 CRUD + RAG 检索

#### 基础设施

- **Docker Compose** — 一键编排所有服务
- **Nginx** — 前端静态服务 + API 反向代理
- **Converter 微服务** — WeasyPrint（HTML→PDF）+ LibreOffice（DOCX/其他→PDF）双引擎文档转换
- **公文字体包** — 仿宋、黑体、楷体、宋体、华文中宋、Times New Roman 等 13 套字体内置于 Docker 镜像
- **fontconfig 别名** — `local.conf` 映射中文字体名到实际 TTF 注册名（仿宋\_GB2312→FangSong、方正小标宋简体→STZhongsong 等）

---

## 📁 项目结构

```
GovAI/
├── index.html              # SPA 入口
├── index.tsx               # React 根组件
├── vite.config.ts          # Vite 配置
├── tsconfig.json           # TypeScript 配置
├── package.json            # 前端依赖
├── docker-compose.yml      # Docker 编排
├── nginx.conf              # Nginx 配置
├── .env                    # 环境变量（Dify Key 等）
│
├── api/                    # 前端 API 层
│   ├── client.ts           # axios 封装（拦截器、Token）
│   ├── auth.ts             # 认证 API
│   ├── documents.ts        # 公文 CRUD + AI 处理 + 版本
│   ├── chat.ts             # 智能问答 API
│   ├── kb.ts               # 知识库 API
│   ├── graph.ts            # 知识图谱 API
│   ├── users.ts            # 用户管理 API
│   ├── audit.ts            # 审计日志 API
│   ├── sensitive.ts        # 敏感词 API
│   └── index.ts            # 统一导出
│
├── views/                  # 页面组件
│   ├── SmartDocView.tsx     # 智能文档（三阶段流水线）
│   ├── SmartQAView.tsx      # 智能知识问答
│   ├── KBView.tsx           # 知识库管理
│   ├── GraphView.tsx        # 知识图谱
│   ├── UserManagementView.tsx # 用户与角色管理
│   ├── AuditLogView.tsx     # 审计日志
│   └── LoginView.tsx        # 登录页
│
├── components/             # 通用组件
│   ├── ui.tsx              # 基础 UI 组件（Modal、EmptyState 等）
│   └── StructuredDocRenderer.tsx  # 结构化公文渲染器
│
├── backend/                # FastAPI 后端
│   ├── app/
│   │   ├── main.py         # FastAPI 应用入口
│   │   ├── api/            # 路由层（RESTful + SSE）
│   │   ├── models/         # SQLAlchemy 数据模型
│   │   ├── schemas/        # Pydantic 请求/响应模型
│   │   ├── services/       # 业务逻辑层
│   │   │   ├── html_export.py  # 高精度 HTML/PDF 导出服务
│   │   │   └── ...
│   │   ├── templates/      # Jinja2 导出模板
│   │   │   └── doc_export.html  # PDF 导出 HTML 模板
│   │   └── core/           # 配置、依赖注入、中间件
│   ├── fonts/              # 公文专用字体（仿宋/黑体/楷体/宋体/华文中宋/Times New Roman 等 13 个文件）
│   ├── fonts-conf/         # fontconfig 字体别名配置
│   │   └── local.conf      # 仿宋_GB2312→FangSong、方正小标宋简体→STZhongsong 等映射
│   ├── alembic/            # 数据库迁移
│   ├── requirements.txt    # Python 依赖
│   └── Dockerfile          # 后端容器构建（含 Chromium + 字体 + fontconfig）
│
├── converter/              # 文档转换微服务
│   ├── app.py              # FastAPI 转换服务（WeasyPrint + LibreOffice 双引擎）
│   ├── requirements.txt    # Python 依赖（weasyprint, pdfplumber 等）
│   └── Dockerfile          # 容器构建（WeasyPrint 系统依赖 + 公文字体 + fontconfig）
│
├── dify/                   # Dify 工作流相关
│   ├── services/           # Dify API 客户端封装
│   │   ├── dify/client.py  # 核心客户端（流式解析、归一化）
│   │   └── graph/          # 图谱服务
│   ├── workflows_dsl/      # Chatflow DSL 定义文件
│   ├── test_knowledge/     # 知识库测试素材
│   └── tests/              # Dify 集成测试
│
└── doc/                    # 设计文档
    ├── schema.sql          # 完整数据库 DDL
    ├── plan.md             # 系统规划
    └── *.yaml              # API 规范
```

---

## 🚀 快速开始

### 前置条件

- **Docker Desktop** (含 Docker Compose v2)
- **Node.js 18+** & **pnpm**（用于前端开发/构建）
- **Dify 实例**（自部署或 SaaS），需配置好工作流并获取 API Key

### 1. 克隆项目

```bash
git clone https://github.com/your-org/GovAI.git
cd GovAI
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

`.env` 和 `.env.production` 仅用于本地/服务器实际部署，**不要提交到 Git 仓库**。仓库中只保留 `.env.example` / `.env.production.example` 作为示例模板。

编辑 `.env` 文件，填写必要的配置：

```env
# ── 数据库 ──
POSTGRES_USER=govai_user
POSTGRES_PASSWORD=govai_password
POSTGRES_DB=govai_db

# ── 认证 ──
JWT_SECRET_KEY=your-secret-key-change-in-production

# ── Dify 配置 ──
DIFY_BASE_URL=http://your-dify-host/v1
DIFY_DATASET_API_KEY=dataset-xxxxxxxx
DIFY_APP_DOC_DRAFT_KEY=app-xxxxxxxx      # 公文起草工作流
DIFY_APP_DOC_CHECK_KEY=app-xxxxxxxx      # 公文审查工作流
DIFY_APP_DOC_FORMAT_KEY=app-xxxxxxxx     # 公文格式化工作流
DIFY_APP_CHAT_KEY=app-xxxxxxxx           # 知识问答工作流
DIFY_APP_ENTITY_EXTRACT_KEY=app-xxxxxxxx # 实体抽取工作流
```

如果宿主机 Docker 版本较老，不支持 `host-gateway`，请在 `.env` / `.env.production` 中显式填写 `HOST_GATEWAY_IP` 为宿主机内网 IP。

### 3. 启动服务

```bash
# 启动核心服务（数据库、Redis、后端、前端）
docker compose up -d

# 启动全部服务（含文档转换器微服务）
docker compose --profile full up -d
```

### 4. 初始化

系统首次启动时会自动：

- 执行 `schema.sql` 初始化数据库表结构
- 创建默认管理员账户

**默认登录凭证：**

- 用户名：`admin`
- 密码：`admin123`

### 5. 访问系统

| 服务        | 地址                                 |
| ----------- | ------------------------------------ |
| 🌐 前端界面 | http://localhost:3000                |
| 📡 后端 API | http://localhost:8000/docs (Swagger) |
| 🗄️ pgAdmin  | http://localhost:5050                |

---

## 🔧 开发指南

### 前端开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器（HMR 热更新）
pnpm run dev
# → http://localhost:5173

# 构建生产版本
pnpm run build
```

### 后端开发

后端代码通过 Docker volume 挂载（`./backend:/app`），修改代码后重启容器即可生效：

```bash
docker restart govai-backend
```

### 部署更新（前端构建 → 容器）

```bash
# 1. 构建前端
pnpm run build

# 2. 复制到 nginx 容器
docker cp dist/. govai-frontend:/usr/share/nginx/html/

# 3. 重载 nginx
docker exec govai-frontend nginx -s reload

# 4. 重启后端（如有后端改动）
docker restart govai-backend
```

### 生产部署环境变量

面向甲方服务器部署时，建议使用下面的方式：

```bash
cp .env.production.example .env.production
```

然后在甲方服务器本地填写真实值。交付约定建议如下：

- 仓库和交付代码包中只保留 `.env.example` / `.env.production.example`
- 真实 `.env.production` 仅保存在甲方服务器或受控部署介质中
- `JWT_SECRET_KEY` 在甲方环境单独生成，不沿用开发环境
- 若 Dify 服务由甲方独立维护，生产 `DIFY_*` Key 也应使用甲方自己的凭据

### 生产部署文件约定

- 用于新服务器打包部署的主文件是 `docker-compose.prod.yml`
- 当前这台服务器为了复用历史 Docker 卷，额外保留了 `docker-compose.prod.current-server.yml`
- 新服务器启动时不要叠加 `docker-compose.prod.current-server.yml`，否则会引用当前服务器的历史卷名
- 需要打包当前目录时，可执行 `bash deploy/package-dir.sh`
- `package-dir.sh` 默认不再打入 `.env` / `.env.production` 等真实环境变量文件
- 若需要把当前服务器上的数据库与上传文件一并导出到项目目录，可执行 `bash deploy/export-runtime-state.sh`
- 若需要生成“代码 + 镜像 + 运行数据 + 环境文件”的完整离线交付包，可执行 `bash deploy/export-offline-bundle.sh`
- 若需要单独导出运行镜像，可执行 `bash deploy/export-docker-images.sh`
- 新服务器离线导入镜像可执行 `bash deploy/load-docker-images.sh <镜像目录>`
- 新服务器离线启动服务可执行 `bash deploy/offline-deploy.sh`
- 若需要在新服务器导入数据库与上传文件，可执行 `bash deploy/import-runtime-state.sh <运行态目录>`
- 具体步骤见 [doc/离线部署说明.md](./doc/离线部署说明.md)
- 打包和迁移时，以 `/root/govai/GovAI` 为唯一项目目录；`/root/govai` 下其它 handoff 副本不再作为部署来源

### 数据库迁移

```bash
# 进入后端容器
docker exec -it govai-backend bash

# 生成迁移脚本
alembic revision --autogenerate -m "描述"

# 执行迁移
alembic upgrade head
```

---

## 📋 功能模块详解

### 🔄 智能文档处理流水线

公文处理的核心功能，采用三阶段流水线设计，每个阶段独立运行，支持跳过：

```
上传文档 → [ 起草 ] → [ 审查优化 ] → [ 格式规范 ] → 导出/归档
```

#### 文档导入

- 支持点击上传和**拖拽上传**（.docx / .doc / .pdf / .txt / .md）
- 自动通过 Converter 微服务提取文本内容
- 文档列表操作列提供**一键进入三阶段**（起草 / 审查 / 格式化）快捷入口

#### 阶段一：智能起草

- AI 根据用户指令对内容进行起草/改写
- 流式输出，实时预览结果

#### 阶段二：审查优化

- AI 对公文进行逐项审查，输出结构化建议：
  - 严重程度（error / warning / info）
  - 原文定位 + 修改建议
  - 问题类型分类
- 右侧面板展示建议列表，一键查看详情

#### 阶段三：格式规范化

- 支持 6 种内置格式预设（GB/T 9704、学术论文、法律文书等）
- 自定义排版指令（字体、字号、行距、缩进、颜色、对齐等）
- **结构化段落实时预览**：每个段落独立展示排版效果
- 防幻觉机制：后端对 AI 输出的字体字号进行归一化校验
- 处理结果自动保存到数据库

#### 高精度导出

- **DOCX 导出**：python-docx 生成原生 Word XML
  - 四槽字体映射（ASCII/hAnsi/eastAsia/cs）确保中英文字体正确
  - 固定行距、GB/T 9704 页边距、红线、页码域
  - numPr 清理：消除 python-docx 内置样式继承导致的黑色项目符号
- **PDF 导出**：`render_export_html()` → Converter WeasyPrint 精准渲染
  - HTML 模板 1:1 复刻前端 StructuredDocRenderer 样式
  - `@font-face` 直接引用容器中字体文件（`file:///usr/share/fonts/...`）
  - `@page` A4 + GB/T 9704 页边距，与 Word 导出一致
  - fallback：若 WeasyPrint 失败，自动降级为 DOCX→LibreOffice 转换
- **fontconfig 字体映射**：`local.conf` 确保 DOCX 中的"仿宋\_GB2312"等名称正确匹配实际字体
- 前端下拉菜单一键选择 Word / PDF 格式下载

#### 撤销/回退

- 本地 Undo/Redo 栈（Ctrl+Z / Ctrl+Y）
- 服务端版本历史，支持回退到任意历史版本

### 💬 智能知识问答 (RAG)

- 基于 Dify RAG 工作流的多轮对话
- 支持知识库引用溯源
- 多会话管理

### 🕸️ 知识图谱

- 从公文中自动抽取实体与关系
- Apache AGE 图数据库存储
- 前端可视化展示

---

## 🐳 Docker 服务清单

| 服务             | 容器名          | 端口  | 说明                                                     |
| ---------------- | --------------- | ----- | -------------------------------------------------------- |
| PostgreSQL + AGE | govai-postgres  | 15432 | 关系型 + 图数据库                                        |
| Redis            | govai-redis     | 6379  | 缓存                                                     |
| FastAPI 后端     | govai-backend   | 8000  | API 服务                                                 |
| Nginx 前端       | govai-frontend  | 3000  | SPA + 反向代理                                           |
| pgAdmin          | govai-pgadmin   | 5050  | 数据库管理                                               |
| Converter\*      | govai-converter | 8001  | WeasyPrint + LibreOffice 文档转换（需 `--profile full`） |

---

## 🔐 认证与权限

- **JWT Token** 认证，Bearer 方式传递
- **RBAC** 角色权限模型：
  - 管理员（admin）：全部权限
  - 普通用户：按角色分配功能权限
- **审计日志**：记录所有关键操作（登录、文档增删改、AI 处理等）

---

## 📡 API 概览

后端 API 遵循 RESTful 规范，主要端点：

| 模块   | 路径前缀         | 功能                                        |
| ------ | ---------------- | ------------------------------------------- |
| 认证   | `/api/auth`      | 登录 / 刷新 Token / 修改密码                |
| 用户   | `/api/users`     | 用户 CRUD                                   |
| 角色   | `/api/roles`     | 角色与权限管理                              |
| 公文   | `/api/documents` | 文档 CRUD / 导入导出 / AI 处理 (SSE) / 版本 |
| 模板   | `/api/templates` | 公文模板管理                                |
| 素材   | `/api/materials` | 素材库 CRUD                                 |
| 知识库 | `/api/knowledge` | 数据集 / 文档 / 分段管理                    |
| 问答   | `/api/qa`        | RAG 对话 (SSE)                              |
| 图谱   | `/api/graph`     | 实体抽取 / 图查询                           |
| 敏感词 | `/api/sensitive` | 规则 CRUD / 文本检测                        |
| 审计   | `/api/audit`     | 操作日志查询                                |

> AI 处理接口使用 **Server-Sent Events (SSE)** 实现流式输出，nginx 配置了 300s 超时以支持长时间处理。

---

## 🛠️ Dify 工作流配置

系统依赖以下 Dify Chatflow 工作流（DSL 文件位于 `dify/workflows_dsl/`）：

| 工作流       | 环境变量                      | 用途                     |
| ------------ | ----------------------------- | ------------------------ |
| 智能公文起草 | `DIFY_APP_DOC_DRAFT_KEY`      | 根据指令生成公文         |
| 智能公文审查 | `DIFY_APP_DOC_CHECK_KEY`      | 审查优化，输出结构化建议 |
| 智能公文排版 | `DIFY_APP_DOC_FORMAT_KEY`     | 按格式预设进行排版       |
| 智能知识问答 | `DIFY_APP_CHAT_KEY`           | RAG 知识库问答           |
| 实体关系抽取 | `DIFY_APP_ENTITY_EXTRACT_KEY` | 图谱实体与关系提取       |

---

## �️ 字体与导出架构

### 导出流程

```
┌──────────────────────────────────────────────────────────┐
│                    前端预览（浏览器）                       │
│  StructuredDocRenderer.tsx → 结构化段落逐段渲染             │
└──────┬──────────────────────────┬────────────────────────┘
       │ 导出 Word                │ 导出 PDF
       ▼                         ▼
┌──────────────┐   ┌─────────────────────────────────────┐
│ python-docx  │   │ render_export_html() → HTML 字符串    │
│ _build_      │   │   ↓ POST /convert-to-pdf             │
│ formatted_   │   │ Converter 微服务 (WeasyPrint)         │
│ docx()       │   │   ↓ fallback: DOCX→LibreOffice       │
│ → DOCX bytes │   │ → PDF bytes                          │
└──────────────┘   └─────────────────────────────────────┘
```

### 内置字体清单

| 文件名           | 注册名 (family)             | 用途                   |
| ---------------- | --------------------------- | ---------------------- |
| simfang.ttf      | FangSong / 仿宋             | 公文正文               |
| simhei.ttf       | SimHei / 黑体               | 标题                   |
| simkai.ttf       | KaiTi / 楷体                | 批注/签发人            |
| simsun.ttc       | SimSun / 宋体               | 附注/页码              |
| msyh.ttc         | Microsoft YaHei / 微软雅黑  | UI 字体                |
| STZHONGS.TTF     | STZhongsong / 华文中宋      | 标题（替代方正小标宋） |
| STFANGSO.TTF     | STFangsong / 华文仿宋       | 仿宋备选               |
| STKAITI.TTF      | STKaiti / 华文楷体          | 楷体备选               |
| STSONG.TTF       | STSong / 华文宋体           | 宋体备选               |
| times.ttf        | Times New Roman             | 英文/数字              |
| timesbd/bi/i.ttf | Times New Roman Bold/Italic | 英文粗体/斜体          |

### fontconfig 字体别名

`backend/fonts-conf/local.conf` 解决 DOCX / WeasyPrint 中字体名称与实际 TTF 注册名不一致的问题：

| DOCX 中的字体名                      | 映射目标 (TTF 注册名)      | 机制         |
| ------------------------------------ | -------------------------- | ------------ |
| 仿宋\_GB2312                         | FangSong (simfang.ttf)     | match/assign |
| 楷体\_GB2312                         | KaiTi (simkai.ttf)         | match/assign |
| 方正小标宋简体                       | STZhongsong (STZHONGS.TTF) | match/assign |
| FZXiaoBiaoSong-B05                   | STZhongsong                | match/assign |
| 仿宋 / 楷体 / 黑体 / 宋体 / 微软雅黑 | 对应英文注册名             | alias/prefer |

---

## �📄 License

MIT
