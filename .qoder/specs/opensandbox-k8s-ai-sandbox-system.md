# OpenSandbox K8s AI 沙盒系统 — 全栈实施方案

## Context

构建一套基于 OpenSandbox 的 AI 沙箱系统，支持用户通过网页终端 (xterm.js) 与隔离沙箱交互，后端通过 Claude Code 等工具执行 AI 编程任务。系统在本地 Docker Desktop Kubernetes 上开发和验证，设计上保证生产环境无缝迁移。每个沙箱通过通配符域名（如 `sandbox111-8989.rabbitai-lab.com`）直接暴露内部端口服务。

**核心技术选型**：
- 后端：Node.js + Express + ws (WebSocket)
- 前端：React 19 + TypeScript + Vite + xterm.js
- 沙箱平台：OpenSandbox (Alibaba 开源，CNCF Landscape)
- 基础设施：Docker Desktop K8s → 生产环境任意 K8s 集群
- SDK 集成：`@alibaba-group/opensandbox` npm 包

---

## 项目结构

```
sandbox-platform/
├── package.json                    # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .env.example
├── .gitignore
│
├── apps/
│   ├── backend/                    # Node.js Express 中转服务
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   ├── .env.example
│   │   └── src/
│   │       ├── index.ts            # 入口：启动 Express + WebSocket 服务器
│   │       ├── config.ts           # 环境变量驱动的配置
│   │       ├── server.ts           # Express app 工厂 + HTTP server
│   │       ├── routes/
│   │       │   ├── auth.ts         # POST /api/auth/login, logout, me
│   │       │   ├── sandboxes.ts    # /api/sandboxes CRUD + pause/resume
│   │       │   ├── files.ts        # /api/sandboxes/:id/files/* 文件操作
│   │       │   ├── commands.ts     # /api/sandboxes/:id/commands 命令执行
│   │       │   ├── health.ts       # GET /api/health
│   │       │   └── index.ts        # 路由聚合
│   │       ├── middleware/
│   │       │   ├── auth.ts         # JWT 验证中间件
│   │       │   ├── error.ts        # 集中式错误处理
│   │       │   └── rateLimit.ts    # 用户级限流
│   │       ├── websocket/
│   │       │   ├── ptyRelay.ts     # PTY WebSocket 双向中转核心
│   │       │   ├── connectionManager.ts # 连接追踪与管理
│   │       │   └── types.ts        # WS 消息类型定义
│   │       ├── services/
│   │       │   ├── sandboxService.ts   # 封装 SDK 调用
│   │       │   └── sessionService.ts   # 用户会话管理
│   │       └── types/
│   │           └── index.ts
│   │
│   └── frontend/                   # React + TypeScript SPA
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       ├── Dockerfile
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── api/
│           │   ├── client.ts       # 类型化 fetch 封装
│           │   ├── sandboxes.ts    # 沙箱 CRUD API
│           │   ├── files.ts        # 文件操作 API
│           │   └── types.ts        # 响应/请求类型
│           ├── hooks/
│           │   ├── useSandbox.ts   # 沙箱生命周期 hook
│           │   ├── useWebSocket.ts # WebSocket 连接 hook
│           │   ├── useFileTree.ts  # 文件树数据 hook
│           │   └── useTerminal.ts  # xterm.js 集成 hook
│           ├── components/
│           │   ├── layout/
│           │   │   ├── AppShell.tsx
│           │   │   └── Header.tsx
│           │   ├── sandbox/
│           │   │   ├── SandboxList.tsx
│           │   │   ├── SandboxCard.tsx
│           │   │   ├── CreateSandbox.tsx
│           │   │   └── SandboxDetail.tsx
│           │   ├── terminal/
│           │   │   ├── TerminalPane.tsx    # xterm.js 封装
│           │   │   └── TerminalTabs.tsx
│           │   ├── files/
│           │   │   ├── FileTree.tsx
│           │   │   ├── FileTreeNode.tsx
│           │   │   └── FileViewer.tsx
│           │   └── common/
│           │       ├── Button.tsx
│           │       ├── Modal.tsx
│           │       └── StatusBadge.tsx
│           ├── pages/
│           │   ├── DashboardPage.tsx   # 沙箱列表主页
│           │   ├── SandboxPage.tsx     # 沙箱工作区 (终端+文件树)
│           │   └── LoginPage.tsx
│           └── styles/
│               ├── globals.css
│               └── xterm-overrides.css
│
├── infra/
│   ├── opensandbox/                # OpenSandbox 基础设施配置
│   │   ├── install.sh              # 一键安装脚本 (Helm)
│   │   ├── uninstall.sh            # 卸载脚本
│   │   ├── values-dev.yaml         # Docker Desktop K8s 开发配置
│   │   ├── values-production.yaml  # 生产环境配置覆盖
│   │   └── pool.yaml               # Pool CRD 热备沙箱池
│   │
│   └── helm/                       # 平台应用层 Helm Chart
│       └── sandbox-platform/
│           ├── Chart.yaml
│           ├── values.yaml
│           ├── values-production.yaml
│           └── templates/
│               ├── backend-deployment.yaml
│               ├── backend-service.yaml
│               ├── backend-configmap.yaml
│               ├── frontend-deployment.yaml
│               ├── frontend-service.yaml
│               ├── ingress.yaml
│               └── secrets.yaml
│
└── scripts/
    ├── setup.sh                    # 完整本地环境搭建
    ├── dev-backend.sh              # 本地运行后端 (port-forward)
    └── dev-frontend.sh             # 本地运行前端
```

