// Step 2: 测试 openclaw Gateway 后端能否正常返回 AI 响应
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.openclaw', 'openclaw.json'), 'utf-8'));
const TOKEN = config.gateway.auth.token;
const PORT = config.gateway.port || 39527;

console.log(`[Step 2] 测试 openclaw Gateway (port ${PORT})`);
console.log('---');

const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
let connected = false;

ws.on('open', () => console.log('[连接] WebSocket 已打开'));

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

  // 1. Handle challenge
  if (msg.type === 'event' && msg.event === 'connect.challenge') {
    console.log('[认证] 收到 challenge，发送 connect...');
    ws.send(JSON.stringify({
      type: 'req', id: 'c1', method: 'connect',
      params: {
        minProtocol: 3, maxProtocol: 3,
        client: { id: 'webchat-ui', version: '1.0.0', platform: 'win32', mode: 'webchat' },
        role: 'operator', scopes: ['operator.admin'], caps: [],
        auth: { token: TOKEN }, locale: 'zh-CN'
      }
    }));
  }

  // 2. After connect, send chat message
  if (msg.type === 'res' && msg.id === 'c1') {
    if (msg.ok) {
      connected = true;
      console.log('[认证] 连接成功!');
      console.log('[发送] 发送消息: "say hello"');
      ws.send(JSON.stringify({
        type: 'req', id: 'chat1', method: 'chat.send',
        params: {
          sessionKey: 'test-step2',
          message: 'say hello',
          deliver: false,
          idempotencyKey: 'k-' + Date.now()
        }
      }));
    } else {
      console.log('[认证失败]', JSON.stringify(msg));
    }
  }

  // 3. Print chat.send response
  if (msg.type === 'res' && msg.id === 'chat1') {
    console.log('[chat.send 响应]', JSON.stringify(msg).substring(0, 300));
  }

  // 4. Print ALL events (except tick/health)
  if (msg.type === 'event' && msg.event !== 'tick' && msg.event !== 'health') {
    const payload = msg.payload;
    const eventStr = JSON.stringify(payload);

    if (msg.event === 'chat') {
      console.log(`\n[EVENT chat] state=${payload?.state}`);
      if (payload && payload.message) {
        const m = payload.message;
        if (typeof m === 'string') {
          console.log('[AI 回复]:', m.substring(0, 500));
        } else if (m.content) {
          // content is array of {type, text}
          const text = Array.isArray(m.content)
            ? m.content.map(c => c.text || '').join('')
            : String(m.content);
          console.log('[AI 回复]:', text.substring(0, 500));
        } else {
          console.log('[message 对象]:', JSON.stringify(m).substring(0, 500));
        }
      } else if (payload && payload.state === 'final') {
        console.log('[警告] state=final 但没有 message 字段');
        console.log('[完整 payload]:', eventStr.substring(0, 500));
      }
    } else if (msg.event === 'agent') {
      console.log(`[EVENT agent] phase=${payload?.phase}, agentId=${payload?.agentId}`);
      if (payload?.error) console.log('  [错误]:', payload.error);
    } else if (msg.event === 'chat.chunk') {
      // 流式文本块
      const text = payload?.text || payload?.content || payload?.delta || '';
      process.stdout.write(text);
    } else if (msg.event === 'chat.stream') {
      console.log(`[EVENT chat.stream]`, eventStr.substring(0, 300));
    } else if (msg.event === 'connect.challenge') {
      // skip
    } else {
      console.log(`[EVENT ${msg.event}]`, eventStr.substring(0, 300));
    }
  }
});

ws.on('error', (err) => console.log('[WebSocket 错误]', err.message));
ws.on('close', () => console.log('[WebSocket 关闭]'));

// 60 秒超时
setTimeout(() => {
  console.log('\n\n[超时] 60 秒已到，关闭连接');
  ws.close();
  process.exit(0);
}, 60000);
