import { MessageFromMaster, MessageType, MessageFromWorker, Result } from  '../types/index';

process.on('message', async(message: MessageFromMaster) => {
  const payload = message.payload;
  const receive: MessageFromWorker = { type: MessageType.receive, time: Date.now(), payload };
  process.send(receive);
  try {
    const start: MessageFromWorker = { type: MessageType.start, time: Date.now(), payload };
    process.send(start);
    let result;
    result = require(payload.work)(payload.data);
    if (result instanceof Promise || typeof result.then === 'function') {
      result = await result;
    }
    (payload as Result).result = result;
    const finish: MessageFromWorker = { type: MessageType.finish, time: Date.now(), payload };
    process.send(finish);
  } catch (error) {
    console.error(error);
    (payload as Result).error = error;
    const finish: MessageFromWorker = { type: MessageType.finish, time: Date.now(), payload };
    process.send(finish);
  }
});
