// The upload against the REAL Drive client of `createDriveClient`, with invented
// credentials and no network: the request the client has built is taken at the
// last step before it would leave the machine (the `request` of its OAuth
// client), read, and answered with the failure Google gives to credentials it
// does not know.
import { describe, expect, it } from 'vitest'

import { BackupError } from '../../errors/app-error.js'
import { createDriveClient, type AppDriveClient } from '../../lib/drive.js'
import { uploadBackup } from './backup.drive.js'
import { backupDriveFixture } from './backup.fixture.js'

const content = Buffer.from('PGDMP bytes inventados de una copia, con un final reconocible: 7f3a')

interface BuiltRequest {
  url: string
  contentType: string
  body: Buffer
}

function offlineDriveClient(): { client: AppDriveClient; requests: BuiltRequest[] } {
  const client = createDriveClient({
    clientId: 'invented-client-id.apps.googleusercontent.com',
    clientSecret: 'invented-client-secret',
    refreshToken: 'invented-refresh-token',
  })
  const requests: BuiltRequest[] = []
  const authClient = (
    client as unknown as {
      context: { _options: { auth: { request: (options: unknown) => Promise<unknown> } } }
    }
  ).context._options.auth
  authClient.request = async (options) => {
    const { url, headers, data } = options as {
      url: string
      headers: Headers
      data: AsyncIterable<Buffer | string>
    }
    const chunks: Buffer[] = []
    for await (const chunk of data) chunks.push(Buffer.from(chunk))
    requests.push({
      url: String(url),
      contentType: new Headers(headers).get('content-type') ?? '',
      body: Buffer.concat(chunks),
    })
    throw new Error('invalid_client')
  }
  return { client, requests }
}

describe('uploadBackup', () => {
  it('hands the copy to the real Drive client as a stream it can send', async () => {
    const { client, requests } = offlineDriveClient()

    const error = await uploadBackup(
      client,
      'invented-folder-id',
      'control-gastos-2026-03-14-090507.dump',
      content,
    ).then(
      () => undefined,
      (caught: unknown) => caught,
    )

    // It got as far as the credentials: the request was built whole.
    expect(error).toBeInstanceOf(BackupError)
    expect((error as BackupError).message).toContain('Drive OAuth credentials are not valid')
    expect((error as BackupError).message).not.toContain('Cannot reach Google Drive')
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toContain('/upload/drive/v3/files')
    expect(requests[0].contentType).toMatch(/^multipart\/related; boundary=/)
    const boundary = requests[0].contentType.replace(/^.*boundary=/, '')
    // Every byte of the copy is in the body, once, and the body is closed.
    const start = requests[0].body.indexOf(content)
    expect(start).toBeGreaterThan(0)
    expect(requests[0].body.indexOf(content, start + 1)).toBe(-1)
    expect(requests[0].body.subarray(start + content.length).toString('latin1')).toBe(
      `\r\n--${boundary}--`,
    )
    expect(requests[0].body.toString('latin1')).toContain('"parents":["invented-folder-id"]')
  })

  it('would fail before any request if the copy were handed over as a Buffer', async () => {
    // What the real client does with a Buffer, and why the simulated one of
    // `backup.fixture.ts` does the same.
    const { client, requests } = offlineDriveClient()
    const upload = (drive: AppDriveClient) =>
      drive.files.create({
        requestBody: { name: 'control-gastos-2026-03-14-090507.dump', parents: ['invented'] },
        media: { mimeType: 'application/octet-stream', body: content },
        fields: 'id',
      })

    await expect(upload(client)).rejects.toThrow(TypeError)
    await expect(upload(client)).rejects.toThrow('part.body.pipe is not a function')
    expect(requests).toEqual([])

    const simulated = backupDriveFixture()
    await expect(upload(simulated.client)).rejects.toThrow(TypeError)
    await expect(upload(simulated.client)).rejects.toThrow('part.body.pipe is not a function')
    expect(simulated.files).toEqual([])
  })

  it('stores in the simulated Drive the bytes it read from the stream', async () => {
    const drive = backupDriveFixture()

    const file = await uploadBackup(drive.client, drive.folderId, 'copia-de-prueba.dump', content)

    expect(file.sizeBytes).toBe(content.length)
    expect(drive.files).toHaveLength(1)
    expect(drive.files[0].content.equals(content)).toBe(true)
  })
})
