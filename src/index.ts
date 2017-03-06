import { fork } from 'child_process';
import { cpus } from 'os';
import { join } from 'path';
import { v4 as uuidV4 } from 'uuid';

import { Task, TaskWithUUID, Options, ProcessManagement, MessageFromMaster, MessageFromWorker, MessageType, RegisteredTask } from  '../types/index';

const numberOfCPUs = cpus().length;

export class MultiTask {

  private static _dispatchNewTaskTo(newProcess: ProcessManagement, task?: TaskWithUUID) {
    if (!task) {
      return;
    }
    const dispatch: MessageFromMaster = { type: MessageType.dispatch, time: Date.now(), payload: task };
    newProcess.reference.send(dispatch);
  }

  private initialized = false;
  options: Options;
  childProcesses: ProcessManagement[] = [];
  pendingTasks: TaskWithUUID[] = [];
  registeredTasks = {};

  constructor(options: Options) {
    this.options = options || {};
  }

  private _getAnIdleProcess(): ProcessManagement {
    return this.childProcesses.filter(c => !c.isBusy)[0];
  }

  private _generateMessageHandler(newProcess: ProcessManagement) {
    return (message: MessageFromWorker) => {
      switch (message.type) {
        case MessageType.receive:
          console.log(`Process ${newProcess.reference.pid} received Task ${message.payload.uuid} at ${message.time}`);
          break;
        case MessageType.start:
          console.log(`Process ${newProcess.reference.pid} started running Task ${message.payload.uuid} at ${message.time}`);
          newProcess.isBusy = true;
          break;
        case MessageType.finish:
          console.log(`Process ${newProcess.reference.pid} finished running Task ${message.payload.uuid} at ${message.time}`);
          const registeredTask = this.getRegisteredTask(message.payload.uuid);
          newProcess.isBusy = false;
          MultiTask._dispatchNewTaskTo(newProcess, this.pendingTasks.shift());
          if (message.payload.error) {
            registeredTask.reject(message.payload.error);
          } else {
            registeredTask.resolve(message.payload.result);
          }
          break;
      }
    }
  }

  private registerTask(task: RegisteredTask) {
    this.registeredTasks[task.uuid] = task;
  }

  private getRegisteredTask(uuid: string): RegisteredTask {
    return this.registeredTasks[uuid];
  }

  private async initialize() {
    if (this.initialized) {
      return;
    }
    console.log(`Initializing Master ${process.pid}`);
    const { thread = numberOfCPUs - 1 } = this.options;
    for (let i = 0; i < thread; i += 1) {
      const newProcess: ProcessManagement = { reference: fork(`${__dirname}/worker`), isBusy: false };
      console.log(`Initializing Worker ${newProcess.reference.pid}`);
      newProcess.reference.on('message', this._generateMessageHandler(newProcess));
      this.childProcesses.push(newProcess);
    }
    this.initialized = true;
  }

  async runTask(task: Task): Promise<any> {
    await this.initialize();
    let { work, processor, __dirname }  = task;
    const uuid = uuidV4();
    if (__dirname) {
      work = join(__dirname, work);
      processor = processor ? join(__dirname, processor) : processor;
    }
    return await new Promise((resolve, reject) => {
      const newTask: RegisteredTask = {
        uuid,
        work,
        processor,
        resolve,
        reject,
      };
      this.registerTask(newTask);
      const idleProcess = this._getAnIdleProcess();
      if (idleProcess) {
        idleProcess.isBusy = true;
        MultiTask._dispatchNewTaskTo(idleProcess, newTask);
      } else {
        this.pendingTasks.push(newTask);
      }
    });
  }

}
