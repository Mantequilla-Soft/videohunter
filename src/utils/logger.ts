type LogLevel = 'info' | 'warn' | 'error' | 'debug';

class Logger {
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private format(level: LogLevel, message: string, ...args: any[]): string {
    const timestamp = this.getTimestamp();
    const formattedArgs = args.length > 0 ? ' ' + JSON.stringify(args, null, 2) : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${formattedArgs}`;
  }

  info(message: string, ...args: any[]): void {
    console.log(this.format('info', message, ...args));
  }

  warn(message: string, ...args: any[]): void {
    console.warn(this.format('warn', message, ...args));
  }

  error(message: string, ...args: any[]): void {
    console.error(this.format('error', message, ...args));
  }

  debug(message: string, ...args: any[]): void {
    console.debug(this.format('debug', message, ...args));
  }
}

export const logger = new Logger();
