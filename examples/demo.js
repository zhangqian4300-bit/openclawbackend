/**
 * 基础示例：最简用法
 *
 * 运行前确保 OpenClaw Gateway 正在运行：
 * openclaw gateway --port 19000 &
 */

import { OpenClawBackend } from '../src/index.js';

const app = new OpenClawBackend({ port: 3000 });

// 注册通用聊天接口
app.chat();

// 注册一个示例工具
app.tool('echo', async (params) => {
  return {
    message: params.message || 'Hello!',
    timestamp: new Date().toISOString()
  };
});

// 启动服务
app.start();

console.log('\n测试：');
console.log('curl -X POST http://localhost:3000/chat -H "Content-Type: application/json" -d \'{"message": "你好"}\'');