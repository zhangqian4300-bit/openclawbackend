# OpenClaw Backend Framework

把 OpenClaw 封装成标准 HTTP 后端服务的框架。

---

## 架构总览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              用户层                                      │
│                    (前端 Web/App/小程序)                                 │
└─────────────────────────────┬───────────────────────────────────────────┘
                              │ HTTP/WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           你的后端服务                                   │
│                        (本框架提供)                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  app.chat()     → 通用聊天接口                                    │   │
│  │  app.tool()     → 注册工具供 AI 调用                              │   │
│  │  app.skill()    → 注册 Skill 路由                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────┬───────────────────────────────────────────┘
                              │ WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        OpenClaw Gateway                                 │
│                     (AI 中间件/大脑)                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  1. 理解用户自然语言意图                                          │   │
│  │  2. 匹配 Skill 和 Tool                                           │   │
│  │  3. 调用后端工具获取数据                                          │   │
│  │  4. AI 整理后返回给用户                                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────┬───────────────────────────────────────────┘
                              │ stdio
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           MCP Server                                    │
│                      (你定义的工具服务)                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 核心概念

### 概念 1: Gateway（网关）

**是什么：** OpenClaw 的核心，是一个 AI 中间件。

**做什么：**
- 接收用户自然语言
- 理解意图
- 调用工具
- 返回整理后的回复

**如何启动：**
```bash
openclaw gateway --port 19000
```

---

### 概念 2: Tool（工具）

**是什么：** 后端函数，AI 可以调用的能力。

**数据流：**
```
用户: "查询用户信息"
    ↓
Gateway 识别意图
    ↓
Gateway 调用 Tool: get_user({userId: "123"})
    ↓
Tool 返回: {name: "张三", age: 25}
    ↓
Gateway 整理成友好文字返回用户
```

**如何定义 Tool（两种方式）：**

**方式 1: 在后端注册（HTTP API）**
```javascript
// 你的后端服务
app.tool('get_user', async (params) => {
  // params = {userId: "123"}
  const user = await db.getUser(params.userId);
  return user;  // 返回 JSON
});

// 工具暴露在: POST /_tool/get_user
```

**方式 2: MCP Server（推荐）**
```javascript
// mcp-server/my-tool.js
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'get_user') {
    const user = await db.getUser(args.userId);
    return { content: [{ type: 'text', text: JSON.stringify(user) }] };
  }
});
```

注册到 OpenClaw 配置：
```json
// ~/.openclaw/openclaw.json
{
  "mcp": {
    "servers": {
      "my-tools": {
        "command": "node",
        "args": ["/path/to/mcp-server/my-tool.js"]
      }
    }
  }
}
```

---

### 概念 3: Skill（技能）

**是什么：** 定义 AI 如何响应特定话题的配置文件。

**文件位置：** `~/.openclaw/skills/{skill-name}/SKILL.md`

**结构：**
```yaml
---
name: my-skill
description: 技能描述 - 关键词："关键词1"、"关键词2"
metadata:
  openclaw:
    emoji: "🎯"
    always: false
---

# SKILL 内容

## 触发条件
- "关键词1" → 执行操作1
- "关键词2" → 执行操作2

## 如何响应
调用相关工具，用友好语气回复用户。
```

**作用：**
1. 告诉 AI 什么时候触发这个技能
2. 定义 AI 的角色和回复风格
3. 指定使用哪些工具

---

## 接入步骤

### 步骤 1: 安装 OpenClaw CLI

```bash
npm install -g openclaw
```

### 步骤 2: 初始化设备

```bash
openclaw config
```

这会生成设备身份文件：`~/.openclaw/identity/device.json`

### 步骤 3: 启动 Gateway

```bash
openclaw gateway --port 19000 &
```

### 步骤 4: 创建你的后端服务

```javascript
// server.js
import { OpenClawBackend } from 'openclaw-backend-framework';

const app = new OpenClawBackend({ port: 3000 });

// 1. 注册聊天接口（用户消息入口）
app.chat('/api/chat');

// 2. 注册工具（AI 可调用）
app.tool('my_query', async (params) => {
  // 你的业务逻辑
  return { data: "查询结果" };
});

// 3. 启动服务
app.start();
```

### 步骤 5: 创建 Skill 定义

```bash
mkdir -p ~/.openclaw/skills/my-skill
```

```yaml
# ~/.openclaw/skills/my-skill/SKILL.md
---
name: my-skill
description: 我的技能描述
---

## 触发条件
用户提及 "关键词" 时触发。

## 如何响应
调用 my_query 工具，用友好语气回复。
```

