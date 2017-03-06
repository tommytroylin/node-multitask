import { ChildProcess } from 'child_process';

type timestamp = number;

export const enum MessageType {
  dispatch,
  receive,
  start,
  finish,
}

export interface Task {
  work: string;
  processor?: string;
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

