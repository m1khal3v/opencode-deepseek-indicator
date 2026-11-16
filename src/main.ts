import { env } from "node:process"
import type { Plugin } from "@opencode/plugin/gui"
import { createBalanceController, type BalanceRequestResult } from "./balance-controller"
import { selectDeepSeekKey } from "./credential"
import { BalanceIpc } from "./contract"

const BALANCE_URL = "https://api.deepseek.com/user/balance"
const REQUEST_TIMEOUT_MS = 10_000
const REFRESH_INTERVAL_MS = 300_000

async function requestBalance(key: string, signal: AbortSignal): Promise<BalanceRequestResult> {
  try {
    const response = await fetch(BALANCE_URL, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
      },
      signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
    })

    if (response.status === 401 || response.status === 403) return { status: "auth" }
    if (!response.ok) return { status: "failure" }

    try {
      return { status: "ok", payload: await response.json() }
    } catch {
      return { status: "failure" }
    }
  } catch {
    return { status: "failure" }
  }
}

export const main: Plugin.MainSetup = (ctx) => {
  const loadKey = async (): Promise<string | undefined> => {
    let entries: Awaited<ReturnType<typeof ctx.client.credential.list>>

    try {
      entries = await ctx.client.credential.list()
    } catch (error) {
      const fallback = selectDeepSeekKey([], env.DEEPSEEK_API_KEY)

      if (fallback !== undefined) return fallback

      throw error
    }

    return selectDeepSeekKey(entries, env.DEEPSEEK_API_KEY)
  }

  const controller = createBalanceController({
    now: Date.now,
    signal: ctx.signal,
    loadKey,
    request: requestBalance,
  })

  const provider = ctx.provide(BalanceIpc, {
    getBalance: (input) => controller.get(input.force === true),
  })

  const refresh = () => {
    void controller
      .get()
      .then((snapshot) => {
        if (!ctx.signal.aborted) provider.emit("changed", snapshot)
      })
      .catch(() => undefined)
  }

  const timer = setInterval(refresh, REFRESH_INTERVAL_MS)

  ctx.onCleanup(() => clearInterval(timer))
}