---

## 实施步骤

### Step 1: 项目脚手架与 Monorepo 搭建

**创建文件**：
- `package.json` (workspace root)
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `.gitignore`
- `.env.example`

初始化 `apps/backend` 和 `apps/frontend` 子项目，安装核心依赖：

**后端依赖**：
```
express, ws, @alibaba-group/opensandbox, jsonwebtoken, pino, pino-pretty, cors, dotenv
dev: typescript, tsx, @types/express, @types/ws, @types/jsonwebtoken, @types/cors
```

**前端依赖**：
```
react, react-dom, react-router-dom, @xterm/xterm, @xterm/addon-fit, @xterm/addon-web-links
dev: typescript, vite, @vitejs/plugin-react, @types/react, @types/react-dom
```

### Step 2: OpenSandbox 基础设施部署

**创建文件**：
- `infra/opensandbox/install.sh` — 检查 Helm，创建 namespace，安装 OpenSandbox Controller + Server + Ingress
- `infra/opensandbox/values-dev.yaml` — Docker Desktop 配置覆盖
- `infra/opensandbox/values-production.yaml` — 生产环境配置（含 gateway 通配符域名）

**install.sh 核心逻辑**：
1. 检测 `helm`，缺失则 `brew install helm`
2. 创建 `opensandbox-system` namespace
3. 克隆 OpenSandbox 仓库到临时目录，或从 GitHub Release 下载 Helm chart
4. `helm install opensandbox-controller <chart> -n opensandbox-system -f values-dev.yaml`
5. 等待所有 Pod Running
6. 部署 OpenSandbox Ingress 组件（从预构建镜像或本地编译）
7. 输出 Server 的 ClusterIP 和端口

**values-dev.yaml 关键配置**（本地开发，无通配符域名）：
```yaml
controller:
  replicaCount: 1
  resources:
    requests: { cpu: 50m, memory: 32Mi }

server:
  replicaCount: 1
  resources:
    requests: { cpu: 500m, memory: 1Gi }

configToml: |
  [server]
  host = "0.0.0.0"
  port = 80
  api_key = "dev-api-key-change-in-prod"

  [runtime]
  type = "kubernetes"
  execd_image = "sandbox-registry.cn-zhangjiakou.cr.aliyuncs.com/opensandbox/execd:v1.0.17"

  [kubernetes]
  namespace = "opensandbox"
  workload_provider = "batchsandbox"
  informer_enabled = true

  [ingress]
  mode = "direct"
```

**values-production.yaml 关键配置**（生产环境，启用通配符域名网关）：
```yaml
controller:
  replicaCount: 2
  snapshot:
    registry: "your-registry.example.com/opensandbox-snapshots"
    snapshotPushSecret: "registry-snapshot-push-secret"
    resumePullSecret: "registry-pull-secret"

server:
  replicaCount: 2
  resources:
    requests: { cpu: 1000m, memory: 2Gi }

configToml: |
  [server]
  host = "0.0.0.0"
  port = 80
  api_key = ""  # 通过 Secret 注入

  [runtime]
  type = "kubernetes"
  execd_image = "sandbox-registry.cn-zhangjiakou.cr.aliyuncs.com/opensandbox/execd:v1.0.17"

  [kubernetes]
  namespace = "opensandbox"
  workload_provider = "batchsandbox"
  informer_enabled = true

  [ingress]
  mode = "gateway"

  [ingress.gateway]
  address = "*.rabbitai-lab.com"
  route.mode = "wildcard"

  [secure_runtime]
  type = "gvisor"
  k8s_runtime_class = "gvisor"

  [egress]
  image = "sandbox-registry.cn-zhangjiakou.cr.aliyuncs.com/opensandbox/egress:v1.0.12"
  mode = "dns+nft"
```

