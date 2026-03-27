/**
 * 基础测试脚本
 */

import { OpenClawBackend } from '../src/index.js';

console.log('🧪 OpenClaw Backend Framework 测试\n');

// 测试 1: 创建实例
console.log('测试 1: 创建实例');
try {
  const app = new OpenClawBackend({ port: 3001 });
  console.log('✅ 通过\n');
} catch (e) {
  console.log(`❌ 失败：${e.message}\n`);
}

// 测试 2: 注册 Skill
console.log('测试 2: 注册 Skill');
try {
  const app = new OpenClawBackend({ port: 3001 });
  app.skill('test-skill', { path: '/test' });
  console.log('✅ 通过\n');
} catch (e) {
  console.log(`❌ 失败：${e.message}\n`);
}

// 测试 3: 注册工具
console.log('测试 3: 注册工具');
try {
  const app = new OpenClawBackend({ port: 3001 });
  app.tool('test-tool', async (data) => ({ result: data }));
  console.log(`   可用工具：${[...app.tools.keys()].join(', ')}\n`);
  console.log('✅ 通过\n');
} catch (e) {
  console.log(`❌ 失败：${e.message}\n`);
}

// 测试 4: 注册聊天接口
console.log('测试 4: 注册聊天接口');
try {
  const app = new OpenClawBackend({ port: 3001 });
  app.chat('/chat');
  console.log('✅ 通过\n');
} catch (e) {
  console.log(`❌ 失败：${e.message}\n`);
}

// 测试 5: 中间件
console.log('测试 5: 中间件');
try {
  const app = new OpenClawBackend({ port: 3001 });
  app.use((req, res, next) => { next(); });
  console.log('✅ 通过\n');
} catch (e) {
  console.log(`❌ 失败：${e.message}\n`);
}

// 测试 6: 配置加载
console.log('测试 6: 配置加载');
try {
  const app = new OpenClawBackend({
    port: 3001,
    gatewayPort: 19000,
    logLevel: 'debug'
  });
  console.log(`   Port: ${app.config.port}`);
  console.log(`   Gateway Port: ${app.config.gatewayPort}`);
  console.log(`   Log Level: ${app.config.logLevel}`);
  console.log('✅ 通过\n');
} catch (e) {
  console.log(`❌ 失败：${e.message}\n`);
}

console.log('=================================');
console.log('所有基础测试完成！');
console.log('=================================\n');

console.log('集成测试需要 OpenClaw Gateway 运行：');
console.log('openclaw gateway --port 19000 &\n');
console.log('然后运行：npm run demo');
