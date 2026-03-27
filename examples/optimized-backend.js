/**
 * OpenClaw Backend 优化版
 * 特性：
 * - WebSocket 连接池（复用连接）
 * - 缓存层（Redis/内存）
 * - 真正的流式输出
 * - 请求队列管理
 */

import express from 'express';
import cors from 'cors';
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// ==================== 配置 ====================

const CONFIG = {
  port: 3001,
  gatewayUrl: 'ws://127.0.0.1:19000',
  poolSize: 5,              // 连接池大小
  poolTimeout: 30000,       // 连接空闲超时
  cacheEnabled: true,       // 是否启用缓存
  cacheTTL: 300,            // 缓存时间（秒）
  requestTimeout: 120000,   // 请求超时
};

// ==================== 连接池 ====================

class ConnectionPool extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.connections = [];
    this.waitQueue = [];
    this.stats = { created: 0, reused: 0, errors: 0 };
  }

  /**
   * 初始化连接池
   */
  async initialize() {
    console.log(`[Pool] 初始化连接池，大小: ${this.config.poolSize}`);

    // 预创建部分连接
    const initialCount = Math.min(2, this.config.poolSize);
    for (let i = 0; i < initialCount; i++) {
      const conn = await this._createConnection();
      if (conn) this.connections.push(conn);
    }

    console.log(`[Pool] 预创建了 ${this.connections.length} 个连接`);
  }

  /**
   * 获取连接
   */
  async acquire() {
    // 1. 查找空闲连接
    const idleConn = this.connections.find(c => c.idle && c.ready);
    if (idleConn) {
      idleConn.idle = false;
      idleConn.lastUsed = Date.now();
      this.stats.reused++;
      console.log(`[Pool] 复用连接 ${idleConn.id}`);
      return idleConn;
    }

    // 2. 池未满，创建新连接
    if (this.connections.length < this.config.poolSize) {
      const conn = await this._createConnection();
      if (conn) {
        this.connections.push(conn);
        return conn;
      }
    }

    // 3. 等待空闲连接
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('连接池超时'));
        this._removeFromQueue(callback);
      }, 10000);

      const callback = () => {
        clearTimeout(timeout);
        const conn = this.connections.find(c => c.idle && c.ready);
        if (conn) {
          conn.idle = false;
          conn.lastUsed = Date.now();
          this.stats.reused++;
          resolve(conn);
        }
      };

      this.waitQueue.push(callback);
    });
  }

  /**
   * 释放连接
   */
  release(conn) {
    conn.idle = true;

    // 唤醒等待队列
    const callback = this.waitQueue.shift();
    if (callback) {
      callback();
    }
  }

  /**
   * 创建新连接
   */
  async _createConnection() {
    const connId = 'conn-' + String(Date.now()).slice(-6) + '-' + Math.random().toString(36).slice(2, 6);
    console.log(`[Pool] 创建连接 ${connId}`);

    const conn = {
      id: connId,
      ws: null,
      idle: false,
      ready: false,
      lastUsed: Date.now(),
      messageHandler: null,
      pendingRequests: new Map(),
    };

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.config.gatewayUrl);
      conn.ws = ws;

      const timeout = setTimeout(() => {
        this.stats.errors++;
        reject(new Error('连接超时'));
      }, 10000);

      ws.on('open', () => {
        clearTimeout(timeout);
        console.log(`[Pool] 连接 ${connId} 已打开，等待认证...`);
      });

      ws.on('message', (data) => {
        this._handleMessage(conn, data);
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        this.stats.errors++;
        console.error(`[Pool] 连接 ${connId} 错误:`, err.message);
        conn.ready = false;
      });

      ws.on('close', () => {
        console.log(`[Pool] 连接 ${connId} 已关闭`);
        conn.ready = false;
        // 重连逻辑
        setTimeout(() => this._reconnect(conn), 1000);
      });

      // 等待认证完成
      const checkReady = setInterval(() => {
        if (conn.ready) {
          clearInterval(checkReady);
          conn.idle = true;
          this.stats.created++;
          resolve(conn);
        }
      }, 100);

      // 5秒超时
      setTimeout(() => {
        clearInterval(checkReady);
        if (!conn.ready) {
          reject(new Error('认证超时'));
        }
      }, 5000);
    });
  }

  /**
   * 处理消息
   */
  _handleMessage(conn, data) {
    try {
      const event = JSON.parse(data.toString());

      // 认证挑战
      if (event.event === 'connect.challenge') {
        this._handleChallenge(conn, event);
        return;
      }

      // 连接成功
      if (event.type === 'res' && event.ok) {
        const payload = event.payload;
        if (payload && (payload.type === 'hello-ok' || payload.protocol)) {
          conn.ready = true;
          console.log(`[Pool] 连接 ${conn.id} 认证成功`);
          return;
        }
      }

      // 处理请求响应
      if (event.id && conn.pendingRequests.has(event.id)) {
        const { resolve, stream } = conn.pendingRequests.get(event.id);
        stream(event);
      }
    } catch (e) {
      console.error('[Pool] 消息处理错误:', e.message);
    }
  }

  /**
   * 处理认证挑战
   */
  _handleChallenge(conn, event) {
    const nonce = event.payload?.nonce;
    if (!nonce) return;

    // 加载设备身份
    const identity = this._loadDeviceIdentity();
    const params = this._buildConnectParams(identity, nonce);

    conn.ws.send(JSON.stringify({
      type: 'req',
      id: crypto.randomUUID(),
      method: 'connect',
      params
    }));
  }

  /**
   * 重连
   */
  async _reconnect(conn) {
    console.log(`[Pool] 尝试重连 ${conn.id}`);
    try {
      const newConn = await this._createConnection();
      Object.assign(conn, newConn);
      conn.id = conn.id + '-r';
    } catch (e) {
      console.error(`[Pool] 重连失败:`, e.message);
    }
  }

  /**
   * 移除等待队列
   */
  _removeFromQueue(callback) {
    const index = this.waitQueue.indexOf(callback);
    if (index > -1) this.waitQueue.splice(index, 1);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      total: this.connections.length,
      idle: this.connections.filter(c => c.idle).length,
      ready: this.connections.filter(c => c.ready).length,
      waiting: this.waitQueue.length,
      ...this.stats
    };
  }

  // 简化版认证参数构建
  _buildConnectParams(identity, nonce) {
    const params = {
      minProtocol: 3,
      maxProtocol: 3,
      client: { id: 'cli', version: '1.0.0', platform: process.platform, mode: 'cli' },
      caps: [],
      role: 'operator',
      scopes: ['operator.admin', 'operator.read', 'operator.write']
    };

    // Gateway token 认证
    const gatewayToken = 'd226lRYSLv2oxWa6P-ht0M39lxj2M8C-TCc3JD8Nu9g';
    params.auth = { token: gatewayToken };

    if (identity) {
      params.device = {
        id: identity.deviceId,
        publicKey: this._encodePublicKey(identity.publicKeyPem),
        signature: this._sign(identity.privateKeyPem, this._buildPayload(identity, nonce, gatewayToken)),
        signedAt: Date.now(),
        nonce
      };
    }

    return params;
  }

  _loadDeviceIdentity() {
    const filePath = join(homedir(), '.openclaw', 'identity', 'device.json');
    if (!existsSync(filePath)) return null;
    try {
      return JSON.parse(readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  _encodePublicKey(pem) {
    const key = crypto.createPublicKey(pem);
    const der = key.export({ type: 'spki', format: 'der' });
    return der.slice(-32).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  _sign(privateKeyPem, payload) {
    const key = crypto.createPrivateKey(privateKeyPem);
    const sig = crypto.sign(null, Buffer.from(payload, 'utf8'), key);
    return sig.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  _buildPayload(identity, nonce, token = '') {
    return ['v3', identity.deviceId, 'cli', 'cli', 'operator', 'operator.admin,operator.read,operator.write', Date.now(), token, nonce, process.platform, ''].join('|');
  }
}

// ==================== 缓存层 ====================

class CacheLayer {
  constructor(enabled = true, ttl = 300) {
    this.enabled = enabled;
    this.ttl = ttl;
    this.store = new Map();
    this.stats = { hits: 0, misses: 0 };
  }

  get(key) {
    if (!this.enabled) return null;

    const item = this.store.get(key);
    if (!item) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > item.expiry) {
      this.store.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return item.value;
  }

  set(key, value, ttl = this.ttl) {
    if (!this.enabled) return;

    this.store.set(key, {
      value,
      expiry: Date.now() + ttl * 1000
    });
  }

  getStats() {
    return {
      size: this.store.size,
      ...this.stats,
      hitRate: this.stats.hits + this.stats.misses > 0
        ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(1) + '%'
        : '0%'
    };
  }
}

// ==================== 主服务 ====================

const app = express();
app.use(cors());
app.use(express.json());

// 初始化组件
const pool = new ConnectionPool(CONFIG);
const cache = new CacheLayer(CONFIG.cacheEnabled, CONFIG.cacheTTL);

// 数据存储
const counselors = [
  { id: 'c001', name: '李心怡', specialty: '情绪管理、焦虑抑郁', experience: '8年', style: '温暖倾听，注重共情', available: true },
  { id: 'c002', name: '张明远', specialty: '职场压力、人际关系', experience: '12年', style: '理性分析，给出实用建议', available: true },
  { id: 'c003', name: '王静', specialty: '家庭关系、亲子教育', experience: '15年', style: '温和细腻，引导自我觉察', available: false }
];

const pricing = [
  { type: '个人咨询', price: '300元/小时', note: '首次咨询优惠价200元' },
  { type: '团体辅导', price: '150元/人/次', note: '每期8人，共6次' },
  { type: '情绪课程', price: '999元/期', note: '包含4次课程+2次一对一' }
];

// ==================== API 路由 ====================

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    pool: pool.getStats(),
    cache: cache.getStats(),
    timestamp: new Date().toISOString()
  });
});

