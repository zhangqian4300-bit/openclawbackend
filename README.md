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
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  counseling_query → 查询心理咨询师                                │   │
│  │  custom_tool      → 你的自定义工具                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
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
用户: "查询心理咨询师列表"
    ↓
Gateway 识别意图
    ↓
Gateway 调用 Tool: counseling_query({action: "list_counselors"})
    ↓
Tool 返回: {counselors: [李心怡, 张明远]}
    ↓
Gateway 整理成友好文字返回用户
```

**如何定义 Tool（两种方式）：**

**方式 1: 在后端注册（HTTP API）**
```javascript
// 你的后端服务
app.tool('counseling_query', async (params) => {
  // params = {action: "list_counselors"}
  const result = await database.query(params);
  return result;  // 返回 JSON
});

// 工具暴露在: POST /_tool/counseling_query
```

**方式 2: MCP Server（推荐）**
```javascript
// mcp-server/my-tool.js
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'counseling_query') {
    const result = await queryDatabase(args);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
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
name: counseling-query
description: 心理咨询资源查询 - 关键词："心理咨询师"、"预约咨询"
metadata:
  openclaw:
    emoji: "🧘"
    always: false
---

# SKILL 内容

## 触发条件
- "心理咨询师列表" → 查询咨询师
- "心理咨询多少钱" → 查询价格

## 如何响应
使用 counseling_query 工具获取数据，用温暖语气回复用户。
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

## 完整示例：心理咨询查询系统

### 文件结构

```
your-project/
├── server.js                    # 后端服务
├── mcp-server/
│   └── counseling-mcp.js        # MCP 工具服务
└── package.json

~/.openclaw/
├── openclaw.json               # OpenClaw 配置
├── identity/
│   └── device.json             # 设备身份
└── skills/
    └── counseling-query/
        └── SKILL.md            # Skill 定义
```

### 1. MCP Server 定义

```javascript
// mcp-server/counseling-mcp.js
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server({ name: 'counseling-server', version: '1.0.0' }, { capabilities: { tools: {} } });

// 定义工具列表
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'counseling_query',
    description: '心理咨询资源查询工具',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list_counselors', 'get_pricing'] }
      },
      required: ['action']
    }
  }]
}));

// 处理工具调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'counseling_query') {
    // 你的业务逻辑
    const data = {
      list_counselors: [
        { name: '李心怡', specialty: '情绪管理' },
        { name: '张明远', specialty: '职场压力' }
      ],
      get_pricing: [
        { type: '个人咨询', price: '300元/小时' }
      ]
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(data[args.action] || {}) }]
    };
  }
});

// 启动
const transport = new StdioServerTransport();
server.connect(transport);
```

### 2. Skill 定义

```yaml
# ~/.openclaw/skills/counseling-query/SKILL.md
---
name: counseling-query
description: 心理咨询资源查询。关键词："心理咨询师"、"预约咨询"、"价格"
metadata:
  openclaw:
    emoji: "🧘"
    always: false
---

# 心理咨询资源查询

## 触发条件
- "心理咨询师列表"、"有哪些咨询师" → 调用 counseling_query(action: list_counselors)
- "价格"、"多少钱" → 调用 counseling_query(action: get_pricing)

## 回复风格
用温暖、专业的语气回复，使用 emoji 增加亲和力。
```

### 3. OpenClaw 配置

```json
// ~/.openclaw/openclaw.json
{
  "gateway": {
    "port": 19000,
    "auth": { "mode": "token", "token": "your-token" }
  },
  "mcp": {
    "servers": {
      "counseling": {
        "command": "node",
        "args": ["/path/to/mcp-server/counseling-mcp.js"]
      }
    }
  },
  "skills": {
    "load": {
      "extraDirs": ["~/.openclaw/skills"]
    }
  }
}
```

### 4. 启动服务

```bash
# 启动 Gateway
openclaw gateway &

# 测试
curl -X POST http://localhost:19000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "查询心理咨询师列表"}'
```

---

## 数据流图解

```
用户输入: "查询心理咨询师列表"
    │
    ▼
┌─────────────────┐
│  OpenClaw GW    │  1. 识别意图：需要查询咨询师
│  (AI 大脑)      │  2. 匹配 Skill: counseling-query
└────────┬────────┘  3. 决定调用: counseling_query
         │
         ▼
┌─────────────────┐
│  MCP Server     │  4. 执行工具，返回数据:
│  (工具服务)     │     {counselors: [李心怡, 张明远]}
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  OpenClaw GW    │  5. AI 整理成友好文字:
│  (AI 大脑)      │     "目前有2位咨询师可预约..."
└────────┬────────┘
         │
         ▼
用户收到: "目前有2位咨询师可预约：李心怡（情绪管理）、张明远（职场压力）..."
```

---

## API 参考

### OpenClawBackend 类

```javascript
import { OpenClawBackend } from 'openclaw-backend-framework';

const app = new OpenClawBackend({
  port: 3000,                    // HTTP 端口
  gatewayUrl: 'ws://127.0.0.1:19000',  // Gateway 地址
  gatewayPort: 19000,            // 或只指定端口
});
```

### app.chat(path, sessionIdFn)

注册聊天接口。

```javascript
app.chat('/api/chat', (req) => req.body.sessionId || 'default');
// POST /api/chat → 转发到 Gateway
```

### app.tool(name, handler)

注册工具。

```javascript
app.tool('my_query', async (params) => {
  // params = 用户传入的参数
  return { result: 'data' };  // 返回给 AI
});
// POST /_tool/my_query
```

### app.skill(name, options)

注册 Skill 路由。

```javascript
app.skill('my-skill', {
  path: '/skill',              // 路由前缀
  sessionId: (req) => req.body.userId,
});
// POST /skill/start
// POST /skill/submit
```

### app.start() / app.stop()

启动/停止服务。

---

## 配置说明

### 环境变量 (.env)

```bash
SERVER_PORT=3000
OPENCLAW_GATEWAY_PORT=19000
LOG_LEVEL=info
```

### OpenClaw 配置 (~/.openclaw/openclaw.json)

```json
{
  "gateway": {
    "port": 19000,
    "auth": { "mode": "token", "token": "xxx" }
  },
  "mcp": {
    "servers": {
      "your-tool-name": {
        "command": "node",
        "args": ["/path/to/mcp-server.js"]
      }
    }
  },
  "skills": {
    "load": {
      "extraDirs": ["~/.openclaw/skills"]
    }
  }
}
```

---

## 常见问题

### Q: Gateway 报错 "device signature invalid"

A: 运行 `openclaw config` 重新生成设备身份。

### Q: 工具没有被调用

A: 检查：
1. MCP Server 是否在配置中注册
2. Skill 的 description 是否包含触发关键词
3. 重启 Gateway: `openclaw gateway`

### Q: 如何调试

A:
```bash
# 查看 Gateway 日志
tail -f /tmp/openclaw/openclaw-*.log

# 设置调试日志级别
LOG_LEVEL=debug node server.js
```

---

## 示例项目

| 示例 | 文件 | 说明 |
|------|------|------|
| 基础聊天 | examples/basic.js | 最简实现 |
| 实时交互 | examples/realtime-demo.js | WebSocket + 流式 + 推送 |
| 心理咨询 Demo | examples/counseling-demo.js | 完整 Skill 示例 |

---

## License

MIT