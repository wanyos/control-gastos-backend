import type { Readable } from 'node:stream'

import {
  AppError,
  DriveConnectionError,
  UnknownBankError,
  ValidationError,
} from '../errors/app-error.js'
import { driveErrorMessage, type AppDriveClient } from './drive.js'

const folderMimeType = 'application/vnd.google-apps.folder'
export const processedFolderName = 'procesados'
const maxBankNameLength = 64
const suggestionThreshold = 2
const yearShape = /^\d{4}$/

export interface BankYearFolders {
  bankFolderId: string
  yearFolderId: string
  processedFolderId: string
}

export interface FileUpload {
  name: string
  mimeType: string
  body: Buffer | Readable | string
}

/** A Drive folder identified by its id and name. */
export interface DriveFolder {
  id: string
  name: string
}

/** A Drive file (non-folder) identified by id, name and mimeType. */
export interface DriveFile {
  id: string
  name: string
  mimeType: string
}

/**
 * Runs a Drive call and turns any library failure into a sanitized
 * DriveConnectionError (R12). An AppError we raised ourselves (UnknownBankError,
 * ValidationError, a DriveConnectionError) is re-thrown as-is so it is never
 * re-wrapped and stays distinguishable (R28).
 */
async function callDrive<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }
    throw new DriveConnectionError(driveErrorMessage(error))
  }
}

/**
 * Normalizes a bank name to a safe slug and validates its shape (R14, R15).
 * NFD + strips diacritics, lowercases, collapses every non `[a-z0-9]` run into a
 * single `-`, trims stray dashes. The result always matches `^[a-z0-9-]{1,64}$`
 * and is never `procesados`, so it is safe both as a folder name and inside the
 * `q` filter (no `/`, `.`, `'` can survive). Never touches Drive.
 */
export function normalizeBankName(input: string): string {
  const slug = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (slug.length === 0) {
    throw new ValidationError('Bank name is empty after normalization')
  }
  if (slug.length > maxBankNameLength) {
    throw new ValidationError(
      `Bank name exceeds ${maxBankNameLength} characters after normalization`,
    )
  }
  if (slug === processedFolderName) {
    throw new ValidationError(`Bank name '${processedFolderName}' is reserved`)
  }
  return slug
}

/**
 * Validates the year: exactly four digits (`^\d{4}$`) in the fixed 2000-2100
 * range (R16, R17). The range is fixed, not relative to the clock, so tests are
 * deterministic. Returns the validated string, used as-is as the folder name.
 * Never touches Drive.
 */
export function validateYear(input: string): string {
  const year = input.trim()
  if (!/^\d{4}$/.test(year)) {
    throw new ValidationError(`Year must be a 4-digit string, got '${input}'`)
  }
  const numeric = Number(year)
  if (numeric < 2000 || numeric > 2100) {
    throw new ValidationError(`Year must be between 2000 and 2100, got '${input}'`)
  }
  return year
}

/** Levenshtein edit distance between two strings. */
function levenshtein(a: string, b: string): number {
  const rows = a.length + 1
  const cols = b.length + 1
  const matrix: number[][] = []
  for (let i = 0; i < rows; i++) {
    matrix[i] = [i]
  }
  for (let j = 1; j < cols; j++) {
    matrix[0][j] = j
  }
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      )
    }
  }
  return matrix[rows - 1][cols - 1]
}

/**
 * Pure suggestion helper (R26). Returns the known bank closest to `slug` when its
 * edit distance is within the threshold (Levenshtein <= 2), breaking ties in
 * alphabetical order; `undefined` when nobody is close enough (no wild guess).
 */
export function suggestBank(slug: string, known: string[]): string | undefined {
  let best: string | undefined
  let bestDistance = Number.POSITIVE_INFINITY
  for (const name of [...known].sort()) {
    const distance = levenshtein(slug, name)
    if (distance < bestDistance) {
      bestDistance = distance
      best = name
    }
  }
  if (best === undefined || bestDistance > suggestionThreshold) {
    return undefined
  }
  return best
}

/**
 * Resolves a folder by name under a known parent without creating it (R6, R8).
 * Returns the id of the oldest match by `createdTime` (deterministic de-dup when
 * Drive holds duplicates) or `null` when none exists.
 */
