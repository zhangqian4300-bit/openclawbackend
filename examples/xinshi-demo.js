/**
 * 心石清理师示例：完整的 Skill 用法
 *
 * 运行前确保：
 * 1. OpenClaw Gateway 正在运行
 * 2. xinshi-assessment Skill 已安装
 */

import { OpenClawBackend } from '../src/index.js';

const app = new OpenClawBackend({
  port: 3000,
  gatewayPort: 19000  // 指定 Gateway 端口
});

// 注册心石清理师 Skill
app.skill('xinshi-assessment', {
  path: '/assessment',
  // 自定义 sessionId 生成
  sessionId: (req) => {
    return `xinshi-${req.body.userId || 'anonymous'}-${Date.now()}`;
  },
  // 自定义动作映射
  actions: {
    start: { message: '开始测评' },
    submit: { message: (req) => req.body.message || req.body }
  }
});

// 通用聊天接口
app.chat('/chat', (req) => `chat-${req.ip}`);

// 启动服务
app.start();

console.log('\n✅ 心石清理师后端已启动！');
console.log('\n测试接口：');
console.log('1. 开始测评:');
console.log('   curl -X POST http://localhost:3000/assessment/start -H "Content-Type: application/json" -d \'{"userId": "user-123"}\'');
console.log('\n2. 提交答案:');
console.log('   curl -X POST http://localhost:3000/assessment/submit -H "Content-Type: application/json" -d \'{"userId": "user-123", "message": "1A 2B 3A 4B 5A 6B 7A 8A 9A 10B"}\'');
console.log('\n3. 通用聊天:');
console.log('   curl -X POST http://localhost:3000/chat -H "Content-Type: application/json" -d \'{"message": "你好"}\'');
