/**
 * OpenClaw Backend 实时交互服务
 * 支持：WebSocket 双向通信、流式输出、AI 主动推送
 */

import { OpenClawBackend } from '../src/index.js';
import { WebSocketServer } from 'ws';

const app = new OpenClawBackend({
  port: 3001
});

// ========== 数据存储 ==========

const counselors = [
  { id: 'c001', name: '李心怡', specialty: '情绪管理、焦虑抑郁', experience: '8年', style: '温暖倾听，注重共情', available: true },
  { id: 'c002', name: '张明远', specialty: '职场压力、人际关系', experience: '12年', style: '理性分析，给出实用建议', available: true },
  { id: 'c003', name: '王静', specialty: '家庭关系、亲子教育', experience: '15年', style: '温和细腻，引导自我觉察', available: false }
];

const services = [
  { name: '个人心理咨询', desc: '一对一深度咨询，解决个人心理困扰' },
  { name: '情绪管理课程', desc: '学习情绪调节技巧，提升心理韧性' },
  { name: '团体心理辅导', desc: '小组形式，共同探索和成长' },
  { name: '危机干预服务', desc: '紧急心理支持，24小时响应' }
];

const pricing = [
  { type: '个人咨询', price: '300元/小时', note: '首次咨询优惠价200元' },
  { type: '团体辅导', price: '150元/人/次', note: '每期8人，共6次' },
  { type: '情绪课程', price: '999元/期', note: '包含4次课程+2次一对一' }
];

const appointments = {
  availableSlots: [
    { date: '2026-03-28', slots: ['10:00', '14:00', '16:00'] },
    { date: '2026-03-29', slots: ['09:00', '11:00', '15:00'] },
    { date: '2026-03-30', slots: ['10:00', '13:00', '17:00'] }
  ],
  process: '预约后请在24小时内完成支付，逾期将自动取消',
  note: '首次咨询建议选择上午时段，精力更充沛'
};

// ========== 注册工具 ==========

app.tool('counseling_query', async (params) => {
  const action = params.action || 'get_services';
  switch (action) {
    case 'list_counselors':
      return { success: true, counselors: counselors.filter(c => c.available), total: counselors.length };
    case 'get_appointment':
      return { success: true, appointments, counselors: counselors.filter(c => c.available).map(c => c.name) };
    case 'get_services':
      return { success: true, services };
    case 'get_pricing':
      return { success: true, pricing, note: '会员可享受额外10%优惠' };
    default:
      return { success: false, error: '未知的查询类型' };
  }
});

// ========== WebSocket 服务（实时通信） ==========

let wss = null;
const clients = new Map(); // sessionId -> WebSocket

// 创建 WebSocket 服务器
function createWebSocketServer(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const sessionId = 'ws-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    clients.set(sessionId, ws);

    console.log(`[WS] Client connected: ${sessionId}`);

    // 发送欢迎消息
    sendToClient(ws, {
      type: 'connected',
      sessionId,
      message: '连接成功！我是您的心理咨询助手，有什么可以帮您？'
    });

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        console.log(`[WS] Received from ${sessionId}:`, msg.message?.slice(0, 50));

        // 流式处理用户消息
        await handleStreamingMessage(ws, sessionId, msg.message);
      } catch (e) {
        console.error('[WS] Error:', e.message);
        sendToClient(ws, { type: 'error', message: '处理消息失败' });
      }
    });

    ws.on('close', () => {
      clients.delete(sessionId);
      console.log(`[WS] Client disconnected: ${sessionId}`);
    });
  });
}

// 流式发送消息到客户端
function sendToClient(ws, data) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

// 流式处理消息（模拟逐字输出）
async function handleStreamingMessage(ws, sessionId, userMessage) {
  // 1. 告知用户开始处理
  sendToClient(ws, { type: 'thinking', message: '正在思考...' });

  // 2. 调用 OpenClaw Gateway
  try {
    const result = await app._invoke(sessionId, userMessage);

    // 合并所有 payloads 的 text
    let fullText = '';
    if (result.payloads && Array.isArray(result.payloads)) {
      fullText = result.payloads.map(p => p.text || '').join('\n\n');
    } else if (result.message) {
      fullText = result.message;
    } else {
      fullText = JSON.stringify(result);
    }

    // 3. 流式发送（分段输出）
    const chunks = splitIntoChunks(fullText, 20); // 每 20 字符一段
    for (let i = 0; i < chunks.length; i++) {
      sendToClient(ws, {
        type: 'stream',
        chunk: chunks[i],
        index: i,
        total: chunks.length,
        done: i === chunks.length - 1
      });
      await delay(50); // 50ms 延迟，模拟打字效果
    }

    // 4. 完成标记
    sendToClient(ws, { type: 'done', fullText });

  } catch (e) {
    sendToClient(ws, { type: 'error', message: e.message });
  }
}