export async function findFolder(
  client: AppDriveClient,
  name: string,
  parentId: string,
): Promise<string | null> {
  const q =
    `name = '${name}' and mimeType = '${folderMimeType}' ` +
    `and '${parentId}' in parents and trashed = false`
  const res = await callDrive(() =>
    client.files.list({
      q,
      fields: 'files(id, name, createdTime)',
      spaces: 'drive',
      orderBy: 'createdTime',
      pageSize: 10,
    }),
  )
  const files = res.data.files ?? []
  if (files.length === 0) {
    return null
  }
  if (files.length > 1) {
    console.warn(
      `Found ${files.length} folders named '${name}' under parent '${parentId}'; reusing the oldest`,
    )
  }
  return files[0].id ?? null
}

// Intra-process lock keyed by `(parent, name)`: two concurrent ensureFolder calls
// for the same folder share one promise, so each folder is created at most once
// (R7). Single-process only; cross-instance duplicates are made harmless by the
// deterministic de-dup in findFolder (design §3.2, §3.3).
const inFlight = new Map<string, Promise<string>>()

async function resolveOrCreateFolder(
  client: AppDriveClient,
  name: string,
  parentId: string,
): Promise<string> {
  const existing = await findFolder(client, name, parentId)
  if (existing) {
    return existing
  }
  const created = await callDrive(() =>
    client.files.create({
      requestBody: { name, mimeType: folderMimeType, parents: [parentId] },
      fields: 'id',
    }),
  )
  const id = created.data.id
  if (!id) {
    throw new DriveConnectionError('Drive did not return the created folder id')
  }
  return id
}

/**
 * Resolves a folder by name under a parent, creating it only if missing (R4, R6),
 * idempotent and race-safe within the process via the in-memory lock (R7).
 */
export async function ensureFolder(
  client: AppDriveClient,
  name: string,
  parentId: string,
): Promise<string> {
  const key = `${parentId}\n${name}`
  const running = inFlight.get(key)
  if (running) {
    return running
  }
  const pending = resolveOrCreateFolder(client, name, parentId)
  inFlight.set(key, pending)
  try {
    return await pending
  } finally {
    inFlight.delete(key)
  }
}

