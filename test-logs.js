const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.openclaw', 'openclaw.json'), 'utf-8'));
const TOKEN = config.gateway.auth.token;

const ws = new WebSocket('ws://127.0.0.1:39527');

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

  if (msg.type === 'event' && msg.event === 'connect.challenge') {
    ws.send(JSON.stringify({
      type: 'req', id: 'c1', method: 'connect',
      params: { minProtocol: 3, maxProtocol: 3,
        client: { id: 'webchat-ui', version: '1.0.0', platform: 'win32', mode: 'webchat' },
        role: 'operator', scopes: ['operator.admin'], caps: [],
        auth: { token: TOKEN }, locale: 'zh-CN' }
    }));
  }

  if (msg.type === 'res' && msg.id === 'c1' && msg.ok) {
    // Subscribe to logs
    ws.send(JSON.stringify({ type: 'req', id: 'logs1', method: 'logs.tail', params: { lines: 50 } }));

    // Wait a moment then send chat
    setTimeout(() => {
      console.log('\n[发送消息]');
      ws.send(JSON.stringify({
        type: 'req', id: 'chat1', method: 'chat.send',
        params: { sessionKey: 'main', message: '说你好', deliver: false, idempotencyKey: 'k-' + Date.now() }
      }));
    }, 1000);
  }

  // Print ALL events and responses (including logs)
  if (msg.type === 'event' && msg.event !== 'tick' && msg.event !== 'health') {
    const payload = msg.payload;
    if (msg.event === 'log' || msg.event === 'logs') {
      console.log('[LOG]', JSON.stringify(payload).substring(0, 500));
    } else {
      console.log(`[EVENT ${msg.event}]`, JSON.stringify(payload).substring(0, 500));
    }
  }

  if (msg.type === 'res' && msg.id !== 'c1') {
    console.log(`[RES ${msg.id}]`, JSON.stringify(msg).substring(0, 500));
  }
});

ws.on('error', (err) => console.log('[错误]', err.message));
setTimeout(() => { console.log('\n[结束]'); ws.close(); process.exit(0); }, 30000);
