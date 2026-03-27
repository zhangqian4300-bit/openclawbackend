/**
 * OpenClaw Backend 服务启动文件
 * 包含心理咨询 skill demo
 */

import { OpenClawBackend } from '../src/index.js';

const app = new OpenClawBackend({
  port: 3001
});

// ========== 心理咨询资源数据库 ==========

const counselors = [
  {
    id: 'c001',
    name: '李心怡',
    specialty: '情绪管理、焦虑抑郁',
    experience: '8年',
    style: '温暖倾听，注重共情',
    available: true
  },
  {
    id: 'c002',
    name: '张明远',
    specialty: '职场压力、人际关系',
    experience: '12年',
    style: '理性分析，给出实用建议',
    available: true
  },
  {
    id: 'c003',
    name: '王静',
    specialty: '家庭关系、亲子教育',
    experience: '15年',
    style: '温和细腻，引导自我觉察',
    available: false
  }
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

// ========== 注册心理咨询查询工具 ==========

app.tool('counseling_query', async (params) => {
  const action = params.action || 'get_services';

  switch (action) {
    case 'list_counselors':
      return {
        success: true,
        counselors: counselors.filter(c => c.available),
        total: counselors.length,
        message: '查询成功'
      };

    case 'get_appointment':
      return {
        success: true,
        appointments,
        counselors: counselors.filter(c => c.available).map(c => c.name),
        message: '预约信息查询成功'
      };

    case 'get_services':
      return {
        success: true,
        services,
        message: '服务列表查询成功'
      };

    case 'get_pricing':
      return {
        success: true,
        pricing,
        note: '会员可享受额外10%优惠',
        message: '价格查询成功'
      };

    default:
      return {
        success: false,
        error: '未知的查询类型',
        availableActions: ['list_counselors', 'get_appointment', 'get_services', 'get_pricing']
      };
  }
});

// ========== 注册心理咨询 skill 路由 ==========

app.skill('counseling-query', {
  path: '/counseling',
  sessionId: (req) => req.body.userId || 'counseling-default',

  actions: {
    start: { message: '心理咨询资源查询服务已启动' },
    submit: { message: (req) => req.body.message }
  }
});

// ========== HTTP API 接口 ==========

// 咨询师列表 API
app.app.get('/api/counselors', (req, res) => {
  res.json({
    success: true,
    counselors: counselors.filter(c => c.available)
  });
});

// 预约信息 API
app.app.get('/api/appointments', (req, res) => {
  res.json({
    success: true,
    appointments,
    availableCounselors: counselors.filter(c => c.available).map(c => c.name)
  });
});

// 服务列表 API
app.app.get('/api/services', (req, res) => {
  res.json({ success: true, services });
});

// 价格信息 API
app.app.get('/api/pricing', (req, res) => {
  res.json({ success: true, pricing });
});

// ========== 前端页面 ==========

app.app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>心理咨询助手</title>
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
      padding: 20px;
      text-align: center;
      box-shadow: 0 4px 20px rgba(16, 185, 129, 0.3);
    }

    .header h1 {
      font-size: 24px;
      font-weight: 600;
    }

    .header p {
      font-size: 14px;
      opacity: 0.9;
      margin-top: 4px;
    }

    .content {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .message {
      padding: 14px 18px;
      border-radius: 16px;
      max-width: 85%;
      word-wrap: break-word;
      white-space: pre-wrap;
      line-height: 1.5;
      animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .message.user {
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
      color: white;
      margin-left: auto;
      border-bottom-right-radius: 4px;
    }

    .message.assistant {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-bottom-left-radius: 4px;
    }

    .message.loading {
      background: var(--bg-card);
      border: 1px solid var(--border);
      color: var(--text-secondary);
    }

    .message.loading::after {
      content: '';
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--primary);
      margin-left: 8px;
      animation: pulse 1s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 1; }
    }

    .input-container {
      padding: 20px;
      background: var(--bg-card);
      border-top: 1px solid var(--border);
      display: flex;
      gap: 12px;
    }

    input[type="text"] {
      flex: 1;
      padding: 14px 20px;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 12px;
      font-size: 16px;
      color: var(--text-primary);
      outline: none;
    }

    input[type="text"]:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
    }

    input[type="text"]::placeholder {
      color: var(--text-secondary);
    }

    button {
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
      color: white;
      border: none;
      padding: 14px 28px;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    button:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .welcome {
      text-align: center;
      padding: 40px 20px;
      color: var(--text-secondary);
    }

    .welcome h2 {
      color: var(--text-primary);
      margin-bottom: 12px;
    }

    .quick-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
      margin-top: 20px;
    }

    .quick-btn {
      background: var(--bg-input);
      border: 1px solid var(--border);
      color: var(--text-primary);
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .quick-btn:hover {
      background: var(--bg-card);
      border-color: var(--primary);
    }

    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      margin-top: 12px;
    }

    .card {
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
    }

    .card h4 {
      color: var(--primary);
      margin-bottom: 8px;
    }

    .card p {
      color: var(--text-secondary);
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🧘 心理咨询助手</h1>
    <p>专业的心理咨询服务查询</p>
  </div>

  <div class="content" id="chat">
    <div class="welcome">
      <h2>欢迎使用心理咨询助手</h2>
      <p>我可以帮你查询咨询师、预约信息、服务详情等</p>
      <div class="quick-actions">
        <button class="quick-btn" onclick="sendQuick('查询心理咨询师列表')">👩‍⚕️ 查询咨询师</button>
        <button class="quick-btn" onclick="sendQuick('我想预约心理咨询')">📅 预约咨询</button>
        <button class="quick-btn" onclick="sendQuick('心理咨询价格多少钱')">💰 查询价格</button>
        <button class="quick-btn" onclick="sendQuick('有哪些心理咨询服务')">📋 服务概览</button>
      </div>
    </div>
  </div>

  <div class="input-container">
    <input type="text" id="input" placeholder="输入消息，如：查询心理咨询师..." autofocus>
    <button id="send" onclick="sendMessage()">发送</button>
  </div>

  <script>
    const chatEl = document.getElementById('chat');
    const inputEl = document.getElementById('input');
    const sendBtn = document.getElementById('send');
    const sessionId = 'counseling-' + Date.now();
    let welcomeShown = true;

    function addMessage(text, type) {
      if (welcomeShown) {
        const welcome = chatEl.querySelector('.welcome');
        if (welcome) welcome.remove();
        welcomeShown = false;
      }

      const div = document.createElement('div');
      div.className = 'message ' + type;
      div.innerHTML = text;
      chatEl.appendChild(div);
      chatEl.scrollTop = chatEl.scrollHeight;
      return div;
    }

    async function sendMessage() {
      const text = inputEl.value.trim();
      if (!text) return;

      inputEl.value = '';
      sendBtn.disabled = true;

      addMessage(text, 'user');
      const loadingEl = addMessage('正在查询...', 'loading');

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, sessionId })
        });
        const data = await res.json();
        loadingEl.remove();

        if (data.error) {
          addMessage('错误: ' + data.error, 'assistant');
        } else {
          const content = data.payloads?.[0]?.text || data.result?.payloads?.[0]?.text || data.content || data.message || JSON.stringify(data);
          addMessage(content, 'assistant');
        }
      } catch (e) {
        loadingEl.remove();
        addMessage('请求失败: ' + e.message, 'assistant');
      }

      sendBtn.disabled = false;
      inputEl.focus();
    }

    function sendQuick(text) {
      inputEl.value = text;
      sendMessage();
    }

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  </script>
</body>
</html>`);
});

// 注册通用聊天接口
app.chat('/api/chat', (req) => req.body.sessionId || 'default');

// 启动服务
app.start();

console.log('\n打开浏览器访问: http://localhost:3001');
console.log('\n测试工具调用:');
console.log('curl -X POST http://localhost:3001/_tool/counseling_query -H "Content-Type: application/json" -d \'{"action":"list_counselors"}\'');