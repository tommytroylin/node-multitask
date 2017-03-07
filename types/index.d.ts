import { ChildProcess } from 'child_process';

type timestamp = number;
type logger = (...args) => any;

export const enum MessageType {
  dispatch,
  receive,
  start,
  finish,
}

export interface Task {
  work: string;
  data?: any;
  __dirname?: string;
}

export interface TaskWithUUID extends Task {
  uuid: string;
}

export interface RegisteredTask extends TaskWithUUID {
  resolve: (result?) => any;
  reject: (error?) => any;
}

export interface Result extends TaskWithUUID {
  result?: any;
  error?: Error;
}

export interface Options {
  logger?: false| null | logger;
  thread?: number;
}

export interface Message {
  type: MessageType;
  time: timestamp;
}

export interface MessageFromMaster extends Message {
  payload: TaskWithUUID;
}

export interface MessageFromWorker extends Message {
  payload: Result;
}

export interface ProcessManagement {
  reference: ChildProcess;
  isBusy: boolean;
}
