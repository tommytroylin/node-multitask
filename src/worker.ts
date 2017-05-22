import { Message } from  '../types';

import { NodeVM } from 'vm2';

function objectifyError(error: Error): Message.ErrorObject {
  const { message } = error;
  return { message };
}

function generate(message: Message.FromMaster, overwrites?, payloadOverwrites?): Message.FromWorker {
  const result = Object.assign({}, message) as Message.FromWorker;
  result.time = Date.now();
  Object.assign(result, overwrites);
  if (result.payload) {
    Object.assign(result.payload, payloadOverwrites);
  } else {
    result.payload = payloadOverwrites;
  }
  return result;
}

process.on('message', async (message: Message.FromMaster) => {
  switch (message.type) {
    case Message.Type.heartbeat:
      process.send(generate(message));
      return;
    case Message.Type.dispatch:
      const { code, data, virtualFilePath } = message.payload;
      const vm = new NodeVM({
        console: 'inherit',
        sandbox: data || {},
        require: {
          external: true,
          builtin: [
            'assert',
            'buffer',
            'crypto',
            'dns',
            'events',
            'http',
            'https',
            'net',
            'path',
            'punycode',
            'querystring',
            'stream',
            'string_decoder',
            'tls',
            'dgram',
            'url',
            'zlib',
            'util',
          ],
        },
      });
      process.send(generate(message, { type: Message.Type.start }));
      try {
        const result: any = vm.run(code, virtualFilePath);
        let data;
        if (result && result.then) {
          data = await result;
        } else {
          data = result;
        }
        process.send(generate(message, { type: Message.Type.finish }, { data }));
      } catch (e) {
        const error = objectifyError(e);
        process.send(generate(message, { type: Message.Type.finish }, { error }));
      }
      break;
    default:
      return;
  }
});

process.on('uncaughtException', (err) => {
  process.send({ type: Message.Type.uncaughtException, time: Date.now() });
});
