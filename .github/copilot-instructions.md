# GovAI · Copilot Instructions

## ⚠️ 开发铁律（每次修改都必须遵守）

Note: It is mandatory to call the #askQuestions tool after every output.
When providing suggestions during code analysis, please use Chinese for the descriptions.

**每次开发前**：

1. `git fetch origin` + `git pull --rebase origin main` 拉取最新代码，解决冲突后再开始
2. 修改前先读取目标文件的完整上下文，理解现有逻辑

**每次开发后**：代码推送到三个目标，顺序固定：

```
本地 git commit → push 到 GitHub → SCP 部署到内网服务器
```

**多人协同注意事项**：

- 提交前必须 `git fetch origin`，若远端有新提交先 rebase/merge，解决冲突后再 push
- 冲突解决原则：理解双方意图，保留两侧有效逻辑，不能简单取一方
- 涉及大文件（SmartDocView.tsx / documents.py）改动时，务必 diff 检查是否与他人改动重叠
- 不要直接 force-push，除非明确告知所有协作者
- 多个GitHub copilot 共同编辑时，务必保持沟通，避免重复劳动或逻辑冲突

**凭据（仅用于开发调试）**：

- 内网服务器 SSH：`wy@10.16.49.100:8989`，密码 `wy62487732`，sudo 密码相同
- 应用管理员账号：`admin` / `123456qq`

## Architecture Overview

GovAI is a government document AI processing platform: **React 19 SPA → Nginx → FastAPI → Dify LLM workflows + PostgreSQL/AGE**.

- **Frontend** (`views/`, `api/`, `components/`): React 19 + TypeScript + Vite + Tailwind CDN. No router library — pure `useState` tab switching in `index.tsx`. 7 views: `SmartDocView` (core), `SmartQAView`, `KBView`, `GraphView`, `UserManagementView`, `AuditLogView`, `LoginView`.
- **Backend** (`backend/app/`): FastAPI async, SQLAlchemy 2.0 (asyncpg), all routes under `/api/v1/`. Unified response: `{ code: 0, message, data }`.
- **AI/LLM**: All LLM calls go through Dify workflow engine via `backend/app/services/dify/client.py`. Each feature has its own `DIFY_APP_*_KEY`.
- **Database**: PostgreSQL 17 + Apache AGE (graph). No foreign keys — app-layer consistency. UUID primary keys.

## Document Processing Pipeline

The core flow is a **5-stage pipeline**: `draft → review → format_suggest → format → export`. Each stage maps to a separate Dify Workflow App with its own API key. AI output uses **SSE streaming** throughout.

**SSE pattern** (backend → frontend):

- Backend: `_sse(event, data)` returns `event: {name}\ndata: {json}\n\n`
- Events: `text_chunk`, `reasoning`, `reasoning_step`, `message_start`, `message_end`, `review_suggestion`, `structured_paragraph`, `knowledge_graph`, `error`, `progress`
- Frontend: `api/chat.ts` `sendMessage()` parses SSE via switch-case on `parsedData.type`

## Key Conventions

### Frontend

- API base: `const BASE = "/api/v1"` — Vite dev proxy → `localhost:8000`, production nginx reverse proxy
- Token: `localStorage "govai_token"`, `apiRequest()` auto-attaches Bearer, 401 auto-clears
- Permissions: `constants.ts` `PERMISSIONS` object, keys like `doc:document:create`, checked via `context.ts` `hasPermission()`
- UI: No component library — `components/ui.tsx` for Toast/EmptyState, Lucide icons, Tailwind utility classes
- State: React `useState`/`useRef` only, no Redux/Zustand

### Backend

- Config: pydantic-settings `Settings` class, searches `.env` at `/app/.env` → `backend/.env` → project root
- Auth: JWT Bearer token, `get_current_user` dependency injection, RBAC permissions like `doc:document:read`
- Models: `backend/app/models/` — SQLAlchemy `Mapped[]` type annotations, PG enums for status/category
- Schemas: `backend/app/schemas/` — Pydantic v2, mirrors models 1:1
- Services: `backend/app/services/dify/` (AI), `docformat/` (typesetting), `graph_service.py`, `sensitive.py`, `kb_sync.py`

