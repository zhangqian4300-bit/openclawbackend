# OpenClaw Backend Framework

把 OpenClaw 封装成标准 HTTP 后端服务的框架。

## 特点

- ⚡ **3 分钟上手** - 只需几行代码就能启动服务
- 🔌 **自动检测** - 自动发现 OpenClaw Gateway 端口
- 🛠️ **工具注册** - 让 OpenClaw 调用你的后端接口
- 📦 **Skill 路由** - 自动为 Skill 生成 HTTP 端点
- 🔧 **灵活配置** - 支持环境变量、配置文件等多种方式

---

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 确保 OpenClaw Gateway 运行

```bash
openclaw gateway --port 19000 &
```

### 3. 启动服务

```bash
npm start
```

### 4. 测试

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "你好"}'
```

---

## 使用方法

### 基础用法

```javascript
import { OpenClawBackend } from 'openclaw-backend-framework';

const app = new OpenClawBackend({ port: 3000 });

// 注册通用聊天接口
app.chat();

app.start();
```

### 注册 Skill

```javascript
import { OpenClawBackend } from 'openclaw-backend-framework';

const app = new OpenClawBackend({ port: 3000 });

// 注册心石清理师 Skill
app.skill('xinshi-assessment', {
  path: '/assessment',
  sessionId: (req) => req.body.userId || 'default'
});

app.start();

// 自动暴露：
// POST /assessment/start
// POST /assessment/submit
```

### 注册工具（OpenClaw 可调用）

```javascript
import { OpenClawBackend } from 'openclaw-backend-framework';
import sqlite from 'sqlite3';

const db = sqlite.database('app.db');
const app = new OpenClawBackend({ port: 3000 });

// 注册工具
app.tool('getUser', async ({ userId }) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
});

app.tool('saveAssessment', async ({ userId, result }) => {
  await db.insert('assessments', { userId, result });
  return { success: true };
});

app.start();

// 工具暴露在：POST /_tool/{name}
```

### 自定义路由

```javascript
import { OpenClawBackend } from 'openclaw-backend-framework';

const app = new OpenClawBackend({ port: 3000 });

app.post('/custom', async (req, res, client) => {
  const { sessionId, message } = req.body;
  const result = await client.invoke(sessionId, message);
  res.json(result);
});

app.start();
```

### 使用中间件

```javascript
import { OpenClawBackend } from 'openclaw-backend-framework';

const app = new OpenClawBackend({ port: 3000 });

// 日志中间件
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// 限流中间件
app.use((req, res, next) => {
  const count = rateLimit.get(req.ip) || 0;
  if (count > 100) return res.status(429).json({ error: 'Too many requests' });
  next();
});

app.chat();
app.start();
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

### `app.skill(name, options)`

注册 Skill 路由。

```javascript
app.skill('xinshi-assessment', {
  path: '/assessment',
  sessionId: (req) => req.body.userId,
  actions: {
    start: { message: '开始测评' },
    submit: { message: (req) => req.body.message }
  }
});
```

### `app.tool(name, handler)`

注册工具（OpenClaw 可调用的后端接口）。

```javascript
app.tool('getUser', async ({ userId }) => {
  return db.get('SELECT * FROM users WHERE id = ?', [userId]);
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

### `app.start()`

启动服务。

```javascript
await app.start();
```

### `app.stop()`

停止服务。

```javascript
app.stop();
```

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
# OPENCLAW_GATEWAY_AUTO=true

# 会话配置
SESSION_MODE=memory
SESSION_TIMEOUT=3600000

# 日志级别
LOG_LEVEL=info
```

### 自动检测

不配置任何值时，框架会自动尝试常见端口：`18789, 19000, 8080, 9000`

```javascript
const app = new OpenClawBackend();
app.start();
// 自动检测 Gateway 端口
```

---

## 示例

### 示例 1: 最简聊天服务

```javascript
import { OpenClawBackend } from 'openclaw-backend-framework';

const app = new OpenClawBackend({ port: 3000 });
app.chat();
app.start();
```

### 示例 2: 心石清理师

```javascript
import { OpenClawBackend } from 'openclaw-backend-framework';

const app = new OpenClawBackend({ port: 3000 });

app.skill('xinshi-assessment', {
  path: '/assessment',
  sessionId: (req) => `xinshi-${req.body.userId}`
});

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

app.skill('xinshi-assessment', { path: '/assessment' });

app.start();
```

---

## 测试

```bash
# 运行测试
npm test

# 运行示例
npm run demo
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
