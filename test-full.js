const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');
const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.openclaw', 'openclaw.json'), 'utf-8'));
const ws = new WebSocket('ws://127.0.0.1:' + config.gateway.port);

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

  if (msg.type === 'event' && msg.event === 'connect.challenge') {
    ws.send(JSON.stringify({ type: 'req', id: 'c1', method: 'connect', params: { minProtocol: 3, maxProtocol: 3, client: { id: 'webchat-ui', version: '1.0.0', platform: 'Win32', mode: 'webchat' }, role: 'operator', scopes: ['operator.admin'], caps: [], auth: { token: config.gateway.auth.token }, locale: 'zh-CN' } }));
    return;
  }

  if (msg.type === 'res' && msg.id === 'c1' && msg.ok) {
    console.log('[OK] 发送消息...');
    ws.send(JSON.stringify({ type: 'req', id: 'q1', method: 'chat.send', params: { sessionKey: 'fulltest-' + Date.now(), message: '你好', deliver: false, idempotencyKey: 'ft-' + Date.now() } }));
    return;
  }

  if (msg.type === 'res' && msg.id === 'q1') {
    console.log('[chat.send]', JSON.stringify(msg.payload));
    return;
  }

  if (msg.type === 'event') {
    if (msg.event === 'tick' || msg.event === 'health') return;

    const p = msg.payload || {};
    if (msg.event === 'chat') {
      const c = p.message && p.message.content;
      const t = Array.isArray(c) ? c.map(b => b.text || '').join('') : (typeof c === 'string' ? c : '');
      console.log('[chat] state=' + p.state + ' seq=' + p.seq + ' text=' + JSON.stringify(t || '(无)'));
      if (p.state === 'final' && t) {
        console.log('\n=== AI 回复 ===\n' + t);
      }
    } else if (msg.event === 'agent') {
      console.log('[agent]', JSON.stringify(p).substring(0, 200));
    } else {
      console.log('[' + msg.event + ']', JSON.stringify(p).substring(0, 200));
    }
  }
});

ws.on('error', (e) => console.log('错误:', e.message));
setTimeout(() => { console.log('\n[60秒超时]'); ws.close(); process.exit(0); }, 60000);
