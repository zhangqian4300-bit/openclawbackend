# OpenClaw 后端架构优化方案

## 一、架构演进路线

### 1.0 当前架构（快速原型）
```
前端 → Backend API → Gateway(新建WS) → MCP(stdio) → 返回
```
- 问题：每次请求都新建连接，效率低

### 2.0 连接池架构（推荐优先实现）
```
┌─────────┐     ┌──────────────────────────────────────────────┐
│  前端   │     │              Backend Service                  │
└────┬────┘     │  ┌─────────────────────────────────────────┐ │
     │          │  │         WebSocket Connection Pool        │ │
     │ WS/HTTP  │  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │ │
     └─────────▶│  │  │ WS1 │ │ WS2 │ │ WS3 │ │ WS4 │       │ │
                │  │  └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘       │ │
                │  └─────┼──────┼──────┼──────┼────────────┘ │
                │        │      │      │      │              │
                │        └──────┴──────┴──────┘              │
                │                 │                          │
                │                 ▼                          │
                │        ┌───────────────┐                   │
                │        │ OpenClaw GW   │                   │
                │        │ (持久连接)    │                   │
                │        └───────────────┘                   │
                └──────────────────────────────────────────────┘
```
- 优点：复用连接，减少握手开销
- 延迟降低 50%+

### 3.0 微服务架构（生产级）
```
┌──────────┐    ┌────────────┐    ┌─────────────┐    ┌───────────┐
│  前端    │───▶│ API Gateway│───▶│  消息队列   │───▶│ Worker节点│
│ (多端)   │    │ (限流/认证)│    │  (Redis)    │    │ (多个)    │
└──────────┘    └────────────┘    └─────────────┘    └─────┬─────┘
                                                             │
                      ┌──────────────────────────────────────┘
                      │
                      ▼
               ┌─────────────┐    ┌─────────────┐
               │ OpenClaw GW │───▶│ MCP Server  │
               │ (集群)      │    │ (HTTP模式)  │
               └─────────────┘    └─────────────┘
                      │
                      ▼
               ┌─────────────┐
               │  缓存层     │
               │ (Redis)     │
               └─────────────┘
```

---

## 二、具体优化项

### 优化 1: WebSocket 连接池

**问题**：每次请求都新建 WebSocket 连接，握手开销 ~100ms

**解决方案**：
```javascript
class ConnectionPool {
  constructor(maxConnections = 10) {
    this.pool = [];
    this.maxConnections = maxConnections;
  }

  async getConnection() {
    // 从池中获取空闲连接
    const idle = this.pool.find(c => c.idle);
    if (idle) {
      idle.idle = false;
      return idle;
    }

    // 池未满，新建连接
    if (this.pool.length < this.maxConnections) {
      const conn = await this.createConnection();
      this.pool.push(conn);
      return conn;
    }

    // 等待空闲连接
    return this.waitForIdle();
  }

  releaseConnection(conn) {
    conn.idle = true;
  }
}
```

**效果**：延迟降低 50-70%

---

### 优化 2: MCP Server 改为 HTTP 模式

**问题**：stdio 模式每次启动新进程，开销 ~200ms

**解决方案**：MCP Server 改为 HTTP 服务，常驻内存

```javascript
// mcp-server/http-server.js
import express from 'express';

const app = express();
app.use(express.json());

// 工具注册
const tools = {
  counseling_query: async (params) => { /* ... */ },
  // 其他工具...
};

// HTTP 接口
app.post('/invoke', async (req, res) => {
  const { tool, params } = req.body;
  const result = await tools[tool](params);
  res.json(result);
});

// 健康检查
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(4001, () => console.log('MCP HTTP Server on :4001'));
```

**OpenClaw 配置**：
```json
{
  "mcp": {
    "servers": {
      "counseling": {
        "type": "http",
        "url": "http://localhost:4001"
      }
    }
  }
}
```

**效果**：响应时间从 ~300ms 降到 ~20ms

---

### 优化 3: 缓存层

**问题**：相同查询重复调用

**解决方案**：
```javascript
import Redis from 'ioredis';
const redis = new Redis();

async function queryWithCache(key, fetcher, ttl = 300) {
  // 1. 查缓存
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  // 2. 查数据库/API
  const result = await fetcher();

  // 3. 写缓存
  await redis.setex(key, ttl, JSON.stringify(result));
  return result;
}

// 使用
app.tool('counseling_query', async (params) => {
  const cacheKey = `counseling:${params.action}`;
  return queryWithCache(cacheKey, () => fetchData(params));
});
```

**效果**：重复查询延迟 < 5ms

---

### 优化 4: 消息队列（异步处理）

**问题**：高峰期请求可能超时

