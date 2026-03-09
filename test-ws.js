const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.openclaw', 'openclaw.json'), 'utf-8'));
const TOKEN = config.gateway.auth.token;
const PORT = config.gateway.port;

console.log('Token:', TOKEN);
console.log('Port:', PORT);

const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
let connected = false;

ws.on('open', () => {
  console.log('WebSocket 已连接');
  connected = true;
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('收到:', JSON.stringify(msg).substring(0, 300));

  if (msg.type === 'event' && msg.event === 'connect.challenge') {
    const connectReq = {
      type: 'req',
      id: 'test-1',
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: { id: 'webchat-ui', version: '1.0.0', platform: 'win32', mode: 'webchat' },
        role: 'operator',
        scopes: ['operator.admin'],
        caps: [],
        auth: { token: TOKEN },
        locale: 'zh-CN'
      }
    };
    ws.send(JSON.stringify(connectReq));
    console.log('已发送 connect 请求');
  }

  if (msg.type === 'res' && msg.id === 'test-1') {
    if (msg.ok) {
      console.log('连接成功！发送测试消息...');
      const chatReq = {
        type: 'req',
        id: 'test-2',
        method: 'chat.send',
        params: {
          sessionKey: 'main',
          message: '你好，请用一句话回复',
          deliver: false,
          idempotencyKey: 'test-idem-' + Date.now()
        }
      };
      ws.send(JSON.stringify(chatReq));
      console.log('已发送 chat.send');
    } else {
      console.log('连接失败:', JSON.stringify(msg.error));
    }
  }

  if (msg.type === 'res' && msg.id === 'test-2') {
    console.log('chat.send 响应:', msg.ok ? '成功' : '失败', JSON.stringify(msg.error || msg.payload));
  }

  if (msg.type === 'event' && msg.event === 'chat') {
    const p = msg.payload || {};
    console.log('Chat 事件 state=' + p.state, JSON.stringify(p).substring(0, 200));
  }
});

ws.on('error', (err) => { console.log('错误:', err.message); });
ws.on('close', (code, reason) => { console.log('关闭:', code, reason.toString()); });

setTimeout(() => {
  if (!connected) console.log('超时：未能连接');
  console.log('测试结束');
  ws.close();
  process.exit(0);
}, 20000);
