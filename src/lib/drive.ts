import { auth, drive } from '@googleapis/drive'

import { DriveConnectionError } from '../errors/app-error.js'
import type { DriveCredentials } from '../config/env.js'

/**
 * Drive OAuth scope. Kept as a code constant, not an env var: changing it forces
 * re-doing the manual consent flow, so it is not something to tune per environment.
 */
export const driveScope = 'https://www.googleapis.com/auth/drive'

/**
 * Builds the OAuth2 client with the refresh token set. With a refresh token
 * present the library obtains and renews access tokens on its own on every call,
 * with no human intervention. Kept separate from the Drive client so it is
 * testable without network access.
 */
export function createDriveAuth(credentials: DriveCredentials) {
  const client = new auth.OAuth2({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
  })
  client.setCredentials({ refresh_token: credentials.refreshToken })
  return client
}

/**
 * Builds the Drive v3 client. Pure factory: receives credentials by parameter
 * and performs no network I/O (the OAuth handshake happens lazily on first call).
 */
export function createDriveClient(credentials: DriveCredentials) {
  return drive({ version: 'v3', auth: createDriveAuth(credentials) })
}

/** Type of the instance returned by `createDriveClient`. */
export type AppDriveClient = ReturnType<typeof createDriveClient>

const driveErrorMessages = {
  invalidGrant: 'Drive refresh token is no longer valid; re-authorize the app',
  invalidClient: 'Drive OAuth credentials are not valid',
  accessNotConfigured: 'Drive API is not enabled in the Google Cloud project',
  insufficientPermissions: 'The Drive token lacks the required scope',
  generic: 'Cannot reach Google Drive',
} as const

/**
 * Maps a raw Drive/OAuth failure to a fixed, actionable message. It inspects the
 * raw error to detect a known symptom, but NEVER interpolates the raw error text
 * into its output: a library error can carry the refresh token or a signed URL,
 * and this message ends up in the logs. Every branch returns a constant.
 */
export function driveErrorMessage(error: unknown): string {
  const signals = errorSignals(error)
  if (signals.includes('invalid_grant')) {
    return driveErrorMessages.invalidGrant
  }
  if (signals.includes('invalid_client')) {
    return driveErrorMessages.invalidClient
  }
  if (signals.includes('accessNotConfigured')) {
    return driveErrorMessages.accessNotConfigured
  }
  if (signals.includes('insufficientPermissions')) {
    return driveErrorMessages.insufficientPermissions
  }
  return driveErrorMessages.generic
}

/**
 * Collects a searchable string from a raw error (message plus nested response
 * body / errors, where Google puts reason codes) for symptom detection only.
 * This text is never returned to callers.
 */
function errorSignals(error: unknown): string {
  if (typeof error === 'string') {
    return error
  }
  if (!error || typeof error !== 'object') {
    return ''
  }
  const record = error as Record<string, unknown>
  const parts: string[] = []
  if (typeof record.message === 'string') {
    parts.push(record.message)
  }
  const response = record.response
  if (response && typeof response === 'object') {
    parts.push(safeStringify((response as Record<string, unknown>).data))
  }
  parts.push(safeStringify(record.errors))
  return parts.join(' ')
}

function safeStringify(value: unknown): string {
  if (value === undefined) {
    return ''
  }
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return ''
  }
}

/**
 * Verifies connectivity against Drive and returns the connected account email.
 * Wraps every library failure in a sanitized DriveConnectionError (R12, R19);
 * a DriveConnectionError it raised itself is re-thrown as-is (no double wrap).
 */
export async function checkDriveConnection(client: AppDriveClient): Promise<string> {
  try {
    const response = await client.about.get({ fields: 'user' })
    const email = response.data.user?.emailAddress
    if (!email) {
      throw new DriveConnectionError('Drive did not return the connected account')
    }
    return email
  } catch (error) {
    if (error instanceof DriveConnectionError) {
      throw error
    }
    throw new DriveConnectionError(driveErrorMessage(error))
  }
}