**解决方案**：
```javascript
import Queue from 'bull';

const jobQueue = new Queue('openclaw-jobs', 'redis://localhost:6379');

// 生产者：提交任务
app.post('/api/chat', async (req, res) => {
  const job = await jobQueue.add({
    message: req.body.message,
    sessionId: req.body.sessionId
  });
  res.json({ jobId: job.id, status: 'pending' });
});

// 消费者：处理任务
jobQueue.process(async (job) => {
  const result = await invokeOpenClaw(job.data);
  return result;
});

// 客户端轮询结果
app.get('/api/jobs/:id', async (req, res) => {
  const job = await jobQueue.getJob(req.params.id);
  res.json({
    status: await job.getState(),
    result: job.returnvalue
  });
});
```

---

### 优化 5: 流式输出优化

**当前问题**：模拟流式，实际等待完整响应后分段发送

**优化方案**：真正的流式输出

```javascript
async function* streamFromGateway(sessionId, message) {
  const ws = await getConnection();

  // 发送请求
  ws.send(JSON.stringify({
    type: 'req',
    method: 'agent',
    params: { message, sessionId }
  }));

  // 流式接收
  for await (const event of ws.events()) {
    if (event.type === 'agent.chunk') {
      yield event.text; // 实时返回每个 chunk
    }
    if (event.type === 'agent.done') {
      break;
    }
  }
}

// 使用 SSE 推送给前端
app.post('/api/chat/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');

  for await (const chunk of streamFromGateway(sessionId, message)) {
    res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
  }

  res.write('data: [DONE]\n\n');
  res.end();
});
```

---

## 三、推荐的优化顺序

| 优先级 | 优化项 | 工作量 | 收益 |
|--------|--------|--------|------|
| P0 | WebSocket 连接池 | 1天 | 延迟降低50% |
| P0 | 缓存层 | 0.5天 | 重复查询提速10x |
| P1 | MCP 改 HTTP | 1天 | 响应时间降低90% |
| P1 | 真正的流式输出 | 1天 | 用户体验提升 |
| P2 | 消息队列 | 2天 | 支持高并发 |
| P2 | API Gateway | 2天 | 安全、限流 |
| P3 | 多 Gateway 集群 | 3天 | 高可用 |

---

## 四、优化后的架构图

```
┌────────────────────────────────────────────────────────────────────────┐
│                            用户层                                       │
│   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐               │
│   │ Web App │   │ iOS App │   │ Android │   │ 小程序  │               │
│   └────┬────┘   └────┬────┘   └────┬────┘   └────┬────┘               │
└────────┼─────────────┼─────────────┼─────────────┼─────────────────────┘
         │             │             │             │
         └─────────────┴──────┬──────┴─────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         API Gateway (Kong/Nginx)                       │
│   ┌─────────────────────────────────────────────────────────────────┐ │
│   │  限流 │ 认证 │ 日志 │ 监控 │ 负载均衡 │ 灰度发布               │ │
│   └─────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│  Backend Node 1 │        │  Backend Node 2 │        │  Backend Node N │
│  ┌───────────┐  │        │  ┌───────────┐  │        │  ┌───────────┐  │
│  │ WS Pool   │  │        │  │ WS Pool   │  │        │  │ WS Pool   │  │
│  │ [■][■][■] │  │        │  │ [■][■][■] │  │        │  │ [■][■][■] │  │
│  └─────┬─────┘  │        └─────┬─────┘  │        └─────┬─────┘  │
│        │        │              │        │              │        │
│  ┌─────┴─────┐  │        ┌─────┴─────┐  │        ┌─────┴─────┐  │
│  │  Cache    │  │        │  Cache    │  │        │  Cache    │  │
│  │ (本地)    │  │        │ (本地)    │  │        │ (本地)    │  │
│  └───────────┘  │        └───────────┘  │        └───────────┘  │
└────────┬────────┘        └────────┬────────┘        └────────┬────────┘
         │                          │                          │
         └──────────────────────────┼──────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         Redis Cluster                                  │
│   ┌─────────────────────────────────────────────────────────────────┐ │
│   │  会话存储 │ 缓存 │ 消息队列 │ 发布订阅                          │ │
│   └─────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│ OpenClaw GW #1  │        │ OpenClaw GW #2  │        │ OpenClaw GW #N  │
│  (持久连接)     │        │  (持久连接)     │        │  (持久连接)     │
└────────┬────────┘        └────────┬────────┘        └────────┬────────┘
         │                          │                          │
         └──────────────────────────┼──────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         MCP Server Cluster                             │
│   ┌─────────────────────────────────────────────────────────────────┐ │
│   │  HTTP 模式，常驻内存，支持水平扩展                              │ │
│   │  counseling-query │ xinshi-assessment │ other-tools...         │ │
│   └─────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘

                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         数据层                                         │
│   ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐         │
│   │ PostgreSQL│  │  MongoDB  │  │  Elasticsearch│ │  OSS/S3 │         │
│   └───────────┘  └───────────┘  └───────────┘  └───────────┘         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 五、快速实现：连接池版本

我可以立即实现连接池版本，预计延迟降低 50%+。要开始吗？