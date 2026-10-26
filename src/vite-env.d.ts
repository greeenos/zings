/// <reference types="vite/client" />

// The slice of sql.js the Things import uses (the package ships no types).
declare module "sql.js" {
  interface QueryResult {
    columns: string[];
    values: unknown[][];
  }
  interface Database {
    exec(sql: string): QueryResult[];
    run(sql: string): Database;
    close(): void;
  }
  export default function initSqlJs(config?: {
    locateFile?: (file: string) => string;
  }): Promise<{ Database: new (data?: Uint8Array) => Database }>;
}
