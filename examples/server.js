/**
 * OpenClaw Backend 服务启动文件
 * 包含美观的前端交互界面
 */

import { OpenClawBackend } from '../src/index.js';

const app = new OpenClawBackend({
  port: 3001
});

// 注册聊天接口
app.chat('/api/chat', (req) => req.body.sessionId || 'default-session');

// 提供前端页面
app.app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenClaw Chat</title>
  <style>
    :root {
      --primary: #6366f1;
      --primary-dark: #4f46e5;
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
      box-shadow: 0 4px 20px rgba(99, 102, 241, 0.3);
    }

    .header h1 {
      font-size: 24px;
      font-weight: 600;
      letter-spacing: -0.5px;
    }

    .header p {
      font-size: 14px;
      opacity: 0.9;
      margin-top: 4px;
    }

    .chat-container {
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
      color: var(--text-primary);
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
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    input[type="text"]:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
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
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
    }

    button:active:not(:disabled) {
      transform: translateY(0);
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .welcome {
      text-align: center;
      padding: 40px 20px;
      color: var(--text-secondary);
    }

    .welcome h2 {
      color: var(--text-primary);
      margin-bottom: 12px;
      font-size: 20px;
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
      transition: background 0.2s, border-color 0.2s;
    }

    .quick-btn:hover {
      background: var(--bg-card);
      border-color: var(--primary);
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🤖 OpenClaw Chat</h1>
    <p>与 AI 助手对话</p>
  </div>

  <div class="chat-container" id="chat">
    <div class="welcome">
      <h2>欢迎使用 OpenClaw Chat</h2>
      <p>在下方输入框中输入消息开始对话</p>
      <div class="quick-actions">
        <button class="quick-btn" onclick="sendQuick('你好，请介绍一下你自己')">👋 打个招呼</button>
        <button class="quick-btn" onclick="sendQuick('帮我写一段 Python 代码')">💻 写代码</button>
        <button class="quick-btn" onclick="sendQuick('解释一下什么是机器学习')">🎓 学习知识</button>
      </div>
    </div>
  </div>

  <div class="input-container">
    <input type="text" id="input" placeholder="输入消息..." autofocus>
    <button id="send" onclick="sendMessage()">发送</button>
  </div>

  <script>
    const chatEl = document.getElementById('chat');
    const inputEl = document.getElementById('input');
    const sendBtn = document.getElementById('send');
    const sessionId = 'session-' + Date.now();
    let welcomeShown = true;

    function addMessage(text, type) {
      // 移除欢迎消息
      if (welcomeShown) {
        const welcome = chatEl.querySelector('.welcome');
        if (welcome) welcome.remove();
        welcomeShown = false;
      }

      const div = document.createElement('div');
      div.className = 'message ' + type;
      div.textContent = text;
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
      const loadingEl = addMessage('正在思考...', 'loading');

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
          // 提取响应内容
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
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  </script>
</body>
</html>`);
});

// 启动服务
app.start();

console.log('\n打开浏览器访问: http://localhost:3001');