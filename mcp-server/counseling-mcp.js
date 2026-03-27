#!/usr/bin/env node

/**
 * Counseling Query MCP Server
 * 提供心理咨询资源查询工具给 OpenClaw Gateway
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// 心理咨询数据
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

// 创建 MCP 服务器
const server = new Server(
  {
    name: 'counseling-query-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 处理工具列表请求
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'counseling_query',
        description: '心理咨询资源查询工具。用于查询心理咨询师列表、预约信息、服务详情和价格信息。action 参数可以是: list_counselors（查询咨询师）、get_appointment（预约信息）、get_services（服务列表）、get_pricing（价格信息）',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['list_counselors', 'get_appointment', 'get_services', 'get_pricing'],
              description: '查询类型：list_counselors=咨询师列表, get_appointment=预约信息, get_services=服务列表, get_pricing=价格信息'
            },
            userId: {
              type: 'string',
              description: '用户ID（可选）'
            }
          },
          required: ['action']
        }
      }
    ]
  };
});

// 处理工具调用请求
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== 'counseling_query') {
    throw new Error(`Unknown tool: ${name}`);
  }

  const action = args.action || 'get_services';

  let result;
  switch (action) {
    case 'list_counselors':
      result = {
        success: true,
        counselors: counselors.filter(c => c.available),
        total: counselors.length,
        message: '查询成功，当前有2位咨询师可预约'
      };
      break;

    case 'get_appointment':
      result = {
        success: true,
        appointments,
        counselors: counselors.filter(c => c.available).map(c => c.name),
        message: '预约信息查询成功'
      };
      break;

    case 'get_services':
      result = {
        success: true,
        services,
        message: '服务列表查询成功'
      };
      break;

    case 'get_pricing':
      result = {
        success: true,
        pricing,
        note: '会员可享受额外10%优惠',
        message: '价格查询成功'
      };
      break;

    default:
      result = {
        success: false,
        error: '未知的查询类型',
        availableActions: ['list_counselors', 'get_appointment', 'get_services', 'get_pricing']
      };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Counseling Query MCP Server started');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});