// 分割文本为块
function splitIntoChunks(text, size) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks.length ? chunks : [text];
}

// 延迟函数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========== AI 主动推送功能 ==========

// 定时推送关怀消息（模拟）
function schedulePushMessages() {
  // 每 30 秒推送一条关怀提示（演示用）
  setInterval(() => {
    const caringMessages = [
      ' 💡 小提示：每天给自己 10 分钟放空时间，有助于缓解压力',
      ' 🌙 现在是放松的好时机，试试深呼吸 3 次？',
      ' 💪 记住：休息不是浪费时间，是给自己充电',
      ' 🎯 今天有什么小目标？完成它会让你更有成就感'
    ];

    const msg = caringMessages[Math.floor(Math.random() * caringMessages.length)];

    // 推送给所有连接的客户端
    for (const [sessionId, ws] of clients) {
      sendToClient(ws, {
        type: 'push',
        category: 'care',
        message: msg,
        timestamp: new Date().toISOString()
      });
    }
    console.log(`[Push] Sent care message to ${clients.size} clients`);
  }, 30000); // 30秒

  // 模拟预约提醒
  setTimeout(() => {
    for (const [sessionId, ws] of clients) {
      sendToClient(ws, {
        type: 'push',
        category: 'reminder',
        message: '📅 您有一条预约即将到期：心理咨询预约（明天 10:00），请确认是否出席',
        timestamp: new Date().toISOString()
      });
    }
  }, 10000); // 10秒后演示预约提醒
}

// ========== HTTP API ==========

app.app.get('/api/counselors', (req, res) => {
  res.json({ success: true, counselors: counselors.filter(c => c.available) });
});

app.app.get('/api/appointments', (req, res) => {
  res.json({ success: true, appointments, counselors: counselors.filter(c => c.available).map(c => c.name) });
});

app.app.get('/api/services', (req, res) => res.json({ success: true, services }));
app.app.get('/api/pricing', (req, res) => res.json({ success: true, pricing }));

// ========== 前端页面 ==========

