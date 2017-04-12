import { fork } from 'child_process';
import { cpus } from 'os';
import { v4 as uuidV4 } from 'uuid';
import 'core-js/fn/object/entries';
import 'core-js/fn/object/values';

import { Task, Message, Process, Options } from  '../types';
import Child = Process.Child;

const numberOfCPUs = cpus().length;

function parseError({ message }: Message.ErrorObject): Error {
  return new Error(`${message}`);
}

export class MultiTask {

  private initialized = false;
  private processes: Process.Registry = {};
  private options: Options;
  private tasks: Task.Registry = {};
  private pendingTaskUUIDs: Array<string> = [];

  constructor(options: Options = {}) {
    const defaultOptions: Options = {
      logger: console.log,
      heartbeatInterval: 60 * 1000,
      maxQueue: 1,
      maxTimeout: 20 * 60 * 1000,
      maxHeartbeatLoss: 5,
    };
    this.options = Object.assign({}, defaultOptions, options);
  }

  init() {
    this.initialize();
  }

  initialize() {
    if (this.initialized) {
      return;
    }
    this.options.logger(`Initializing Master ${process.pid}`);
    const { thread = numberOfCPUs - 1 } = this.options;
    for (let i = 0; i < thread; i += 1) {
      this._startWorker();
    }
    this.initialized = true;
    setInterval(() => this._checkHeartbeat(), this.options.heartbeatInterval);
  }

  private _startWorker() {
    const newProcess: Process.Child = { reference: fork(`${__dirname}/worker`, [], this.options.forkWorkerOptions), runningJobs: [], heartbeatLoss: 0 };
    this.options.logger(`Initializing Worker ${newProcess.reference.pid}`);
    this.processes[newProcess.reference.pid] = newProcess;
    newProcess.reference.on('message', this.__generateWorkerMessageHandler(newProcess));
  }

  // when 'uncaughtException' happens in one worker
  // we need stop dispatching tasks to him, wait other tasks to be finished
  // and reject the running task
  private _cooldownWorker(childPID: number) {
    const child = this.processes[childPID];
    child.uncaughtException = true;
    if (child.runningJobs.length === 1) {
      this._terminateWorker(childPID);
    } else {
      setTimeout(() => {
        this._terminateWorker(childPID);
      }, this.options.maxTimeout);
    }

  }

  private _terminateWorker(childPID: number) {
    const child = this.processes[childPID];
    if (child) {
      this.options.logger(`Worker ${childPID} needs to be terminated`);
      child.reference.removeAllListeners();
      child.reference.kill();
      process.kill(childPID);
      delete this.processes[childPID];
      Object.values(this.tasks).filter(t => t.on === child).forEach((t) => {
        // TODO reassign dispatched (not started) task to other worker
        t.reject(new Error('Child Process is terminated because of uncaughtException / timeout / no heartbeat'));
        t.type = Task.Type.finished;
      });
    }
  }

  private _getLightLoadedWorker(): string | null {
    const [childPID, childInstance] = Object.entries(this.processes)
      .filter((e) => !e[1].uncaughtException)
      .reduce((p, c) => {
        return (p[1] as Process.Child).runningJobs.length > c[1].runningJobs.length ? c : p;
      });
    if (childInstance.runningJobs.length >= this.options.maxQueue) {
      return null;
    }
    return childPID;
  }

  private _dispatchTask(taskUUID: string, childPID: string) {
    const task = this.tasks[taskUUID];
    const child = this.processes[childPID];
    if (!task) {
      throw new Error('Try to dispatch a non-exist task');
    }
    if (!child) {
      throw new Error('Try to dispatch a task to a non-exist worker');
    }
    const dispatch: Message.FromMaster = {
      type: Message.Type.dispatch,
      time: Date.now(),
      payload: { ...task },
    };
    task.on = child;
    task.type = Task.Type.dispatched;
    child.reference.send(dispatch);
  }

  private __generateWorkerMessageHandler(newProcess: Process.Child) {
    return (message: Message.FromWorker) => {
      const fromPID = newProcess.reference.pid;
      const task = message.payload && this.tasks[message.payload.uuid];
      switch (message.type) {
        case Message.Type.start:
          this.options.logger(`Worker ${fromPID} started running Task ${message.payload.uuid} at ${message.time}`);
          task.type = Task.Type.started;
          newProcess.runningJobs.push(task);
          break;
        case Message.Type.finish:
          this.options.logger(`Worker ${fromPID} finished running Task ${message.payload.uuid} at ${message.time}`);
          if (task) {
            newProcess.runningJobs = newProcess.runningJobs.filter(t => t !== task);
            task.on = undefined;
            task.type = Task.Type.finished;
            if (message.payload.error) {
              task.reject(parseError(message.payload.error));
            } else {
              task.resolve(message.payload.data);
            }
          }
          if (this.pendingTaskUUIDs.length > 0) {
            this._dispatchTask(this.pendingTaskUUIDs.shift(), `${fromPID}`);
          }
          break;

        case Message.Type.uncaughtException:
          this._cooldownWorker(fromPID);
          this._startWorker();
          break;
        case Message.Type.heartbeat:
          newProcess.heartbeatLoss = 0;
          break;
      }
    };
  }

  private _checkHeartbeat() {
    Object.entries(this.processes).forEach(([workerID, workerInstance]) => {
      if (workerInstance.heartbeatLoss > this.options.maxHeartbeatLoss) {
        this._terminateWorker(Number.parseInt(workerID, 10));
        this._startWorker();
        return;
      }
      workerInstance.heartbeatLoss += 1;
      workerInstance.reference.send({ type: Message.Type.heartbeat, time: Date.now() });
    });
  }

  private _createRegisterTask(detail: Task.External, resolve: () => void, reject: () => void): string {
    const uuid = uuidV4();
    const { code, data, virtualFilePath } = detail;
    this.tasks[uuid] = { type: Task.Type.pending, uuid, code, data, virtualFilePath, resolve, reject };
    return uuid;
  }

  async runTask(detail: Task.External): Promise<any> {
    this.initialize();
    return await new Promise((resolve, reject) => {
      const taskUUID = this._createRegisterTask(detail, resolve, reject);
      const childPID = this._getLightLoadedWorker();
      if (childPID) {
        this._dispatchTask(taskUUID, childPID);
      } else {
        this.pendingTaskUUIDs.push(taskUUID);
      }
    });
  }

}
