import { describe, expect, it, vi } from 'vitest'

import {
  checkDriveConnection,
  createDriveAuth,
  createDriveClient,
  driveScope,
  type AppDriveClient,
} from './drive.js'
import { DriveConnectionError } from '../errors/app-error.js'

const credentials = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  refreshToken: 'refresh-token-value',
}

function driveClientResolving(data: unknown): AppDriveClient {
  return { about: { get: vi.fn().mockResolvedValue({ data }) } } as unknown as AppDriveClient
}

function driveClientRejecting(error: unknown): AppDriveClient {
  return { about: { get: vi.fn().mockRejectedValue(error) } } as unknown as AppDriveClient
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected the promise to reject')
}

describe('drive lib', () => {
  it('createDriveAuth sets the refresh token on the OAuth2 client (R4)', () => {
    const client = createDriveAuth(credentials)

    expect(client.credentials.refresh_token).toBe('refresh-token-value')
  })

  it('createDriveClient builds a client with an invocable about.get, no network (R5)', () => {
    const client = createDriveClient(credentials)

    expect(typeof client.about.get).toBe('function')
  })

  it('exposes the exact full-drive scope as a constant (R6)', () => {
    expect(driveScope).toBe('https://www.googleapis.com/auth/drive')
  })

  it('returns the connected account email on success (R11)', async () => {
    const client = driveClientResolving({ user: { emailAddress: 'owner@example.com' } })

    await expect(checkDriveConnection(client)).resolves.toBe('owner@example.com')
  })

  it('rejects with DriveConnectionError when the response carries no account', async () => {
    const client = driveClientResolving({})

    const error = await captureError(checkDriveConnection(client))

    expect(error).toBeInstanceOf(DriveConnectionError)
  })

  it('never leaks the raw error text (e.g. a token) into the message (R12)', async () => {
    const client = driveClientRejecting(new Error('refresh failed for token 1//fake-token-value'))

    const error = await captureError(checkDriveConnection(client))

    expect(error).toBeInstanceOf(DriveConnectionError)
    expect((error as DriveConnectionError).message).not.toContain('1//fake-token-value')
    expect((error as DriveConnectionError).message).toBe('Cannot reach Google Drive')
  })

  it('maps invalid_grant to the re-authorize message (R19)', async () => {
    const client = driveClientRejecting(new Error('invalid_grant: token expired or revoked'))

    const error = await captureError(checkDriveConnection(client))

    expect((error as DriveConnectionError).message).toBe(
      'Drive refresh token is no longer valid; re-authorize the app',
    )
  })

  it('maps invalid_client to the invalid-credentials message (R19)', async () => {
    const client = driveClientRejecting(new Error('invalid_client: unauthorized'))

    const error = await captureError(checkDriveConnection(client))

    expect((error as DriveConnectionError).message).toBe('Drive OAuth credentials are not valid')
  })

  it('maps accessNotConfigured (nested reason) to the API-not-enabled message (R19)', async () => {
    const raw = Object.assign(new Error('The Drive API has not been used in project ...'), {
      response: { data: { error: { errors: [{ reason: 'accessNotConfigured' }] } } },
    })
    const client = driveClientRejecting(raw)

    const error = await captureError(checkDriveConnection(client))

    expect((error as DriveConnectionError).message).toBe(
      'Drive API is not enabled in the Google Cloud project',
    )
  })

  it('maps insufficientPermissions (nested reason) to the missing-scope message (R19)', async () => {
    const raw = Object.assign(new Error('Insufficient Permission'), {
      response: { data: { error: { errors: [{ reason: 'insufficientPermissions' }] } } },
    })
    const client = driveClientRejecting(raw)

    const error = await captureError(checkDriveConnection(client))

    expect((error as DriveConnectionError).message).toBe('The Drive token lacks the required scope')
  })

  it('maps an unknown failure to the generic message (R19)', async () => {
    const client = driveClientRejecting(new Error('ECONNRESET'))

    const error = await captureError(checkDriveConnection(client))

    expect((error as DriveConnectionError).message).toBe('Cannot reach Google Drive')
  })
})
