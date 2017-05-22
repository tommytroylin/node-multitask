import { ChildProcess, ForkOptions } from 'child_process';

type timestamp = number;
type logger = (...args: any[]) => any;

declare namespace Task {

  export const enum Type {
    pending,
    dispatched,
    started,
    finished,
  }
  export interface External {
    code: string;
    virtualFilePath?: string;
    data?: object;
  }

  export interface Base extends External {
    type: Type;
    uuid: string;
  }

  export interface Registered extends Base {
    resolve: (result?: any) => any;
    reject: (error?: any) => any;
    data?: object;
    on?: Process.Child;
  }

  export interface Result extends Base {
    canceled?: boolean;
    data?: object;
    error?: Message.ErrorObject;
  }

  export interface Registry {
    [prop: string]: Registered;
  }

}

declare namespace Process {

  export interface Child {
    reference: ChildProcess;
    runningJobs: Array<Task.Registered>;
    uncaughtException?: boolean;
    heartbeatLoss: number;
  }

  export interface Registry {
    [prop: string]: Child;
  }

  export interface CooldownRegistry {
    [prop: string]: { errorCount: number, process: Child };
  }

}

export interface Options {
  logger?: null | logger;
  thread?: number;
  maxQueue?: number;
  maxTimeout?: number;
  heartbeatInterval?: number;
  maxHeartbeatLoss?: number;
  forkWorkerOptions?: ForkOptions;
}

declare namespace Message {

  export const enum Type {
    dispatch,
    start,
    finish,
    heartbeat,
    uncaughtException,
  }

  export interface Base {
    type: Type;
    time: timestamp;
  }

  export interface FromMaster extends Base {
    payload?: Task.Base;
  }

  export interface FromWorker extends Base {
    payload?: Task.Result;
  }

  export interface ErrorObject {
    message: string;
  }
}

