const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const

export type LogLevel = (typeof logLevels)[number]

export interface AppConfig {
  databaseUrl: string
  port: number
  host: string
  logLevel: LogLevel
}

const defaults = {
  port: 3000,
  host: '0.0.0.0',
  logLevel: 'info',
} as const

function isLogLevel(value: string): value is LogLevel {
  return (logLevels as readonly string[]).includes(value)
}

/**
 * Validates and types the environment. Throws on any problem (fail-fast).
 * All problems are collected into a single error message so a broken
 * startup can be fixed in one pass.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const problems: string[] = []

  const databaseUrl = env.DATABASE_URL
  if (!databaseUrl) {
    problems.push('DATABASE_URL is required (PostgreSQL connection string)')
  }

  let port: number = defaults.port
  if (env.PORT !== undefined) {
    const parsed = Number(env.PORT)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      problems.push(`PORT must be an integer between 1 and 65535, got '${env.PORT}'`)
    } else {
      port = parsed
    }
  }

  let host: string = defaults.host
  if (env.HOST !== undefined && env.HOST !== '') {
    host = env.HOST
  }

  let logLevel: LogLevel = defaults.logLevel
  if (env.LOG_LEVEL !== undefined) {
    if (!isLogLevel(env.LOG_LEVEL)) {
      problems.push(`LOG_LEVEL must be one of ${logLevels.join(', ')}, got '${env.LOG_LEVEL}'`)
    } else {
      logLevel = env.LOG_LEVEL
    }
  }

  // `!databaseUrl` is redundant at runtime (already a problem) but narrows the type.
  if (problems.length > 0 || !databaseUrl) {
    throw new Error(
      `Invalid environment configuration:\n${problems.map((p) => `- ${p}`).join('\n')}`,
    )
  }

  return { databaseUrl, port, host, logLevel }
}

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig
  }
}