**OpenSandbox Ingress 组件部署** (`infra/opensandbox/ingress-deployment.yaml`)：
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: opensandbox-ingress
  namespace: opensandbox-system
spec:
  replicas: 2
  selector:
    matchLabels:
      app: opensandbox-ingress
  template:
    metadata:
      labels:
        app: opensandbox-ingress
    spec:
      containers:
      - name: ingress
        image: opensandbox/ingress:latest
        args:
          - "--provider-type=batchsandbox"
          - "--mode=header"
          - "--port=28888"
          - "--log-level=info"
        ports:
        - containerPort: 28888
---
apiVersion: v1
kind: Service
metadata:
  name: opensandbox-ingress
  namespace: opensandbox-system
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 28888
  selector:
    app: opensandbox-ingress
```

> **注意**：Ingress 组件使用 `--mode=header`，此模式下优先检查 `OpenSandbox-Ingress-To` 头，无此头时自动解析 Host 头实现通配符域名路由。

**K8s Ingress 资源**（将外部流量路由到 OpenSandbox Ingress）(`infra/opensandbox/sandbox-ingress.yaml`)：
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: sandbox-wildcard-ingress
  namespace: opensandbox-system
  annotations:
    # 使用 nginx ingress controller
    nginx.ingress.kubernetes.io/websocket-services: "opensandbox-ingress"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - "*.rabbitai-lab.com"
    secretName: rabbitai-lab-wildcard-tls
  rules:
  - host: "*.rabbitai-lab.com"
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: opensandbox-ingress
            port:
              number: 80
```

**创建文件 `infra/opensandbox/pool.yaml`**：
```yaml
apiVersion: sandbox.opensandbox.io/v1alpha1
kind: Pool
metadata:
  name: dev-pool
  namespace: opensandbox
spec:
  template:
    spec:
      containers:
      - name: sandbox
        image: ubuntu:22.04  # 替换为实际的 Claude Code 镜像
  capacitySpec:
    bufferMax: 3
    bufferMin: 1
    poolMax: 5
    poolMin: 0
```

### Step 3: 后端核心 — 配置与基础路由

**创建文件 `apps/backend/src/config.ts`**：
从环境变量读取配置，导出类型安全的配置对象。关键变量：

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `PORT` | 否 | `3000` | HTTP 监听端口 |
| `OPENSANDBOX_SERVER_URL` | 是 | - | OpenSandbox Server 地址 |
| `OPENSANDBOX_API_KEY` | 否 | - | Server API Key |
| `JWT_SECRET` | 是 | - | JWT 签名密钥 |
| `CORS_ORIGIN` | 否 | `*` | CORS 允许源 |
| `AUTH_USERS` | 否 | `[{"username":"admin","password":"admin"}]` | 开发用用户列表(JSON) |

**创建文件 `apps/backend/src/server.ts`**：
Express app 工厂函数，配置：
- JSON body parser (1MB 限制)
- CORS (可配置 origin)
- JWT 认证中间件（排除 `/api/auth/*` 和 `/api/health`）
- 路由挂载
- 全局错误处理
- WebSocket 升级处理（挂载到 `/api/sandboxes/:id/pty` 路径）

**创建文件 `apps/backend/src/routes/health.ts`**：
`GET /api/health` — 返回 `{ status: "ok", timestamp }`，含 OpenSandbox Server 连通性检查。

**创建文件 `apps/backend/src/routes/auth.ts`**：
- `POST /api/auth/login` — 接收 `{ username, password }`，验证后返回 JWT
- `POST /api/auth/logout` — 使 session 失效
- `GET /api/auth/me` — 返回当前用户信息

**创建文件 `apps/backend/src/middleware/auth.ts`**：
JWT Bearer token 验证。WebSocket 连接时从 `?token=` query 参数提取 JWT。

