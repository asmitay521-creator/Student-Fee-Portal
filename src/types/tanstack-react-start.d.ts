declare module "@tanstack/react-start" {
  export function createStart(fn: any): any;
  export function createCsrfMiddleware(opts?: any): any;
  export function createMiddleware(): {
    server: (fn: (args: { next: () => Promise<any> }) => Promise<any>) => any;
  };
}

declare module "@tanstack/react-start/server-entry" {
  const defaultExport: any;
  export default defaultExport;
}
