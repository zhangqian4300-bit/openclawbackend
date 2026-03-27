/**
 * 简单前端对话界面示例
 * 使用 WebSocket 直连 OpenClaw Gateway
 */

import { OpenClawBackend } from '../src/index.js';

const app = new OpenClawBackend({
  port: 3002
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
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      background: #4a90d9;
      color: white;
      padding: 16px;
      text-align: center;
      font-size: 18px;
    }
    .chat-container {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }
    .message {
      margin-bottom: 12px;
      padding: 10px 14px;
      border-radius: 18px;
      max-width: 80%;
      word-wrap: break-word;
      white-space: pre-wrap;
    }
    .message.user {
      background: #4a90d9;
      color: white;
      margin-left: auto;
    }
    .message.assistant {
      background: white;
      color: #333;
      box-shadow: 0 1px 2px rgba(0,0,0,0.1);
    }
    .message.loading {
      background: #eee;
      color: #888;
    }
    .input-container {
      padding: 16px;
      background: white;
      border-top: 1px solid #ddd;
      display: flex;
      gap: 10px;
    }
    input[type="text"] {
      flex: 1;
      padding: 12px 16px;
      border: 1px solid #ddd;
      border-radius: 24px;
      font-size: 16px;
      outline: none;
    }
    input[type="text"]:focus {
      border-color: #4a90d9;
    }
    button {
      background: #4a90d9;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 24px;
      font-size: 16px;
      cursor: pointer;
    }
    button:hover {
      background: #3a7bc8;
    }
    button:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
  </style>
</head>
<body>
  <div class="header">OpenClaw Chat</div>
  <div class="chat-container" id="chat"></div>
  <div class="input-container">
    <input type="text" id="input" placeholder="输入消息..." autofocus>
    <button id="send" onclick="sendMessage()">发送</button>
  </div>

  <script>
    const chatEl = document.getElementById('chat');
    const inputEl = document.getElementById('input');
    const sendBtn = document.getElementById('send');
    const sessionId = 'session-' + Date.now();

    function addMessage(text, type) {
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

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  </script>
</body>
</html>`);
});

// 启动服务
app.start();

console.log('\n打开浏览器访问: http://localhost:3002');