### Step 4: 后端核心 — OpenSandbox SDK 集成

**创建文件 `apps/backend/src/services/sandboxService.ts`**：

初始化 `SandboxManager`（使用 `@alibaba-group/opensandbox` SDK），配置 `useServerProxy: true` 以通过 Server Proxy 访问沙箱内部服务。

关键方法：
- `listSandboxInfos()` → 获取沙箱列表
- `createSandbox(opts)` → 创建沙箱（image, env, timeout, networkPolicy）
- `killSandbox(id)` → 销毁沙箱
- `pauseSandbox(id)` → 暂停（rootfs 快照）
- `resumeSandbox(id)` → 恢复
- `connectSandbox(id)` → 获取 Sandbox 实例（缓存机制，用于文件/命令操作）

**创建文件 `apps/backend/src/routes/sandboxes.ts`**：
REST API 代理层，将前端请求转发到 OpenSandbox SDK：
- `GET /api/sandboxes` → 列表
- `POST /api/sandboxes` → 创建
- `GET /api/sandboxes/:id` → 详情
- `DELETE /api/sandboxes/:id` → 删除
- `POST /api/sandboxes/:id/pause` → 暂停
- `POST /api/sandboxes/:id/resume` → 恢复

### Step 5: 后端核心 — 文件操作与命令执行路由

**创建文件 `apps/backend/src/routes/files.ts`**：
代理 execd 文件系统 API（通过 Server Proxy）：
- `GET /api/sandboxes/:id/files?path=` → 目录列表
- `GET /api/sandboxes/:id/files/content?path=` → 读取文件内容
- `POST /api/sandboxes/:id/files/write` → 写入文件
- `DELETE /api/sandboxes/:id/files?path=` → 删除
- `POST /api/sandboxes/:id/files/mkdir` → 创建目录

**创建文件 `apps/backend/src/routes/commands.ts`**：
- `POST /api/sandboxes/:id/commands` → 执行命令，聚合 SSE 输出为单次响应

### Step 6: 后端核心 — PTY WebSocket 中转（最关键）

**创建文件 `apps/backend/src/websocket/ptyRelay.ts`**：

这是整个系统的数据面核心。数据流：

```
xterm.js (前端)
  ↔ WebSocket ws://backend:3000/api/sandboxes/{id}/pty?token=JWT
    ↔ 后端 ptyRelay.ts (双向帧转发)
      ↔ WebSocket ws://osb-server/v1/sandboxes/{id}/proxy/44772/pty/{sid}/ws
        ↔ OpenSandbox Server Proxy
          ↔ execd (沙箱内)
```

实现逻辑：
1. **连接建立**：从 query 参数验证 JWT → 调用 Server Proxy `POST /v1/sandboxes/{id}/proxy/44772/pty` 创建 PTY session → 获取 session_id → 打开到 Server Proxy 的 WebSocket
2. **双向帧转发**：
   - 客户端→execd：二进制帧 `0x00` + UTF-8 字节 (stdin)；JSON 帧 `{"type":"resize","cols":N,"rows":N}`
   - execd→客户端：二进制帧 `0x01` (stdout), `0x02` (stderr)；JSON 帧 `{"type":"exit","code":N}`
3. **连接清理**：任一方断开 → 关闭对端 → 从 ConnectionManager 移除

**创建文件 `apps/backend/src/websocket/connectionManager.ts`**：
追踪活跃连接：`Map<sandboxId, ActiveConnection>`，提供 `add/remove/getBySandbox/closeAll`，含空闲超时清理。

### Step 7: 前端核心 — 项目脚手架与 API 层

**创建文件**：
- `apps/frontend/vite.config.ts` — 代理 `/api` 到后端
- `apps/frontend/src/api/client.ts` — 类型化 fetch 封装，自动附加 JWT
- `apps/frontend/src/api/sandboxes.ts` — 沙箱 CRUD API 函数
- `apps/frontend/src/api/files.ts` — 文件操作 API 函数
- `apps/frontend/src/api/types.ts` — TypeScript 类型定义

### Step 8: 前端核心 — 页面与组件

**LoginPage** (`src/pages/LoginPage.tsx`)：简洁登录表单，亮色主题。

