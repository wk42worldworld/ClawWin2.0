const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.openclaw', 'openclaw.json'), 'utf-8'));
const TOKEN = config.gateway.auth.token;

const ws = new WebSocket('ws://127.0.0.1:39527');

ws.on('open', () => console.log('[连接]'));

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

  // 跳过 health 和 tick
  if (msg.type === 'event' && (msg.event === 'health' || msg.event === 'tick')) return;

  const str = JSON.stringify(msg);
  console.log(`[${new Date().toISOString()}] ${msg.type}/${msg.event || msg.id}:`, str.substring(0, 600));
  if (str.length > 600) console.log('  ...截断, 总长:', str.length);

  if (msg.type === 'event' && msg.event === 'connect.challenge') {
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

  if (msg.type === 'res' && msg.id === 'c1' && msg.ok) {
    console.log('[发送 chat.send]');
    ws.send(JSON.stringify({
      type: 'req', id: 'chat1', method: 'chat.send',
      params: { sessionKey: 'main', message: '说你好', deliver: false, idempotencyKey: 'k-' + Date.now() }
    }));
  }
});

ws.on('error', (err) => console.log('[错误]', err.message));
ws.on('close', (code) => console.log('[关闭]', code));
setTimeout(() => { console.log('[结束]'); ws.close(); process.exit(0); }, 45000);
