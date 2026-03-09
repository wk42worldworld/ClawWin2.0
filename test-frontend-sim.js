// 模拟前端完全一样的参数测试
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.openclaw', 'openclaw.json'), 'utf-8'));
const TOKEN = config.gateway.auth.token;
const PORT = config.gateway.port || 39527;

console.log(`[测试] 模拟前端 sessionKey='main'`);

const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

  if (msg.type === 'event' && msg.event === 'connect.challenge') {
    ws.send(JSON.stringify({
      type: 'req', id: 'c1', method: 'connect',
      params: {
        minProtocol: 3, maxProtocol: 3,
        client: { id: 'webchat-ui', version: '1.0.0', platform: 'Win32', mode: 'webchat' },
        role: 'operator', scopes: ['operator.admin'], caps: [],
        auth: { token: TOKEN }, locale: 'zh-CN'
      }
    }));
  }

  if (msg.type === 'res' && msg.id === 'c1' && msg.ok) {
    console.log('[连接成功]');
    setTimeout(() => {
      console.log('[发送] sessionKey=main, message="你好"');
      ws.send(JSON.stringify({
        type: 'req', id: 'chat1', method: 'chat.send',
        params: {
          sessionKey: 'main',
          message: '你好',
          deliver: false,
          idempotencyKey: 'k-' + Date.now()
        }
      }));
    }, 500);
  }

  if (msg.type === 'res' && msg.id === 'chat1') {
    console.log('[chat.send 响应]', JSON.stringify(msg).substring(0, 300));
  }

  if (msg.type === 'event' && msg.event === 'chat') {
    const p = msg.payload;
    console.log(`\n[chat event] state=${p?.state}, runId=${p?.runId}`);
    if (p?.message) {
      const c = p.message.content;
      if (Array.isArray(c)) {
        const text = c.map(b => b.text || '').join('');
        console.log('[内容]:', text);
      } else if (typeof c === 'string') {
        console.log('[内容]:', c);
      } else {
        console.log('[message 原始]:', JSON.stringify(p.message).substring(0, 500));
      }
    } else {
      console.log('[无 message 字段] payload:', JSON.stringify(p).substring(0, 500));
    }
  }

  if (msg.type === 'event' && msg.event === 'agent') {
    const p = msg.payload;
    console.log(`[agent] phase=${p?.phase}`);
  }
});

ws.on('error', (err) => console.log('[错误]', err.message));
setTimeout(() => { ws.close(); process.exit(0); }, 60000);