/** Lists the names of the bank subfolders directly under the root (the registry). */
async function listBankNames(client: AppDriveClient, rootFolderId: string): Promise<string[]> {
  const res = await callDrive(() =>
    client.files.list({
      q: `mimeType = '${folderMimeType}' and '${rootFolderId}' in parents and trashed = false`,
      fields: 'files(name)',
      spaces: 'drive',
      orderBy: 'name',
      pageSize: 1000,
    }),
  )
  const files = res.data.files ?? []
  return files
    .map((file) => file.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
}

function unknownBankMessage(slug: string, known: string[]): string {
  const list = known.length > 0 ? known.join(', ') : '(none registered)'
  const suggestion = suggestBank(slug, known)
  const base = `Unknown bank '${slug}'. Known banks: ${list}.`
  return suggestion ? `${base} Did you mean '${suggestion}'?` : base
}

/**
 * Resolves the bank folder under the root, requiring it to exist (R23). If it is
 * absent it does NOT create anything: it lists the known banks and throws an
 * UnknownBankError whose message lists them and, when close enough, a suggestion
 * (R24, R25, R26). This is the safe default path used by the daily operations.
 */
export async function resolveBankFolder(
  client: AppDriveClient,
  rootFolderId: string,
  bank: string,
): Promise<string> {
  const slug = normalizeBankName(bank)
  const existing = await findFolder(client, slug, rootFolderId)
  if (existing) {
    return existing
  }
  const known = await listBankNames(client, rootFolderId)
  throw new UnknownBankError(unknownBankMessage(slug, known))
}

/**
 * Registers a new bank folder under the root, idempotently (R27). This is the
 * ONLY path that creates a bank folder; the daily operations never do.
 */
export async function createBank(
  client: AppDriveClient,
  rootFolderId: string,
  bank: string,
): Promise<string> {
  const slug = normalizeBankName(bank)
  return ensureFolder(client, slug, rootFolderId)
}

/**
 * Ensures the `<bank>/<year>/procesados` structure and returns the three reusable
 * ids (R5). The bank must already exist (resolved, never created — R3, R23, R24);
 * the year and its `procesados` are auto-created idempotently (R4). On a partial
 * failure it never reports success; a later re-invocation converges without
 * duplicating (R13).
 */
export async function ensureBankYearFolders(
  client: AppDriveClient,
  rootFolderId: string,
  bank: string,
  year: string,
): Promise<BankYearFolders> {
  const validYear = validateYear(year)
  const bankFolderId = await resolveBankFolder(client, rootFolderId, bank)
  const yearFolderId = await ensureFolder(client, validYear, bankFolderId)
  const processedFolderId = await ensureFolder(client, processedFolderName, yearFolderId)
  return { bankFolderId, yearFolderId, processedFolderId }
}

/**
 * Uploads a file as a new, independent file in the given folder (R9). Uses
 * `files.create` with `media`, so every upload yields a fresh file: it never
 * overwrites or appends to an existing one (R10). Returns the new fileId.
 */
export async function uploadFile(
  client: AppDriveClient,
  folderId: string,
  file: FileUpload,
): Promise<string> {
  const created = await callDrive(() =>
    client.files.create({
      requestBody: { name: file.name, parents: [folderId] },
      media: { mimeType: file.mimeType, body: file.body },
      fields: 'id',
    }),
  )
  const id = created.data.id
  if (!id) {
    throw new DriveConnectionError('Drive did not return the uploaded file id')
  }
  return id
}

/**
 * Moves a file into the `procesados` subfolder (R11): `files.update` adding the
 * processed folder as parent and removing the year folder, so it lands in
 * `procesados` and no longer hangs off the year folder.
 */
export async function moveFileToProcessed(
  client: AppDriveClient,
  fileId: string,
  folders: BankYearFolders,
): Promise<void> {
  await callDrive(() =>
    client.files.update({
      fileId,
      addParents: folders.processedFolderId,
      removeParents: folders.yearFolderId,
      fields: 'id, parents',
    }),
  )
}

/**
 * Lists the bank folders directly under the root as `{ id, name }`. This is the
 * dynamic registry of banks: the subfolders of the root ARE the banks, so adding
 * or removing a bank folder in Drive is reflected here without a code change.
 * Read-only (never creates or moves).
 */
export async function listBankFolders(
  client: AppDriveClient,
  rootFolderId: string,
): Promise<DriveFolder[]> {
  const res = await callDrive(() =>
    client.files.list({
      q: `mimeType = '${folderMimeType}' and '${rootFolderId}' in parents and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive',
      orderBy: 'name',
      pageSize: 1000,
    }),
  )
  return toDriveFolders(res.data.files ?? [])
}

/**
 * Lists the year folders under a bank as `{ id, name }`. Only folders whose name
 * is a 4-digit year are returned, so a stray folder under a bank is never crawled
 * as a year. Read-only.
 */
export async function listYearFolders(
  client: AppDriveClient,
  bankFolderId: string,
): Promise<DriveFolder[]> {
  const res = await callDrive(() =>
    client.files.list({
      q: `mimeType = '${folderMimeType}' and '${bankFolderId}' in parents and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive',
      orderBy: 'name',
      pageSize: 1000,
    }),
  )
  return toDriveFolders(res.data.files ?? []).filter((folder) => yearShape.test(folder.name))
}

/**
 * Lists the pending files directly under a `<bank>/<year>/` folder: its non-folder
 * children, so the `procesados` subfolder (a folder) is excluded. These are the
 * files not yet processed. Read-only: it neither downloads nor moves anything.
 */
export async function listPendingFiles(
  client: AppDriveClient,
  yearFolderId: string,
): Promise<DriveFile[]> {
  const res = await callDrive(() =>
    client.files.list({
      q:
        `'${yearFolderId}' in parents and trashed = false ` + `and mimeType != '${folderMimeType}'`,
      fields: 'files(id, name, mimeType)',
      spaces: 'drive',
      orderBy: 'name',
      pageSize: 1000,
    }),
  )
  return (res.data.files ?? [])
    .filter(
      (file): file is { id: string; name: string; mimeType: string } =>
        typeof file.id === 'string' &&
        typeof file.name === 'string' &&
        file.name.length > 0 &&
        typeof file.mimeType === 'string',
    )
    .map((file) => ({ id: file.id, name: file.name, mimeType: file.mimeType }))
}

/**
 * Downloads a file's raw bytes as-is (no parsing) via `files.get` with
 * `alt: 'media'` and the `arraybuffer` response type, returning a Buffer. Any
 * Drive failure is wrapped in a sanitized DriveConnectionError (never leaks the
 * token or a signed URL).
 */
export async function downloadFileContent(client: AppDriveClient, fileId: string): Promise<Buffer> {
  const res = await callDrive(() =>
    client.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' }),
  )
  return Buffer.from(res.data as unknown as ArrayBuffer)
}

function toDriveFolders(files: Array<{ id?: string | null; name?: string | null }>): DriveFolder[] {
  return files
    .filter(
      (file): file is { id: string; name: string } =>
        typeof file.id === 'string' && typeof file.name === 'string' && file.name.length > 0,
    )
    .map((file) => ({ id: file.id, name: file.name }))
}
