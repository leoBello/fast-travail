export type LogLevel = 'info' | 'warn' | 'error';

export function log(level: LogLevel, message: string, data?: unknown): void {
  const line = { level, message, at: new Date().toISOString(), ...(data ? { data } : {}) };
  const text = JSON.stringify(line);
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else console.log(text);
}
