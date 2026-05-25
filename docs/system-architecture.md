# Sandbox-Manager 系统架构

## 整体架构概览

```mermaid
flowchart LR
    subgraph Client["客户端"]
        Browser["Browser"]
    end

    subgraph DNS["DNS 层"]
        Dnsmasq["dnsmasq<br/>127.0.0.1:53"]
        Resolver["macOS resolver<br/>/etc/resolver/sandbox.localhost"]
    end

    subgraph Ingress["Ingress 层 (唯一入口)"]
        NginxController["K8s Nginx<br/>Ingress Controller<br/>宿主机 :80<br/>hostNetwork"]
    end

    subgraph Services["服务层"]
        Frontend["Frontend<br/>Nginx :80<br/>React SPA"]
        Backend["Backend<br/>Express :3000<br/>REST + WebSocket"]
        OSServer["OpenSandbox Server<br/>:80<br/>沙箱管理 API"]
        Gateway["OpenSandbox<br/>Ingress Gateway<br/>opensandbox-system<br/>--mode=header"]
        SandboxPods["Sandbox Pods<br/>execd 容器"]
    end

    Browser --> Dnsmasq
    Dnsmasq --> Resolver
    Resolver --> NginxController

    NginxController -->|"sandbox.localhost"| Frontend
    NginxController -->|"sandbox.localhost"| Backend
    NginxController -->|"osb.sandbox.localhost"| OSServer
    NginxController -->|"*.sandbox.localhost"| Gateway
    Gateway --> SandboxPods

    Backend -.->|"SDK调用"| OSServer
    Backend -.->|"PTY WebSocket"| SandboxPods
```

## DNS 解析流程

```mermaid
sequenceDiagram
    participant B as Browser
    participant R as macOS Resolver
    participant D as dnsmasq
    participant I as Ingress Nginx

    B->>R: 查询 *.sandbox.localhost
    R->>D: 转发 DNS 查询 (127.0.0.1:53)
    D-->>R: 返回 127.0.0.1
    R-->>B: 返回 127.0.0.1
    B->>I: HTTP 请求 (Host: xxx.sandbox.localhost)
```

**dnsmasq 配置规则**（动态生成）:

```bash
# /etc/dnsmasq.d/sandbox-domains.conf
address=/sandbox.localhost/127.0.0.1
# 通配符语法：address=/domain/ip 会覆盖所有子域名
```

**macOS resolver 配置**:

```bash
# /etc/resolver/sandbox.localhost
nameserver 127.0.0.1
```

## 三条 Ingress 路由

所有流量统一经过 **K8s Nginx Ingress Controller**，通过 HTTP Host 头匹配分发：

```mermaid
flowchart TB
    subgraph IngressController["K8s Nginx Ingress Controller (唯一入口)"]
        IngressNginx["监听宿主机 :80<br/>hostNetwork: true"]
    end

    subgraph RouteA["路由 A: Platform"]
        PlatformIngress["K8s Ingress: sandbox-platform<br/>namespace: default<br/>host: sandbox.localhost"]
        FrontendSvc["Frontend Service<br/>:80 (Nginx SPA)"]
        BackendSvc["Backend Service<br/>:3000 (Express API)"]
    end

    subgraph RouteB["路由 B: OpenSandbox Server"]
        ServerIngress["K8s Ingress: sandbox-server-ingress<br/>namespace: opensandbox-system<br/>host: osb.sandbox.localhost"]
        OSServerSvc["OpenSandbox Server<br/>:80 (沙箱管理 API)"]
    end

    subgraph RouteC["路由 C: Sandbox Traffic"]
        WildcardIngress["K8s Ingress: sandbox-wildcard-ingress<br/>namespace: opensandbox-system<br/>host: *.sandbox.localhost"]
        GatewaySvc["OpenSandbox Ingress Gateway<br/>Service: opensandbox-ingress-gateway:80<br/>Pod: :28888 --mode=header"]
        SandboxPod["Sandbox Pod<br/>execd 容器"]
    end

    IngressNginx --> PlatformIngress
    PlatformIngress --> FrontendSvc
    PlatformIngress --> BackendSvc

    IngressNginx --> ServerIngress
    ServerIngress --> OSServerSvc

    IngressNginx --> WildcardIngress
    WildcardIngress --> GatewaySvc
    GatewaySvc -->|"Host header 路由"| SandboxPod
```

### 路由对照表

| Host 匹配 | K8s Ingress 资源 | Namespace | 后端 Service | 用途 |
|-----------|------------------|-----------|--------------|------|
| `sandbox.localhost` | `sandbox-platform` | default (Helm release ns) | Frontend(:80) + Backend(:3000) | Web UI + REST API + WebSocket |
| `osb.sandbox.localhost` | `sandbox-server-ingress` | opensandbox-system | opensandbox-server(:80) | 沙箱管理 API (SDK 调用) |
| `*.sandbox.localhost` | `sandbox-wildcard-ingress` | opensandbox-system | opensandbox-ingress-gateway(:80) → Sandbox Pods | 沙箱 Web 服务访问 |

### K8s Ingress 资源说明

系统中有**三个 K8s Ingress 资源**（注意：不是 Ingress Controller），它们定义了 HTTP Host 头到 K8s Service 的路由规则：

| K8s Ingress 名称 | Namespace | 定义文件 | 说明 |
|------------------|-----------|----------|------|
| `sandbox-platform` | default | `infra/helm/sandbox-platform/templates/ingress.yaml` | Platform 的 Web UI 和 API 路由，由 Helm chart 管理 |
| `sandbox-server-ingress` | opensandbox-system | `infra/opensandbox/server-ingress.yaml` | OpenSandbox Server API 路由，由 infraRunner 动态生成 |
| `sandbox-wildcard-ingress` | opensandbox-system | `infra/opensandbox/sandbox-ingress.yaml` | 沙箱流量通配符路由，由 infraRunner 动态生成 |

