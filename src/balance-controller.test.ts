import { describe, expect, it, vi } from "vitest"
import {
  BALANCE_CACHE_TTL_MS,
  BALANCE_STALE_TTL_MS,
  createBalanceController,
  type BalanceRequestResult,
} from "./balance-controller"

function payload(total = "10.37", granted = "5.55", toppedUp = "4.82") {
  return {
    is_available: true,
    balance_infos: [{ currency: "USD", total_balance: total, granted_balance: granted, topped_up_balance: toppedUp }],
  }
}

function harness() {
  let now = 1_700_000_000_000
  const loadKey = vi.fn<() => Promise<string | undefined>>(async () => "sk-deepseek")
  const request = vi.fn<() => Promise<BalanceRequestResult>>(async () => ({ status: "ok", payload: payload() }))
  const controller = createBalanceController({
    now: () => now,
    signal: new AbortController().signal,
    loadKey,
    request,
  })

  return {
    controller,
    loadKey,
    request,
    advance(ms: number) {
      now += ms
    },
  }
}

describe("balance controller", () => {
  it("serves a cached balance for 4 minutes 50 seconds", async () => {
    const test = harness()

    await test.controller.get()
    await test.controller.get()

    expect(test.request).toHaveBeenCalledTimes(1)

    test.advance(BALANCE_CACHE_TTL_MS - 1)
    await test.controller.get()
    expect(test.request).toHaveBeenCalledTimes(1)

    test.advance(1)
    await test.controller.get()
    expect(test.request).toHaveBeenCalledTimes(2)
  })

  it("bypasses the cache when force is true", async () => {
    const test = harness()

    await test.controller.get()
    await test.controller.get(true)

    expect(test.request).toHaveBeenCalledTimes(2)
  })

  it("deduplicates parallel requests", async () => {
    const test = harness()
    let resolveRequest!: (result: BalanceRequestResult) => void

    test.request.mockImplementationOnce(
      () =>
        new Promise<BalanceRequestResult>((resolve) => {
          resolveRequest = resolve
        }),
    )

    const first = test.controller.get()
    const second = test.controller.get()

    await vi.waitFor(() => expect(test.request).toHaveBeenCalledTimes(1))

    resolveRequest({ status: "ok", payload: payload() })

    await expect(first).resolves.toMatchObject({ status: "ok" })
    await expect(second).resolves.toMatchObject({ status: "ok" })
  })

  it("clears the cache after an authentication error", async () => {
    const test = harness()

    await test.controller.get()
    test.advance(BALANCE_CACHE_TTL_MS + 1)
    test.request.mockResolvedValueOnce({ status: "auth" })

    await expect(test.controller.get()).resolves.toEqual({ status: "error" })

    test.request.mockResolvedValueOnce({ status: "ok", payload: payload() })
    await expect(test.controller.get()).resolves.toMatchObject({ status: "ok" })
    expect(test.request).toHaveBeenCalledTimes(3)
  })

  it("keeps the last balance through a temporary failure, then reports an error", async () => {
    const test = harness()

    await test.controller.get()
    test.advance(BALANCE_CACHE_TTL_MS + 1)
    test.request.mockResolvedValueOnce({ status: "failure" })

    await expect(test.controller.get()).resolves.toMatchObject({ status: "ok", toppedUp: "4.82" })

    test.advance(BALANCE_STALE_TTL_MS)
    test.request.mockResolvedValueOnce({ status: "failure" })

    await expect(test.controller.get()).resolves.toEqual({ status: "error" })
  })

  it("returns no-key without calling the API", async () => {
    const test = harness()

    test.loadKey.mockResolvedValue(undefined)

    await expect(test.controller.get()).resolves.toEqual({ status: "no-key" })
    expect(test.request).not.toHaveBeenCalled()
  })

  it("rechecks credentials after a no-key result", async () => {
    const test = harness()

    test.loadKey.mockResolvedValueOnce(undefined)
    await expect(test.controller.get()).resolves.toEqual({ status: "no-key" })

    await expect(test.controller.get()).resolves.toMatchObject({ status: "ok" })
    expect(test.request).toHaveBeenCalledTimes(1)
  })

  it("treats a credential lookup failure as an error without a cache", async () => {
    const test = harness()

    test.loadKey.mockRejectedValueOnce(new Error("server unavailable"))

    await expect(test.controller.get()).resolves.toEqual({ status: "error" })
    expect(test.request).not.toHaveBeenCalled()
  })

  it("treats an invalid payload as a temporary failure", async () => {
    const test = harness()

    test.request.mockResolvedValueOnce({ status: "ok", payload: { balance_infos: [] } })

    await expect(test.controller.get()).resolves.toEqual({ status: "error" })
  })
})
