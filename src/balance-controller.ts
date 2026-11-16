import { parseBalanceResponse, toBalanceSnapshot } from "./balance"
import type { BalanceSnapshot } from "./contract"

/** The renderer sees a cached balance for 4 minutes 50 seconds. */
export const BALANCE_CACHE_TTL_MS = 290_000

/** A transient failure keeps the last successful balance for up to 15 minutes. */
export const BALANCE_STALE_TTL_MS = 15 * 60_000

export type BalanceRequestResult =
  | { readonly status: "ok"; readonly payload: unknown }
  | { readonly status: "auth" }
  | { readonly status: "failure" }

export interface BalanceControllerOptions {
  readonly now: () => number
  readonly signal: AbortSignal
  readonly loadKey: () => Promise<string | undefined>
  readonly request: (key: string, signal: AbortSignal) => Promise<BalanceRequestResult>
}

export interface BalanceController {
  get(force?: boolean): Promise<BalanceSnapshot>
}

export function createBalanceController(options: BalanceControllerOptions): BalanceController {
  let cached: BalanceSnapshot | undefined
  let cachedAt = 0
  let inFlight: Promise<BalanceSnapshot> | undefined

  const fallback = (): BalanceSnapshot => {
    const current = cached

    if (current !== undefined && options.now() - cachedAt < BALANCE_STALE_TTL_MS) return current

    return { status: "error" }
  }

  const fetchSnapshot = async (): Promise<BalanceSnapshot> => {
    let key: string | undefined

    try {
      key = await options.loadKey()
    } catch {
      return fallback()
    }

    if (key === undefined) {
      cached = undefined

      return { status: "no-key" }
    }

    let result: BalanceRequestResult

    try {
      result = await options.request(key, options.signal)
    } catch {
      return fallback()
    }

    if (result.status === "auth") {
      cached = undefined

      return { status: "error" }
    }

    if (result.status === "failure") return fallback()

    const entries = parseBalanceResponse(result.payload)

    if (entries === undefined) return fallback()

    const snapshot = toBalanceSnapshot(entries, options.now())

    if (snapshot === undefined) return fallback()

    cached = snapshot
    cachedAt = snapshot.fetchedAt ?? options.now()

    return snapshot
  }

  return {
    get(force = false) {
      if (inFlight !== undefined) return inFlight
      if (!force && cached !== undefined && options.now() - cachedAt < BALANCE_CACHE_TTL_MS) {
        return Promise.resolve(cached)
      }

      const run = fetchSnapshot().finally(() => {
        inFlight = undefined
      })

      inFlight = run

      return run
    },
  }
}