// 工具调用
app.post('/_tool/counseling_query', async (req, res) => {
  const { action } = req.body;

  // 缓存键
  const cacheKey = `tool:counseling:${action}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`[Cache] 命中: ${cacheKey}`);
    return res.json(cached);
  }

  let result;
  switch (action) {
    case 'list_counselors':
      result = { success: true, counselors: counselors.filter(c => c.available) };
      break;
    case 'get_pricing':
      result = { success: true, pricing };
      break;
    default:
      result = { success: false, error: '未知操作' };
  }

  cache.set(cacheKey, result);
  res.json(result);
});

// 聊天 API（连接池版本）
app.post('/api/chat', async (req, res) => {
  const { message, sessionId = 'default' } = req.body;

  try {
    const conn = await pool.acquire();
    console.log(`[API] 使用连接 ${conn.id} 处理请求`);

    const result = await invokeWithPool(conn, sessionId, message);

    pool.release(conn);
    res.json(result);

  } catch (e) {
    console.error('[API] 错误:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 流式聊天 API (SSE)
app.post('/api/chat/stream', async (req, res) => {
  const { message, sessionId = 'default' } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const conn = await pool.acquire();

    await streamInvoke(conn, sessionId, message, (chunk) => {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    });

    pool.release(conn);
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (e) {
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    res.end();
  }
});

// ==================== 核心调用函数 ====================

async function invokeWithPool(conn, sessionId, message) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timeout = setTimeout(() => {
      conn.pendingRequests.delete(requestId);
      reject(new Error('请求超时'));
    }, CONFIG.requestTimeout);

    let fullText = '';
    let payloads = [];

    conn.pendingRequests.set(requestId, {
      resolve: (event) => {
        // 处理流式事件
        if (event.event === 'agent' && event.payload?.payloads) {
          payloads = event.payload.payloads;
          fullText = payloads.map(p => p.text || '').join('\n\n');
        }

        // 最终响应
        if (event.type === 'res' && event.payload?.result) {
          clearTimeout(timeout);
          conn.pendingRequests.delete(requestId);
          resolve({
            payloads: event.payload.result.payloads || payloads,
            meta: event.payload.result.meta
          });
        }
      },
      stream: () => {}
    });

    // 发送请求
    conn.ws.send(JSON.stringify({
      type: 'req',
      id: requestId,
      method: 'agent',
      params: {
        message,
        sessionId,
        idempotencyKey: `${sessionId}-${Date.now()}`
      }
    }));
  });
}

async function streamInvoke(conn, sessionId, message, onChunk) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timeout = setTimeout(() => {
      conn.pendingRequests.delete(requestId);
      reject(new Error('请求超时'));
    }, CONFIG.requestTimeout);

    conn.pendingRequests.set(requestId, {
      resolve,
      stream: (event) => {
        // 流式输出
        if (event.event === 'agent' && event.payload?.stream === 'content') {
          onChunk(event.payload.data?.text || '');
        }
      }
    });

    conn.ws.send(JSON.stringify({
      type: 'req',
      id: requestId,
      method: 'agent',
      params: { message, sessionId, idempotencyKey: `${sessionId}-${Date.now()}` }
    }));
  });
}

// ==================== 前端页面 ====================

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>心理咨询助手 - 优化版</title>
  <style>
    :root { --primary: #10b981; --bg: #0f0f0f; --card: #1a1a1a; --input: #262626; --text: #fff; --muted: #888; --border: #333; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: var(--bg); color: var(--text); height: 100vh; display: flex; flex-direction: column; }
    .header { background: linear-gradient(135deg, var(--primary), #059669); padding: 16px; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { font-size: 18px; }
    .stats { font-size: 12px; opacity: 0.9; }
    .quick { display: flex; gap: 8px; padding: 12px 16px; background: var(--card); }
    .quick button { background: var(--input); border: 1px solid var(--border); color: var(--text); padding: 8px 12px; border-radius: 6px; cursor: pointer; }
    .quick button:hover { border-color: var(--primary); }
    .chat { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .msg { padding: 12px 16px; border-radius: 12px; max-width: 85%; line-height: 1.5; white-space: pre-wrap; }
    .msg.user { background: var(--primary); margin-left: auto; }
    .msg.assistant { background: var(--card); border: 1px solid var(--border); }
    .input-area { padding: 16px; background: var(--card); display: flex; gap: 12px; }
    input { flex: 1; padding: 12px 16px; background: var(--input); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 16px; outline: none; }
    input:focus { border-color: var(--primary); }
    button.send { background: var(--primary); color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; cursor: pointer; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🧘 心理咨询助手 (优化版)</h1>
    <span class="stats" id="stats">连接池: 初始化中...</span>
  </div>
  <div class="quick">
    <button onclick="send('查询心理咨询师列表')">咨询师</button>
    <button onclick="send('心理咨询多少钱')">价格</button>
    <button onclick="send('我想预约咨询')">预约</button>
    <button onclick="send('有哪些服务')">服务</button>
  </div>
  <div class="chat" id="chat"></div>
  <div class="input-area">
    <input id="input" placeholder="输入消息..." autofocus>
    <button class="send" id="sendBtn" onclick="sendMessage()">发送</button>
  </div>

  <script>
    const chatEl = document.getElementById('chat');
    const inputEl = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');
    const statsEl = document.getElementById('stats');

    // 更新统计信息
    async function updateStats() {
      const res = await fetch('/health');
      const data = await res.json();
      statsEl.textContent = '连接池: ' + data.pool.ready + '/' + data.pool.total + ' | 缓存命中率: ' + data.cache.hitRate;
    }
    setInterval(updateStats, 5000);
    updateStats();

    function addMsg(text, type) {
      const div = document.createElement('div');
      div.className = 'msg ' + type;
      div.textContent = text;
      chatEl.appendChild(div);
      chatEl.scrollTop = chatEl.scrollHeight;
    }

    async function sendMessage() {
      const text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = '';
      sendBtn.disabled = true;
      addMsg(text, 'user');

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, sessionId: 'web-' + Date.now() })
        });
        const data = await res.json();
        const content = data.payloads?.[0]?.text || data.payloads?.map(p => p.text).join('\\n\\n') || JSON.stringify(data);
        addMsg(content, 'assistant');
      } catch (e) {
        addMsg('错误: ' + e.message, 'assistant');
      }

      sendBtn.disabled = false;
      inputEl.focus();
      updateStats();
    }

    function send(text) { inputEl.value = text; sendMessage(); }
    inputEl.onkeydown = (e) => { if (e.key === 'Enter') sendMessage(); };
  </script>
</body>
</html>`);
});

// ==================== 启动 ====================

async function start() {
  // 初始化连接池
  await pool.initialize();

  // 启动 HTTP 服务
  app.listen(CONFIG.port, () => {
    console.log('');
    console.log('✅ OpenClaw Backend 优化版已启动');
    console.log('   地址: http://localhost:' + CONFIG.port);
    console.log('   连接池大小:', CONFIG.poolSize);
    console.log('   缓存:', CONFIG.cacheEnabled ? '启用' : '禁用');
    console.log('');
    console.log('测试命令:');
    console.log('  curl -X POST http://localhost:3001/api/chat \\');
    console.log('    -H "Content-Type: application/json" \\');
    console.log('    -d \'{"message": "你好"}\'');
    console.log('');
    console.log('查看状态:');
    console.log('  curl http://localhost:3001/health');
  });
}

start();