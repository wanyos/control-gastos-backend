import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Test helper (not a test): builds synthetic Trade Republic account files in
 * memory (ADR-017).
 *
 * EVERYTHING HERE IS INVENTED. The real sample of this bank is a `.pdf` that
 * lives in the gitignored `var/drive-read/`, it is never opened by this project
 * and not one of its figures, names or dates is copied into the repository. What
 * these fixtures keep from it is only the SHAPE: a balance of a few thousand, an
 * interest of a few euros, and the five amounts adding up.
 *
 * ⚠️ The guardian of feature 14/23 cannot watch that PDF (it is unreadable
 * binary), so nothing automatic protects a value copied from it: see
 * `unwatchedBanks` in `src/no-real-data.test.ts`. Which is exactly why every
 * number below is built by hand here.
 */

/** A file as the human writes it, wrong values included, hence the loose type. */
export type AccountFile = Record<string, unknown>

/**
 * The canonical valid file: a month whose only movement is the interest payment,
 * so `moneyIn` and `moneyOut` are `0` and the five amounts add up exactly.
 */
export function buildSavingsAccount(overrides: AccountFile = {}): AccountFile {
  return {
    type: 'savings_account',
    name: 'Cuenta Sintetica Remunerada',
    date: '2026-08-31',
    openedAt: '2025-03-10',
    openingBalance: 4000,
    moneyIn: 0,
    moneyOut: 0,
    interest: 6.4,
    balance: 4006.4,
    closedAt: null,
    ...overrides,
  }
}

/**
 * A month with movements: money in and out on top of the interest. `moneyIn`
 * does NOT include the interest (that is the one subtraction the human makes
 * when copying the statement summary), so the equation is
 * `4000 + 500 - 120 + 6.4 = 4386.4`.
 */
export function buildSavingsAccountWithMovements(overrides: AccountFile = {}): AccountFile {
  return buildSavingsAccount({
    moneyIn: 500,
    moneyOut: 120,
    balance: 4386.4,
    ...overrides,
  })
}

/**
 * Amounts that do NOT add up in raw floating point but DO in cents:
 * `1000.1 + 0.2 = 1000.3000000000001` as a `number`. This is the file that
 * proves the check is done in whole cents and not with `===` (design §2.1a).
 */
export function buildSavingsAccountFloatingPoint(overrides: AccountFile = {}): AccountFile {
  return buildSavingsAccount({
    openingBalance: 1000.1,
    moneyIn: 0.2,
    moneyOut: 0,
    interest: 0,
    balance: 1000.3,
    ...overrides,
  })
}

/** Off by exactly one cent: the bank's own rounding, which must be ACCEPTED. */
export function buildSavingsAccountOffByOneCent(overrides: AccountFile = {}): AccountFile {
  return buildSavingsAccount({ balance: 4006.41, ...overrides })
}

/** Off by euros: a mistyped digit, which must be REJECTED. */
export function buildSavingsAccountOffByEuros(overrides: AccountFile = {}): AccountFile {
  return buildSavingsAccount({ balance: 4106.4, ...overrides })
}

/**
 * The template EXACTLY as `docs/trade-republic-product-files.md` publishes it.
 *
 * Two things about it, both deliberate:
 *  - **every value is a `<…>` marker**, so a field left unfilled cannot look
 *    like a real one (R1, and the accident of 2026-08-15);
 *  - **the markers of the amounts are QUOTED**, so the template as a whole is
 *    valid JSON and the parser can name EVERY unsubstituted field instead of
 *    dying at the first syntax error (R2). The marker itself says to drop the
 *    quotes when filling it in, because a number goes without them.
 */
export const tradeRepublicTemplate = `{
  "type": "<savings_account, el único valor admitido>",
  "name": "<cómo llamas tú a esta cuenta; el mismo texto todos los meses>",
  "date": "<AAAA-MM-DD: el día del abono de intereses de este mes>",
  "openedAt": "<AAAA-MM-DD: el día que abriste la cuenta; el mismo todos los meses>",
  "openingBalance": "<saldo inicial del mes; número SIN comillas, quítalas al rellenar>",
  "moneyIn": "<lo que entró en el mes SIN los intereses; número SIN comillas, 0 si no entró nada>",
  "moneyOut": "<lo que salió en el mes; número SIN comillas, 0 si no salió nada>",
  "interest": "<los intereses abonados ese día; número SIN comillas>",
  "balance": "<el saldo final, justo después del abono; número SIN comillas>",
  "closedAt": "<null mientras la cuenta siga viva; AAAA-MM-DD el mes que la cierres>"
}
`

/** The nine mandatory keys, in the order the template writes them. */
export const mandatoryKeys = [
  'type',
  'name',
  'date',
  'openedAt',
  'openingBalance',
  'moneyIn',
  'moneyOut',
  'interest',
  'balance',
]

/** Serializes an account file the way the human would write it. */
export function buildAccountJson(account: AccountFile): string {
  return `${JSON.stringify(account, null, 2)}\n`
}

/** Writes a local copy where the drive-read feature would leave it. */
export async function writeLocalCopy(
  sourceBaseDir: string,
  year: string,
  file: string,
  content: Buffer | string,
): Promise<string> {
  const dir = join(sourceBaseDir, 'trade-republic', year)
  await mkdir(dir, { recursive: true })
  const path = join(dir, file)
  await writeFile(path, content)
  return path
}
