/** Minimal D1 binding types for Pages Functions (avoid depending on full workers types). */

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>
  run(): Promise<D1Result>
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>
}

export interface D1Result<T = Record<string, unknown>> {
  success: boolean
  meta?: { changes?: number; last_row_id?: number; duration?: number }
  results?: T[]
  error?: string
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>
  exec?(query: string): Promise<unknown>
}

export type EnvWithDb = {
  DB?: D1Database
}