app.app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>心理咨询助手 - 实时交互</title>
  <style>
    :root {
      --primary: #10b981;
      --primary-dark: #059669;
      --bg-dark: #0f0f0f;
      --bg-card: #1a1a1a;
      --bg-input: #262626;
      --text-primary: #ffffff;
      --text-secondary: #a1a1aa;
      --border: #2e2e2e;
      --push-bg: #1e3a2f;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-dark);
      color: var(--text-primary);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
      padding: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header h1 { font-size: 20px; }
    .status {
      font-size: 12px;
      padding: 4px 12px;
      border-radius: 12px;
      background: rgba(255,255,255,0.2);
    }
    .status.connected { background: rgba(16,185,129,0.3); }
    .status.disconnected { background: rgba(239,68,68,0.3); }
    .content {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .message {
      padding: 12px 16px;
      border-radius: 16px;
      max-width: 85%;
      word-wrap: break-word;
      white-space: pre-wrap;
      line-height: 1.5;
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .message.user {
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
      margin-left: auto;
      border-bottom-right-radius: 4px;
    }
    .message.assistant {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-bottom-left-radius: 4px;
    }
    .message.push {
      background: var(--push-bg);
      border: 1px solid var(--primary);
      border-radius: 12px;
      text-align: center;
      max-width: 100%;
      font-size: 14px;
    }
    .message.push .time {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 4px;
    }
    .thinking {
      color: var(--text-secondary);
      font-size: 14px;
      padding: 8px;
    }
    .thinking::after {
      content: '';
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--primary);
      margin-left: 8px;
      animation: pulse 1s infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
    .input-area {
      padding: 16px;
      background: var(--bg-card);
      border-top: 1px solid var(--border);
      display: flex;
      gap: 12px;
    }
    input {
      flex: 1;
      padding: 12px 16px;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 12px;
      font-size: 16px;
      color: var(--text-primary);
      outline: none;
    }
    input:focus { border-color: var(--primary); }
    button {
      background: var(--primary);
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 12px;
      font-size: 16px;
      cursor: pointer;
    }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .quick-actions {
      display: flex;
      gap: 8px;
      padding: 8px 16px;
      background: var(--bg-card);
      border-top: 1px solid var(--border);
    }
    .quick-btn {
      background: var(--bg-input);
      border: 1px solid var(--border);
      color: var(--text-primary);
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 13px;
      cursor: pointer;
    }
    .quick-btn:hover { border-color: var(--primary); }
  </style>
</head>
<body>
  <div class="header">
    <h1>🧘 心理咨询助手</h1>
    <span class="status disconnected" id="status">未连接</span>
  </div>

  <div class="quick-actions">
    <button class="quick-btn" onclick="sendMsg('查询心理咨询师列表')">咨询师</button>
    <button class="quick-btn" onclick="sendMsg('心理咨询多少钱')">价格</button>
    <button class="quick-btn" onclick="sendMsg('我想预约咨询')">预约</button>
    <button class="quick-btn" onclick="sendMsg('有哪些服务')">服务</button>
  </div>

  <div class="content" id="chat"></div>

  <div class="input-area">
    <input type="text" id="input" placeholder="输入消息..." autofocus>
    <button id="sendBtn" onclick="sendMessage()">发送</button>
  </div>

  <script>
    const chatEl = document.getElementById('chat');
    const inputEl = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');
    const statusEl = document.getElementById('status');

    let ws = null;
    let currentText = '';
    let currentMsgEl = null;

    // 连接 WebSocket
    function connect() {
      const wsUrl = 'ws://' + location.host + '/ws';
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        statusEl.textContent = '已连接';
        statusEl.className = 'status connected';
        console.log('WebSocket connected');
      };

      ws.onclose = () => {
        statusEl.textContent = '已断开';
        statusEl.className = 'status disconnected';
        console.log('WebSocket disconnected');
        // 自动重连
        setTimeout(connect, 3000);
      };

      ws.onerror = (e) => {
        console.error('WebSocket error:', e);
      };

      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        handleMessage(data);
      };
    }

    // 处理消息
    function handleMessage(data) {
      switch (data.type) {
        case 'connected':
          addMessage('✅ ' + data.message, 'assistant');
          break;

        case 'thinking':
          currentMsgEl = addMessage('正在思考...', 'thinking');
          currentText = '';
          break;

        case 'stream':
          // 流式输出 - 逐字显示
          if (!currentMsgEl) {
            currentMsgEl = addMessage('', 'assistant');
          }
          currentText += data.chunk;
          currentMsgEl.textContent = currentText;
          // 滚动到底部
          chatEl.scrollTop = chatEl.scrollHeight;
          break;

        case 'done':
          // 完成
          if (currentMsgEl) {
            currentMsgEl.textContent = data.fullText;
          }
          currentMsgEl = null;
          currentText = '';
          sendBtn.disabled = false;
          break;

        case 'push':
          // AI 主动推送
          const pushEl = document.createElement('div');
          pushEl.className = 'message push';
          pushEl.innerHTML = data.message + '<div class="time">' + new Date(data.timestamp).toLocaleTimeString() + '</div>';
          chatEl.appendChild(pushEl);
          chatEl.scrollTop = chatEl.scrollHeight;
          break;

        case 'error':
          addMessage('❌ ' + data.message, 'assistant');
          sendBtn.disabled = false;
          break;
      }
    }

    // 添加消息
    function addMessage(text, type) {
      const div = document.createElement('div');
      div.className = 'message ' + type;
      div.textContent = text;
      chatEl.appendChild(div);
      chatEl.scrollTop = chatEl.scrollHeight;
      return div;
    }

    // 发送消息
    function sendMessage() {
      const text = inputEl.value.trim();
      if (!text || !ws) return;

      inputEl.value = '';
      sendBtn.disabled = true;

      addMessage(text, 'user');
      ws.send(JSON.stringify({ message: text }));
    }

    // 快捷发送
    function sendMsg(text) {
      inputEl.value = text;
      sendMessage();
    }

    // 回车发送
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendMessage();
    });

    // 初始化连接
    connect();
  </script>
</body>
</html>`);
});

// 注册聊天接口（HTTP 方式仍可用）
app.chat('/api/chat', (req) => req.body.sessionId || 'default');

// ========== 启动服务 ==========

app.start().then(() => {
  // 创建 WebSocket 服务器
  createWebSocketServer(app.server);

  // 启动主动推送
  schedulePushMessages();

  console.log('\n✅ 实时交互服务已启动:');
  console.log('   - WebSocket: ws://localhost:3001/ws');
  console.log('   - HTTP API:  http://localhost:3001/api/chat');
  console.log('   - 前端页面:  http://localhost:3001');
  console.log('\n特性:');
  console.log('   ✓ 流式输出（逐字显示）');
  console.log('   ✓ WebSocket 双向通信');
  console.log('   ✓ AI 主动推送消息');
});