**DashboardPage** (`src/pages/DashboardPage.tsx`)：
- 沙箱列表网格视图，每张卡片显示：名称、镜像、状态(Running/Paused/Creating/Error)、创建时间
- 操作按钮：连接(Connect)、暂停/恢复、删除
- "创建沙箱"对话框

**SandboxPage** (`src/pages/SandboxPage.tsx`)：
- 左右分栏布局（可拖拽调整比例）
- 左面板：FileTree 文件浏览器
- 右面板：TerminalPane 终端区域（支持多标签页）
- 顶部栏：沙箱信息、新建终端按钮、返回按钮

**关键组件**：
- `SandboxList.tsx` — 沙箱列表渲染
- `CreateSandbox.tsx` — 创建表单（镜像、名称、超时、环境变量、资源限制）
- `TerminalPane.tsx` — xterm.js 封装，WebSocket 连接，二进制协议处理
- `FileTree.tsx` — 递归文件树，懒加载子目录

### Step 9: 前端核心 — xterm.js 集成

**创建文件 `apps/frontend/src/hooks/useTerminal.ts`**：

xterm.js 与 WebSocket 的集成 hook：
1. 创建 `Terminal` 实例 + `FitAddon`
2. 建立 WebSocket 连接到 `ws://backend/api/sandboxes/{id}/pty?token=JWT`
3. 终端 `onData` → 发送二进制帧 (`0x00` + UTF-8 bytes)
4. WebSocket `onmessage` 二进制 → 解析首字节 (`0x01`=stdout, `0x02`=stderr) → 写入终端
5. 终端 `onResize` → 发送 JSON resize 帧
6. 断线重连（指数退避）
7. 卸载时清理

### Step 10: 部署配置

**创建文件 `infra/helm/sandbox-platform/`**：

Helm chart 部署后端和前端到 K8s：
- `backend-deployment.yaml` — 1 replica，ConfigMap 注入环境变量，Secret 注入密钥
- `backend-service.yaml` — ClusterIP:3000
- `frontend-deployment.yaml` — 1 replica，nginx 提供 SPA 静态文件
- `frontend-service.yaml` — ClusterIP:80
- `ingress.yaml` — `sandbox.localhost` 路由规则
- `secrets.yaml` — API Key, JWT Secret

**`values-production.yaml` 覆盖**：
- replicaCount: 2-3
- 资源限制增加
- 启用 HPA
- TLS 证书
- 安全运行时 (gVisor/Kata)
- 网络策略
- Redis 会话存储
- OAuth2 认证

---

## 认证与安全设计

### 认证流程
1. 前端登录 → 后端签发 JWT
2. 后续请求携带 `Authorization: Bearer <token>`
3. WebSocket 通过 `?token=` 参数传递 JWT
4. 后端验证 JWT 后，使用 `OPEN-SANDBOX-API-KEY` 访问 OpenSandbox Server

### 安全隔离层次
1. **用户→后端**：JWT 认证 + 限流
2. **后端→OpenSandbox Server**：API Key 认证
3. **沙箱隔离**：独立 Pod + 可选 gVisor/Kata 安全运行时
4. **网络隔离**：Egress sidecar 白名单策略

---

## 通配符域名路由架构

### 核心机制

通过 OpenSandbox Server 的 `[ingress.gateway]` + OpenSandbox Ingress 组件 + K8s Ingress 三层协同，实现 `sandbox111-8989.rabbitai-lab.com` 直接访问沙箱 `sandbox111` 的 8989 端口。

### 三层架构

```
┌─────────────────────────────────────────────────────────────────┐
│ 第 1 层：DNS 解析                                                 │
│   *.rabbitai-lab.com → K8s 集群入口 (LoadBalancer / NodePort)      │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTP/WS 请求 (Host: sandbox111-8989.rabbitai-lab.com)
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ 第 2 层：K8s Ingress (nginx-ingress-controller)                   │
│   TLS 终结 + 通配符证书 (*.rabbitai-lab.com)                       │
│   根据 Host 规则路由到后端 Service                                  │
│   → backend: opensandbox-ingress:80                              │
└──────────────────────┬──────────────────────────────────────────┘
                       │ 请求透传 (Host 头保持不变)
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ 第 3 层：OpenSandbox Ingress 组件 (Go 反向代理)                     │
│   解析 Host 头: sandbox111-8989 → sandbox_id=sandbox111, port=8989│
│   查询 BatchSandbox CR informer 缓存获取 Pod IP                   │
│   代理请求到 ws://<pod-ip>:8989/<原始路径>                        │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ 沙箱 Pod (sandbox111)                                             │
│   main container: 用户服务监听 :8989                               │
│   execd: 命令/文件 API 监听 :44772                                 │
│   egress sidecar: (可选) 网络出口策略                               │
└─────────────────────────────────────────────────────────────────┘
```

