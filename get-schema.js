const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.openclaw', 'openclaw.json'), 'utf-8'));
const TOKEN = config.gateway.auth.token;

const ws = new WebSocket('ws://127.0.0.1:39527');

ws.on('open', () => console.log('连接成功'));

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

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
    // 获取配置 schema
    ws.send(JSON.stringify({
      type: 'req', id: 'schema1', method: 'config.schema', params: {}
    }));
  }

  if (msg.type === 'res' && msg.id === 'schema1') {
    // 输出 schema 中关于 models.providers 的部分
    const schema = msg.payload?.schema;
    if (schema) {
      // 递归查找包含 "api" 的 schema 定义
      const find = (obj, path) => {
        if (!obj || typeof obj !== 'object') return;
        if (path.endsWith('.api') || path.endsWith('/api')) {
          console.log(`\n=== ${path} ===`);
          console.log(JSON.stringify(obj, null, 2));
        }
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === 'object' && v !== null) {
            find(v, `${path}.${k}`);
          }
        }
      };
      find(schema, 'root');

      // Also dump the providers part
      const props = schema?.properties?.models?.properties?.providers;
      if (props) {
        console.log('\n=== models.providers schema ===');
        console.log(JSON.stringify(props, null, 2).substring(0, 3000));
      }
    }
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => console.log('错误:', err.message));
setTimeout(() => { console.log('超时'); ws.close(); process.exit(1); }, 10000);
