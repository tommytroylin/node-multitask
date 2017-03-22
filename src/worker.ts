import {
  MessageFromMaster,
  MessageType,
  MessageFromWorker,
  Result,
  ErrorObject,
} from  '../types/index';

function objectifyError(error: Error): ErrorObject {
  const { message } = error;
  return { message };
}

process.on('message', async (message: MessageFromMaster) => {
  const payload = { ...message.payload };
  const timeout = payload.timeout && payload.timeout < payload.maxTimeout ? payload.timeout : payload.maxTimeout; // 1h
  const receive: MessageFromWorker = { type: MessageType.receive, time: Date.now(), payload };
  const start: MessageFromWorker = { type: MessageType.start, time: Date.now(), payload };
  process.send(receive);
  process.send(start);
  const work = Promise.race([
    new Promise((resolve, reject) => {
      try {
        const result = require(payload.work)(payload.data);
        if (result instanceof Promise || typeof result.then === 'function') {
          result.then(r => resolve(r));
        } else {
          resolve(result);
        }
      } catch (e) {
        reject(e)
      }
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Task ${message.payload.uuid} is timeout \n Start Time: ${start.time}\n Worker file: ${payload.work}\n Worker data: ${payload.data}`)), timeout)),
  ]);
  try {
    (payload as Result).result = await work;
  } catch (error) {
    (payload as Result).error = objectifyError(error);
  } finally {
    const finish: MessageFromWorker = { type: MessageType.finish, time: Date.now(), payload };
    process.send(finish);
  }
});