### Server 配置如何驱动域名返回

当 `[ingress]` 配置为 `mode = "gateway"` 且 `gateway.address = "*.rabbitai-lab.com"`、`gateway.route.mode = "wildcard"` 时：

1. 调用 `GET /v1/sandboxes/{id}/endpoints/{port}` 时，Server 不再返回 Pod IP
2. 而是返回格式化的通配符域名 URL：`https://sandbox111-8989.rabbitai-lab.com`
3. SDK 客户端拿到的端点 URL 可直接用于浏览器访问或 API 调用

这意味着：
- **前端**可以直接在 iframe 中嵌入 `https://sandbox111-8989.rabbitai-lab.com` 来预览沙箱中的 Web 服务
- **后端 API** 可以返回端点 URL 供前端展示（如 "打开预览" 按钮）
- **WebSocket** 也能通过 `wss://sandbox111-8989.rabbitai-lab.com/ws` 连接沙箱内的 WS 服务

### Host 解析规则

OpenSandbox Ingress 解析 Host 头的规则：
- **格式**：`<sandbox-id>-<port>.<domain>`
- **解析**：最后一个连字符 `-` 前的部分为 sandbox ID，最后一段为端口号
- **示例**：`my-sandbox-8080.rabbitai-lab.com` → sandbox=`my-sandbox`, port=`8080`
- **边界情况**：sandbox ID 本身包含连字符也可正确解析（如 `my-prod-sandbox-8080` → sandbox=`my-prod-sandbox`, port=`8080`）

### 本地开发 vs 生产环境差异

| 维度 | 本地开发 (Docker Desktop) | 生产环境 |
|------|--------------------------|----------|
| DNS | 无通配符域名，使用 port-forward | `*.rabbitai-lab.com` → LB IP |
| Ingress mode | `direct` (Server Proxy) | `gateway` (通配符域名) |
| 端点 URL | `http://localhost:8080/v1/sandboxes/{id}/proxy/{port}` | `https://{id}-{port}.rabbitai-lab.com` |
| OpenSandbox Ingress | 不部署 | 部署为 K8s Deployment |
| K8s Ingress | 不需要 | 通配符证书 + TLS 终结 |
| execd 访问 | 通过 Server Proxy | 通过 Server Proxy 或直连域名 |

### 后端 API 扩展 — 端点查询

**新增路由** `apps/backend/src/routes/sandboxes.ts`：
- `GET /api/sandboxes/:id/endpoints/:port` — 返回沙箱端口的外部可访问 URL

```typescript
// 返回格式（生产环境）
{
  "url": "https://sandbox111-8989.rabbitai-lab.com",
  "scheme": "https",
  "host": "sandbox111-8989.rabbitai-lab.com",
  "port": 443
}

// 返回格式（本地开发，使用 Server Proxy）
{
  "url": "http://localhost:3000/api/sandboxes/sandbox111/proxy/8989",
  "scheme": "http",
  "host": "localhost:3000",
  "port": 3000
}
```

### 前端扩展 — 服务预览

**新增组件** `apps/frontend/src/components/sandbox/ServicePreview.tsx`：
- 在 SandboxPage 中增加 "服务预览" 面板
- 调用 `GET /api/sandboxes/:id/endpoints/:port` 获取外部 URL
- 使用 iframe 嵌入预览（生产环境直接用域名；本地开发走 Server Proxy）
- 支持用户自定义端口（沙箱可能暴露多个服务端口）

### DNS 配置（生产环境）

```dns
# 通配符 A 记录指向 K8s 入口
*.rabbitai-lab.com  A     <K8s-LoadBalancer-IP>

# 或 CNAME 指向 K8s Ingress Controller
*.rabbitai-lab.com  CNAME k8s-ingress.rabbitai-lab.com
```

TLS 证书通过 cert-manager + DNS01 challenge 自动签发通配符证书：
```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: rabbitai-lab-wildcard
  namespace: opensandbox-system
spec:
  secretName: rabbitai-lab-wildcard-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
  - "*.rabbitai-lab.com"
```

