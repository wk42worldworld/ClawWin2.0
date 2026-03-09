// 对比测试：main vs fresh session
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.openclaw', 'openclaw.json'), 'utf-8'));
const TOKEN = config.gateway.auth.token;
const PORT = config.gateway.port || 39527;

const FRESH_KEY = 'fresh-' + Date.now();
console.log(`[对比测试] main vs ${FRESH_KEY}`);

const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
const results = {};

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
    console.log('[连接成功] 发送两条消息...\n');

    // Test 1: fresh session
    ws.send(JSON.stringify({
      type: 'req', id: 'fresh1', method: 'chat.send',
      params: { sessionKey: FRESH_KEY, message: '说你好', deliver: false, idempotencyKey: 'f-' + Date.now() }
    }));

    // Test 2: main session (delayed slightly)
    setTimeout(() => {
      ws.send(JSON.stringify({
        type: 'req', id: 'main1', method: 'chat.send',
        params: { sessionKey: 'main', message: '说你好', deliver: false, idempotencyKey: 'm-' + Date.now() }
      }));
    }, 2000);
  }

  if (msg.type === 'event' && msg.event === 'chat') {
    const p = msg.payload;
    const sk = p?.sessionKey || '?';
    const state = p?.state;

    if (state === 'final') {
      let text = '(无内容)';
      if (p?.message?.content) {
        const c = p.message.content;
        text = Array.isArray(c) ? c.map(b => b.text || '').join('') : String(c);
      }
      console.log(`[${sk}] state=final => "${text}"`);
      results[sk] = text;

      if (Object.keys(results).length >= 2) {
        console.log('\n=== 对比结果 ===');
        console.log(`main 会话: "${results['main'] || results['?'] || '(无)'}"`);
        console.log(`新会话(${FRESH_KEY}): "${results[FRESH_KEY] || '(无)'}"`);
        setTimeout(() => { ws.close(); process.exit(0); }, 1000);
      }
    }
  }
});

ws.on('error', (err) => console.log('[错误]', err.message));
setTimeout(() => { console.log('\n[超时]'); ws.close(); process.exit(0); }, 90000);