> 三个 Ingress 资源都使用 `ingressClassName: nginx`，由同一个 **K8s Nginx Ingress Controller** 处理。

> 注：`sandbox-server-ingress` 和 `sandbox-wildcard-ingress` 的 yaml 文件是参考模板，实际安装时由 `infraRunner.ts` 的 `generateIngressResources()` 函数根据配置的域名动态生成并应用到集群。

### OpenSandbox Ingress Gateway 说明

**OpenSandbox Ingress Gateway** 是 OpenSandbox 项目提供的沙箱流量网关组件：

| 属性 | 值 |
|------|-----|
| **部署位置** | `opensandbox-system` namespace |
| **Service** | `opensandbox-ingress-gateway:80`（容器实际端口 :28888） |
| **路由模式** | `--mode=header`，通过解析 HTTP Host header 中的 sandbox ID 路由到对应 Pod |
| **作用** | 作为 K8s Ingress Nginx 的第二层路由，在多个 Sandbox Pod 间分发流量 |

> 注意：Helm chart 默认配置 `routeMode: wildcard`，但 InfraRunner 在安装后会 patch 为 `--mode=header`，参见 `infraRunner.ts:399-408`

## 典型请求链路

### 1. Web UI 访问

```mermaid
sequenceDiagram
    participant B as Browser
    participant D as dnsmasq
    participant I as Ingress Nginx
    participant F as Frontend Pod

    B->>D: DNS 查询 sandbox.localhost
    D-->>B: 127.0.0.1
    B->>I: GET / (Host: sandbox.localhost)
    I->>F: 路由到 Frontend Service
    F-->>I: React SPA 静态文件
    I-->>B: HTTP 200
```

### 2. API 调用

```mermaid
sequenceDiagram
    participant B as Browser
    participant I as Ingress Nginx
    participant BE as Backend Pod
    participant SDK as OpenSandbox SDK
    participant OS as OpenSandbox Server

    B->>I: GET /api/sandboxes (Host: sandbox.localhost)
    I->>BE: 路由到 Backend Service
    BE->>SDK: SandboxManager.listSandboxes()
    SDK->>OS: HTTP API 调用 (osb.sandbox.localhost)
    OS-->>SDK: Sandbox 列表
    SDK-->>BE: 返回结果
    BE-->>I: JSON 响应
    I-->>B: HTTP 200
```

### 3. PTY WebSocket 终端

```mermaid
sequenceDiagram
    participant XT as xterm.js
    participant I as Ingress Nginx
    participant BE as Backend PtyRelay
    participant PROXY as execd Proxy
    participant SB as Sandbox Container

    XT->>I: WebSocket 升级 /api/sandboxes/:id/pty
    I->>BE: WS 连接建立
    BE->>PROXY: HTTP POST /pty (创建 session)
    PROXY-->>BE: session_id
    BE->>PROXY: WebSocket 连接 /pty/:session_id/ws
    loop 双向中继
        XT-->>BE: stdin (binary frame)
        BE-->>PROXY:转发 stdin
        PROXY-->>BE: stdout/stderr (binary frame)
        BE-->>XT:转发输出
    end
```

### 4. Sandbox Web 服务访问

```mermaid
sequenceDiagram
    participant B as Browser
    participant D as dnsmasq
    participant I as Ingress Nginx
    participant GW as OpenSandbox Gateway<br/--mode=header)
    participant SB as Sandbox Pod

    B->>D: DNS 查询 abc123.sandbox.localhost
    D-->>B: 127.0.0.1
    B->>I: GET / (Host: abc123.sandbox.localhost)
    I->>GW: Wildcard Ingress 路由
    GW->>GW: 解析 Host header 获取 sandbox ID
    GW->>SB: 路由到对应 Sandbox Pod
    SB-->>GW: HTTP 响应
    GW-->>I: 返回响应
    I-->>B: HTTP 200
```

## 关键文件索引

| 文件路径 | 作用 |
|----------|------|
| `infra/helm/sandbox-platform/templates/ingress.yaml` | K8s Ingress `sandbox-platform` 定义 (default ns) |
| `infra/opensandbox/sandbox-ingress.yaml` | K8s Ingress `sandbox-wildcard-ingress` 参考模板 (opensandbox-system ns) |
| `infra/opensandbox/server-ingress.yaml` | K8s Ingress `sandbox-server-ingress` 参考模板 (opensandbox-system ns) |
| `apps/backend/src/services/infraRunner.ts` | 动态生成 `sandbox-server-ingress` + `sandbox-wildcard-ingress` 资源 |
| `apps/backend/src/services/envCheckService.ts` | dnsmasq 配置生成 |
| `apps/backend/src/websocket/ptyRelay.ts` | PTY WebSocket 双向中继 |
| `apps/frontend/Dockerfile` | 前端 Nginx 代理配置 (生产模式) |
| `apps/frontend/vite.config.ts` | 前端 Vite dev proxy (开发模式) |

## 核心要点总结

1. **唯一入口**：所有流量都经过 K8s Nginx Ingress Controller（宿主机 :80，hostNetwork）
2. **Host 头路由**：三条路由通过 HTTP Host 头匹配，由三个不同的 Ingress 资源定义
3. **第二层路由**：OpenSandbox Ingress Gateway 使用 `--mode=header` 在 Sandbox Pod 间分发
4. **DNS 通配**：dnsmasq 的 `address=/domain/ip` 语法自动覆盖所有子域名
5. **WebSocket 支持**：Ingress 注解 `websocket-services` + 3600s 超时配置