---

## 生产迁移要点

| 维度 | 开发 (Docker Desktop) | 生产 |
|------|----------------------|------|
| 运行时 | runc (默认) | gVisor / Kata |
| 认证 | 简单用户名密码 | OAuth2/OIDC |
| 会话存储 | 内存 Map | Redis |
| 副本数 | 1 | 2-3 + HPA |
| 网络 | 无限制 | Egress 白名单 |
| 镜像仓库 | 本地 | OCI Registry + 镜像签名 |
| TLS | 无 | cert-manager 自动证书 |
| 沙箱端点 | Server Proxy 转发 | `*.rabbitai-lab.com` 通配符域名直连 |
| DNS | port-forward | 通配符 A/CNAME 记录 |
| Ingress 模式 | `direct` | `gateway` + wildcard |

---

## 验证方案

### 本地开发验证（Docker Desktop，ingress mode=direct）
1. **基础设施验证**：`kubectl get pods -n opensandbox-system` 确认 OpenSandbox Controller + Server 运行
2. **Pool 验证**：`kubectl get pool -n opensandbox` 确认热备 Pod 就绪
3. **后端 API 验证**：`curl http://localhost:3000/api/health` 确认连通
4. **沙箱创建验证**：`curl -X POST localhost:3000/api/sandboxes` 创建沙箱，确认 Pod 创建成功
5. **终端验证**：前端创建沙箱 → 点击连接 → 在 xterm.js 中输入命令 → 观察输出
6. **文件树验证**：展开目录、查看文件内容
7. **暂停/恢复验证**：暂停沙箱 → 等待 Pod 销毁 → 恢复 → 确认文件系统状态保留

### 生产环境验证（ingress mode=gateway，通配符域名）
1. **DNS 验证**：`dig sandbox111-8989.rabbitai-lab.com` 确认解析到 K8s 入口 IP
2. **TLS 验证**：`curl -v https://sandbox111-8989.rabbitai-lab.com` 确认证书有效
3. **Ingress 路由验证**：在沙箱内启动 HTTP 服务（如 `python -m http.server 8989`），浏览器访问 `https://sandbox111-8989.rabbitai-lab.com` 确认响应来自沙箱
4. **WebSocket 验证**：在沙箱内启动 WS 服务，通过 `wss://sandbox111-8989.rabbitai-lab.com/ws` 连接确认双向通信
5. **端点 API 验证**：`GET /api/sandboxes/{id}/endpoints/8989` 确认返回通配符域名格式 URL
6. **多沙箱隔离验证**：创建两个沙箱，分别通过各自域名访问，确认流量不会串
7. **安全性验证**：沙箱内尝试 `curl http://内网服务` 确认 egress 策略生效

### 端到端集成测试
```bash
# 本地开发流程
1. kubectl port-forward svc/opensandbox-server 8080:80 -n opensandbox-system
2. cd apps/backend && pnpm dev  # 后端启动
3. cd apps/frontend && pnpm dev  # 前端启动
4. 浏览器访问 http://localhost:5173
5. 登录 → 创建沙箱 → 连接终端 → 执行命令 → 浏览文件 → 删除沙箱

# 生产环境流程
1. helm install opensandbox-controller ... -f values-production.yaml
2. kubectl apply -f ingress-deployment.yaml,sandbox-ingress.yaml
3. 浏览器访问 https://sandbox.rabbitai-lab.com (管理界面)
4. 创建沙箱 → 获取端点 URL → 通过域名直连沙箱服务
```

---

## 实施顺序

1. **项目脚手架** — monorepo 结构、依赖安装
2. **OpenSandbox 基础设施** — install.sh、values-dev.yaml、pool.yaml
3. **后端配置与基础路由** — config、server、health、auth
4. **后端 SDK 集成** — sandboxService、沙箱 CRUD 路由
5. **后端文件与命令路由** — files.ts、commands.ts
6. **后端 PTY 中转** — ptyRelay.ts、connectionManager.ts（最关键）
7. **前端脚手架与 API 层** — 项目初始化、API client
8. **前端页面与组件** — Login、Dashboard、Sandbox 页面
9. **前端 xterm.js 集成** — TerminalPane、useTerminal hook
10. **前端文件树** — FileTree 组件与 API 对接
11. **部署配置** — Helm chart、Dockerfile
12. **端到端验证** — 完整流程测试
