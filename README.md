# OpenClaw Model API Proxy

透明代理模型 API，记录所有请求/响应内容。

## 🚀 快速开始

```bash
cd ~/workspace/openclaw-model-proxy
node server.js
```

## 📋 配置 OpenClaw

在 OpenClaw 配置文件中设置：

```env
# Anthropic
ANTHROPIC_BASE_URL=http://localhost:3456/v1

# 或 OpenAI
OPENAI_BASE_URL=http://localhost:3456/v1

# 或智谱
ZHIPU_BASE_URL=http://localhost:3456/v1
```

## 🔍 查看日志

### 实时日志
服务器会在终端输出所有请求/响应。

### API 查询

**查看所有请求：**
```bash
curl http://localhost:3456/_logs
```

**查看统计：**
```bash
curl http://localhost:3456/_stats
```

## 📊 日志内容

每个请求记录包含：

```json
{
  "id": 1,
  "timestamp": "2026-03-01T04:35:00.000Z",
  "method": "POST",
  "path": "/v1/messages",
  "targetApi": "anthropic",
  "body": {
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 4096,
    "messages": [
      {
        "role": "user",
        "content": "Hello!"
      }
    ],
    "system": "You are a helpful assistant.",
    "tools": [...]
  },
  "response": {
    "status": 200,
    "duration": 1234,
    "body": {
      "content": [...],
      "usage": {
        "input_tokens": 100,
        "output_tokens": 50
      }
    }
  }
}
```

## 🎯 使用场景

1. **调试** - 查看实际发送的 prompt
2. **优化** - 分析 token 使用情况
3. **审计** - 记录所有模型调用
4. **成本分析** - 统计 API 费用

## 🔧 高级功能（TODO）

- [ ] 保存到文件/数据库
- [ ] WebSocket 实时推送
- [ ] Web 仪表板
- [ ] 成本计算
- [ ] 敏感信息过滤
- [ ] 请求修改/注入

## ⚠️ 注意事项

- 仅用于开发/调试
- 不要在生产环境使用
- 日志可能包含敏感信息
