import type { BalanceSnapshot } from "./contract"

export interface BalanceEntry {
  readonly currency: string
  readonly total?: number
  readonly granted: number
  readonly toppedUp: number
}

export interface SelectedBalances {
  readonly main: BalanceEntry
  readonly bonus?: BalanceEntry
}

export interface BalanceDisplay {
  readonly primary: string
  readonly bonus?: string
  readonly tooltip: string
}

interface ParsedNumber {
  readonly value?: number
  readonly valid: boolean
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readNumber(value: unknown): ParsedNumber {
  if (value === undefined || value === null) return { valid: true }
  if (typeof value === "number") return Number.isFinite(value) ? { value, valid: true } : { valid: false }
  if (typeof value !== "string") return { valid: false }

  const text = value.trim()

  if (text === "") return { valid: true }

  const number = Number(text)

  return Number.isFinite(number) ? { value: number, valid: true } : { valid: false }
}

/**
 * Parses the `/user/balance` response into one entry per currency.
 *
 * `total_balance` already includes `granted_balance`, so the topped-up amount is
 * read from `topped_up_balance` and only derived when that field is missing.
 */
export function parseBalanceResponse(input: unknown): BalanceEntry[] | undefined {
  if (!isRecord(input)) return undefined

  const infos = input.balance_infos

  if (!Array.isArray(infos)) return undefined

  const entries: BalanceEntry[] = []

  for (const info of infos) {
    if (!isRecord(info)) continue

    const currency = typeof info.currency === "string" ? info.currency.trim().toUpperCase() : ""

    if (currency === "") continue

    const totalRead = readNumber(info.total_balance)
    const grantedRead = readNumber(info.granted_balance)
    const toppedUpRead = readNumber(info.topped_up_balance)

    if (!totalRead.valid || !grantedRead.valid || !toppedUpRead.valid) continue

    const total = totalRead.value === undefined ? undefined : Math.max(0, totalRead.value)
    const granted = Math.max(0, grantedRead.value ?? 0)
    const toppedUp = toppedUpRead.value ?? (total === undefined ? undefined : Math.max(0, total - granted))

    if (toppedUp === undefined) continue

    entries.push({ currency, total, granted, toppedUp: Math.max(0, toppedUp) })
  }

  return entries.length === 0 ? undefined : entries
}

function currencyRank(currency: string): number {
  if (currency === "USD") return 0
  if (currency === "CNY") return 1

  return 2
}

function pickEntry(
  entries: readonly BalanceEntry[],
  predicate: (entry: BalanceEntry) => boolean,
): BalanceEntry | undefined {
  let picked: BalanceEntry | undefined

  for (const entry of entries) {
    if (!predicate(entry)) continue
    if (picked === undefined || currencyRank(entry.currency) < currencyRank(picked.currency)) picked = entry
  }

  return picked
}

export function selectBalances(entries: readonly BalanceEntry[]): SelectedBalances | undefined {
  const main = pickEntry(entries, (entry) => (entry.total ?? 0) > 0) ?? pickEntry(entries, () => true)

  if (main === undefined) return undefined

  return { main, bonus: pickEntry(entries, (entry) => entry.granted > 0) }
}

export function toBalanceSnapshot(entries: readonly BalanceEntry[], fetchedAt: number): BalanceSnapshot | undefined {
  const selected = selectBalances(entries)

  if (selected === undefined) return undefined

  const { main, bonus } = selected

  return {
    status: "ok",
    currency: main.currency,
    toppedUp: main.toppedUp.toFixed(2),
    granted: bonus === undefined ? undefined : bonus.granted.toFixed(2),
    total: main.total === undefined ? undefined : main.total.toFixed(2),
    bonusCurrency: bonus === undefined || bonus === main ? undefined : bonus.currency,
    fetchedAt,
  }
}

export function formatMoney(currency: string, amount: string): string {
  const number = Number(amount)

  if (amount.trim() === "" || !Number.isFinite(number)) return `${currency} ${amount}`

  const fixed = number.toFixed(2)

  if (currency === "USD") return `$${fixed}`
  if (currency === "CNY") return `¥${fixed}`

  return `${currency} ${fixed}`
}

export function formatBalance(snapshot: BalanceSnapshot): BalanceDisplay | undefined {
  if (snapshot.status !== "ok") return undefined
  if (snapshot.currency === undefined || snapshot.toppedUp === undefined) return undefined

  const primary = formatMoney(snapshot.currency, snapshot.toppedUp)
  const granted = snapshot.granted === undefined ? 0 : Number(snapshot.granted)

  if (!Number.isFinite(granted) || granted <= 0) return { primary, tooltip: `Balance: ${primary}` }

  const bonus = `${formatMoney(snapshot.bonusCurrency ?? snapshot.currency, snapshot.granted ?? "0")} bonus`
  const tooltip =
    snapshot.bonusCurrency === undefined && snapshot.total !== undefined
      ? `Balance: ${formatMoney(snapshot.currency, snapshot.total)} (${primary} + ${bonus})`
      : `Balance: ${primary} + ${bonus}`

  return { primary, bonus, tooltip }
}
