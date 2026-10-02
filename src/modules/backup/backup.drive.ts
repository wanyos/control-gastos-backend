// What the two backup commands ask of Drive (feature 55): look the folder up,
// add a file to it, list its files. Nothing here updates, deletes, copies or
// moves a file: a copy that is in the folder stays as it is.
import { Readable } from 'node:stream'

import { BackupError } from '../../errors/app-error.js'
import { driveErrorMessage, type AppDriveClient } from '../../lib/drive.js'
import type { BackupFile, BackupFolder } from './backup.types.js'

const folderMimeType = 'application/vnd.google-apps.folder'
const variableName = 'GOOGLE_DRIVE_BACKUP_FOLDER_ID'
const whatTheVariableTakes =
  `${variableName} tiene que llevar el identificador de la carpeta o su dirección completa ` +
  '(https://drive.google.com/drive/folders/<identificador>), no su nombre.'

function statusOf(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' ? status : undefined
}

/** The folder the copies go to, or a `BackupError` saying why it cannot be used. */
export async function resolveBackupFolder(
  client: AppDriveClient,
  folderId: string | undefined,
): Promise<BackupFolder> {
  if (folderId === undefined) {
    throw new BackupError(
      `No se puede localizar la carpeta de copias: falta la variable ${variableName} en el archivo .env. ` +
        whatTheVariableTakes,
    )
  }

  let data: {
    id?: string | null
    name?: string | null
    mimeType?: string | null
    trashed?: boolean | null
  }
  try {
    const response = await client.files.get({
      fileId: folderId,
      fields: 'id, name, mimeType, trashed',
    })
    data = response.data
  } catch (error) {
    if (statusOf(error) === 404) {
      throw new BackupError(
        `No se puede localizar la carpeta de copias: lo que hay en ${variableName} no existe en Drive ` +
          `o esta cuenta no lo ve. ${whatTheVariableTakes}`,
      )
    }
    // Constant text only: a library error can carry the token or a signed URL.
    throw new BackupError(
      `No se puede localizar la carpeta de copias: ${driveErrorMessage(error)}. ${whatTheVariableTakes}`,
    )
  }

  if (data.mimeType !== folderMimeType) {
    throw new BackupError(
      `No se puede usar la carpeta de copias: lo que hay en ${variableName} no es una carpeta de Drive. ` +
        whatTheVariableTakes,
    )
  }
  if (data.trashed === true) {
    throw new BackupError(
      `No se puede usar la carpeta de copias: la carpeta de ${variableName} está en la papelera de Drive.`,
    )
  }
  return { id: data.id ?? folderId, name: data.name ?? '' }
}

/** Adds one file to the folder and checks Drive stored every byte sent. */
export async function uploadBackup(
  client: AppDriveClient,
  folderId: string,
  name: string,
  content: Buffer,
): Promise<BackupFile> {
  let data: {
    id?: string | null
    name?: string | null
    size?: string | null
    createdTime?: string | null
  }
  try {
    const response = await client.files.create({
      requestBody: { name, parents: [folderId] },
      // A stream, never the Buffer itself: the client PIPES every body that is
      // not a string, and a Buffer has no `pipe`.
      media: {
        mimeType: 'application/octet-stream',
        body: Readable.from(content, { objectMode: false }),
      },
      fields: 'id, name, size, createdTime',
    })
    data = response.data
  } catch (error) {
    throw new BackupError(
      `No se ha podido subir la copia a Drive: ${driveErrorMessage(error)}. No se ha guardado ninguna copia.`,
    )
  }

  const storedBytes = Number(data.size)
  if (storedBytes !== content.length) {
    throw new BackupError(
      `La copia subida no es fiable: se enviaron ${content.length} bytes y Drive dice haber guardado ` +
        `${Number.isFinite(storedBytes) ? storedBytes : 'un tamaño desconocido'}. ` +
        `Revisa el archivo «${name}» en la carpeta de copias y vuelve a lanzar el comando.`,
    )
  }
  return {
    id: data.id ?? '',
    name: data.name ?? name,
    sizeBytes: storedBytes,
    createdTime: data.createdTime ?? '',
  }
}

/** The files of the folder, newest first. */
export async function listBackupFiles(
  client: AppDriveClient,
  folderId: string,
): Promise<BackupFile[]> {
  let files: Array<{
    id?: string | null
    name?: string | null
    size?: string | null
    createdTime?: string | null
  }>
  try {
    const response = await client.files.list({
      q: `'${folderId}' in parents and trashed = false and mimeType != '${folderMimeType}'`,
      fields: 'files(id, name, size, createdTime)',
      orderBy: 'createdTime desc',
      pageSize: 1000,
    })
    files = response.data.files ?? []
  } catch (error) {
    throw new BackupError(
      `No se han podido listar las copias de la carpeta de Drive: ${driveErrorMessage(error)}.`,
    )
  }
  return files
    .filter(
      (
        file,
      ): file is { id: string; name: string; size?: string | null; createdTime?: string | null } =>
        typeof file.id === 'string' && typeof file.name === 'string',
    )
    .map((file) => ({
      id: file.id,
      name: file.name,
      sizeBytes: Number(file.size ?? 0),
      createdTime: file.createdTime ?? '',
    }))
    .sort((a, b) => b.createdTime.localeCompare(a.createdTime))
}