### 步骤 6: 配置 OpenClaw 加载 Skill

```json
// ~/.openclaw/openclaw.json
{
  "skills": {
    "load": {
      "extraDirs": ["~/.openclaw/skills"]
    }
  }
}
```

### 步骤 7: 测试

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "你好", "sessionId": "test"}'
```

---

## API 参考

### `new OpenClawBackend(config)`

创建框架实例。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `config.port` | number | `3000` | HTTP 服务器端口 |
| `config.gatewayUrl` | string | - | OpenClaw Gateway 完整地址 |
| `config.gatewayPort` | number | - | OpenClaw Gateway 端口 |
| `config.gatewayHost` | string | `127.0.0.1` | Gateway 主机 |
| `config.session.mode` | string | `memory` | 会话存储：`memory` / `redis` |
| `config.session.timeout` | number | `3600000` | 会话过期时间（毫秒） |
| `config.logLevel` | string | `info` | 日志级别：`debug` / `info` / `warn` / `error` |

### `app.chat(path, sessionIdFn)`

注册通用聊天接口。

```javascript
app.chat('/chat', (req) => req.body.sessionId || req.ip);
```

### `app.tool(name, handler)`

注册工具（OpenClaw 可调用的后端接口）。

```javascript
app.tool('getUser', async ({ userId }) => {
  return db.get('SELECT * FROM users WHERE id = ?', [userId]);
});
```

### `app.skill(name, options)`

注册 Skill 路由。

```javascript
app.skill('my-skill', {
  path: '/skill',
  sessionId: (req) => req.body.userId,
  actions: {
    start: { message: '开始' },
    submit: { message: (req) => req.body.message }
  }
});
```

### `app.post(path, handler)`

注册自定义 POST 路由。

```javascript
app.post('/api/custom', async (req, res, client) => {
  const result = await client.invoke('session-1', req.body.message);
  res.json(result);
});
```

### `app.use(middleware)`

注册中间件。

```javascript
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});
```

### `app.start()` / `app.stop()`

启动/停止服务。

---

## 配置方式

### 环境变量

创建 `.env` 文件：

```bash
# 服务器端口
SERVER_PORT=3000

# Gateway 配置（选一种）
OPENCLAW_GATEWAY_PORT=19000
# OPENCLAW_GATEWAY_URL=ws://127.0.0.1:19000

# 会话配置
SESSION_MODE=memory
SESSION_TIMEOUT=3600000

# 日志级别
LOG_LEVEL=info
```

### 自动检测

不配置任何值时，框架会自动尝试常见端口：`18789, 19000, 8080, 9000`

---

## 示例

### 示例 1: 最简聊天服务

```javascript
import { OpenClawBackend } from 'openclaw-backend-framework';

const app = new OpenClawBackend({ port: 3000 });
app.chat();
app.start();
```

### 示例 2: 带工具注册

```javascript
import { OpenClawBackend } from 'openclaw-backend-framework';

const app = new OpenClawBackend({ port: 3000 });

app.tool('echo', async (params) => {
  return { message: params.message, time: new Date().toISOString() };
});

app.chat();
app.start();
```

### 示例 3: 带数据库查询

```javascript
import { OpenClawBackend } from 'openclaw-backend-framework';
import sqlite from 'sqlite3';

const db = sqlite.database('app.db');
const app = new OpenClawBackend({ port: 3000 });

app.tool('getUser', async ({ userId }) => {
  return new Promise((resolve) => {
    db.get('SELECT * FROM users WHERE id = ?', [userId], (_, row) => resolve(row));
  });
});

app.tool('saveResult', async ({ userId, result }) => {
  return new Promise((resolve) => {
    db.run('INSERT INTO results (userId, result) VALUES (?, ?)', [userId, JSON.stringify(result)], () => {
      resolve({ success: true });
    });
  });
});

app.chat();
app.start();
```

---

## 故障排查

### Gateway 未运行

```
❌ Failed to start: 未找到 OpenClaw Gateway

解决：
openclaw gateway --port 19000 &
```

### 端口被占用

```
Error: listen EADDRINUSE: address already in use :::3000

解决：
SERVER_PORT=3001 npm start
```

### CORS 错误

框架已默认启用 CORS，如果还有问题检查：
- 浏览器缓存
- 代理服务器配置

---

## 生产环境部署

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

### 环境变量

```bash
# .env.production
SERVER_PORT=3000
OPENCLAW_GATEWAY_URL=ws://openclaw.internal:19000
LOG_LEVEL=warn
```

### 进程管理（PM2）

```bash
pm2 start server.js --name openclaw-backend
pm2 save
```

---

## License

MIT