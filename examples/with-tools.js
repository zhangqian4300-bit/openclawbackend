/**
 * 工具注册示例：OpenClaw 调用后端接口
 *
 * 展示如何让 OpenClaw Skill 调用你的后端 API
 */

import { OpenClawBackend } from '../src/index.js';
import sqlite from 'sqlite3';

const db = sqlite.database('app.db');
const app = new OpenClawBackend({ port: 3000 });

// ========== 注册工具（OpenClaw 可以调用） ==========

// 工具 1: 查询用户
app.tool('getUser', async ({ userId }) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
      if (err) reject(err);
      else resolve(row || { id: userId, name: 'Unknown' });
    });
  });
});

// 工具 2: 保存测评结果
app.tool('saveAssessment', async ({ userId, result }) => {
  return new Promise((resolve) => {
    db.run(
      'INSERT INTO assessments (userId, result, createdAt) VALUES (?, ?, ?)',
      [userId, JSON.stringify(result), Date.now()],
      (err) => resolve({ success: !err })
    );
  });
});

// 工具 3: 查询历史测评
app.tool('getHistory', async ({ userId, limit = 10 }) => {
  return new Promise((resolve) => {
    db.all(
      'SELECT * FROM assessments WHERE userId = ? ORDER BY createdAt DESC LIMIT ?',
      [userId, limit],
      (err, rows) => resolve(rows || [])
    );
  });
});

// ========== 注册 Skill ==========

app.skill('xinshi-assessment', { path: '/assessment' });

// ========== 自定义路由 ==========

// 用户管理接口
app.post('/users', async (req, res) => {
  const { name, email } = req.body;
  // 这里可以写数据库逻辑
  res.json({ id: Date.now(), name, email });
});

// 查询历史
app.get('/assessments/:userId', async (req, res) => {
  const result = await app.tools.get('getHistory')({ userId: req.params.userId });
  res.json(result);
});

// ========== 启动 ==========

// 创建测试表
db.serialize(() => {
  db.run('CREATE TABLE IF NOT EXISTS assessments (id INTEGER PRIMARY KEY, userId TEXT, result TEXT, createdAt INTEGER)');
});

app.start();

console.log('\n✅ 后端已启动！');
console.log('\n注册的工具:');
console.log('- getUser: 查询用户信息');
console.log('- saveAssessment: 保存测评结果');
console.log('- getHistory: 查询历史测评');
console.log('\n测试:');
console.log('curl -X POST http://localhost:3000/_tool/getUser -H "Content-Type: application/json" -d \'{"userId": "user-123"}\'');