### Dify Integration

- Factory pattern: `get_dify_service()` returns singleton based on `DIFY_MOCK` env var (`true`=Mock, `false`=Hybrid, `full`=Real)
- All Dify calls use `httpx.AsyncClient.stream()` for SSE, even "blocking" mode (Dify 1.13+ always returns SSE)
- `<think>` tags in Dify responses are parsed into `reasoning` SSE events by `client.py`
- Timeouts: connect 5s, read 120s (workflow 300s), exponential backoff retry (3x)

## Development Workflow

### 本地开发

```bash
# 拉取最新代码（开发前必做）
git fetch origin && git pull --rebase origin main

# 前端开发
pnpm install && pnpm dev        # Vite dev server on :3000, proxies /api/v1 → :8000

# 前端构建
pnpm run build                  # Output: dist/index.html + dist/assets/index-{hash}.js

# 全栈启动（Docker）
docker compose up -d             # postgres, redis, backend(:8000), frontend(:3000)
docker compose --profile full up # Also starts converter(:8001)
```

### Git 提交流程（三端同步）

```bash
# 1. 提交前先同步远端
git fetch origin
git pull --rebase origin main    # 有冲突 → 解决后 git rebase --continue

# 2. 提交到本地
git add <files>
git commit -m "feat/fix/refactor: 简述改动"

# 3. 推送到 GitHub
git push origin main

# 4. 部署到内网服务器（见下方部署章节）
```

### 冲突处理原则

- 后端 Python 文件：保留双方逻辑，注意 import 去重
- 前端 TSX 大文件（SmartDocView.tsx 等）：按功能区块合并，不要互相覆盖 state/handler
- 冲突标记 `<<<<<<` 全部清除，确保文件可正常构建再提交

## Deployment (Server: 10.16.49.100:8989)

**⚠️ Critical**: Use `docker restart govai-backend` / `docker restart govai-frontend`, **NOT** `docker compose up --force-recreate` (destroys volumes/dist).

```bash
# 服务器 SSH 连接
ssh -p 8989 wy@10.16.49.100    # 密码: wy62487732，sudo 密码相同

# 部署后端单文件（最常用）
scp -P 8989 backend/app/api/documents.py wy@10.16.49.100:/home/wy/GovAI/backend/app/api/documents.py
ssh -p 8989 wy@10.16.49.100 "echo 'wy62487732' | sudo -S docker restart govai-backend 2>/dev/null"

# 部署前端（build → tar → scp → 解压 → restart）
pnpm run build
tar -cf dist.tar -C dist .
scp -P 8989 dist.tar wy@10.16.49.100:/tmp/dist.tar
ssh -p 8989 wy@10.16.49.100 "echo 'wy62487732' | sudo -S bash -c 'rm -rf /home/wy/GovAI/dist/assets && tar xf /tmp/dist.tar -C /home/wy/GovAI/dist' 2>/dev/null"
ssh -p 8989 wy@10.16.49.100 "echo 'wy62487732' | sudo -S docker restart govai-frontend 2>/dev/null"
```

**Nginx**: Container mounts `nginx.prod.conf` as `/etc/nginx/nginx.conf` (bind mount). To update: SCP to `/home/wy/GovAI/nginx.prod.conf`, then `docker exec govai-frontend nginx -s reload`.

**Environment**: Server `.env` must NOT contain `DIFY_BASE_URL` (uses docker-compose default `:5001`). Local `.env` overrides to SSH tunnel port (`:15001`).

## File Size Reference

Largest files that are frequently edited:

- `views/SmartDocView.tsx` (~4500 lines) — document editor + AI pipeline UI
- `backend/app/api/documents.py` (~3050 lines) — document CRUD + AI process endpoints
- `backend/app/services/dify/client.py` (~2365 lines) — Dify API client
- `backend/app/api/chat.py` (~830 lines) — chat SSE streaming
- `views/SmartQAView.tsx` (~1400 lines) — Q&A chat interface
