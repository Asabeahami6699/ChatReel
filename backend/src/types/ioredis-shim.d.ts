declare module 'ioredis' {
  const Redis: new (url: string) => {
    lpush: (key: string, value: string) => Promise<unknown>;
    brpop: (key: string, timeout: number) => Promise<[string, string] | null>;
    quit: () => Promise<unknown>;
    on: (ev: string, fn: (...args: unknown[]) => void) => void;
  };
  export default Redis;
}
