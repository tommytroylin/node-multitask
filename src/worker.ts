import { MessageFromMaster, MessageType, MessageFromWorker, Result } from  '../types/index';

process.on('message', async (message: MessageFromMaster) => {
  const payload = { ...message.payload };
  const timeout = payload.timeout && payload.timeout < 1800000 ? payload.timeout : 1800000; // 30 min
  const receive: MessageFromWorker = { type: MessageType.receive, time: Date.now(), payload };
  let timer;
  process.send(receive);
  try {
    const start: MessageFromWorker = { type: MessageType.start, time: Date.now(), payload };
    process.send(start);
    let result;
    timer = setTimeout(() => {
      (payload as Result).error = new Error(`Task ${message.payload.uuid} is timeout \n Start Time: ${start.time}\n Worker file: ${payload.work}\n Worker data: ${payload.data}`);
      const finish: MessageFromWorker = { type: MessageType.finish, time: Date.now(), payload, willExit: true };
      process.send(finish);
      process.exit(1);
    }, timeout);
    result = require(payload.work)(payload.data);
    if (result instanceof Promise || typeof result.then === 'function') {
      result = await result;
    }
    clearTimeout(timer);
    (payload as Result).result = result;
    const finish: MessageFromWorker = { type: MessageType.finish, time: Date.now(), payload };
    process.send(finish);
  } catch (error) {
    clearTimeout(timer);
    console.error(error);
    (payload as Result).error = error;
    const finish: MessageFromWorker = { type: MessageType.finish, time: Date.now(), payload };
    process.send(finish);
  }
});
