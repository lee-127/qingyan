export type BridgeMessage = { id: number; method: string; params: any };
export type BridgeReply = { id: number; value?: any; error?: string };
export interface BridgeTarget {
  __qyDrain?: () => string;
  __qyReply?: (message: BridgeReply) => string;
  __qyTransportFailed?: (message: string) => string;
}
export type NativeCall = (method: string, params?: any) => Promise<any>;
export function createWebKitTransport(target: BridgeTarget, post: (message: BridgeMessage) => void): NativeCall {
  let sequence = 0;
  const pending = new Map<number, { resolve: (x: any) => void; reject: (e: Error) => void }>();
  target.__qyReply = message => {
    const entry = pending.get(message.id);
    if (entry) {
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error)); else entry.resolve(message.value);
    }
    return "ok";
  };
  target.__qyTransportFailed = message => {
    for (const entry of pending.values()) entry.reject(new Error(message));
    pending.clear();
    return "ok";
  };
  return (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    try { post({ id, method, params }); }
    catch (error) { pending.delete(id); reject(error); }
  });
}

// Scriptable's evaluateJavaScript always receives a plain string. It never has to
// retain a completion callback or serialize an undefined result across runtimes.
export function createTransport(target: BridgeTarget): NativeCall {
  let sequence = 0, failed = "";
  const queue: BridgeMessage[] = [];
  const pending = new Map<number, { resolve: (x: any) => void; reject: (e: Error) => void }>();
  target.__qyDrain = () => JSON.stringify(queue.splice(0));
  target.__qyReply = message => {
    const entry = pending.get(message.id);
    if (entry) {
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error)); else entry.resolve(message.value);
    }
    return "ok";
  };
  target.__qyTransportFailed = message => {
    failed = message;
    queue.length = 0;
    for (const entry of pending.values()) entry.reject(new Error(message));
    pending.clear();
    return "ok";
  };
  return (method, params = {}) => new Promise((resolve, reject) => {
    if (failed) { reject(new Error(failed)); return; }
    const message = { id: ++sequence, method, params };
    pending.set(message.id, { resolve, reject });
    queue.push(message);
  });
}
