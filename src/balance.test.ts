import { describe, expect, it } from "vitest"
import { formatBalance, formatMoney, parseBalanceResponse, toBalanceSnapshot } from "./balance"

interface RawBalance {
  readonly currency: string
  readonly total_balance?: string
  readonly granted_balance?: string
  readonly topped_up_balance?: string
}

function response(infos: readonly RawBalance[]): unknown {
  return { is_available: true, balance_infos: infos }
}

function snapshot(infos: readonly RawBalance[]) {
  const entries = parseBalanceResponse(response(infos))

  expect(entries).toBeDefined()

  return toBalanceSnapshot(entries ?? [], 1_700_000_000_000)
}

describe("DeepSeek balance parsing", () => {
  it("keeps the topped-up amount and the bonus separate", () => {
    const result = snapshot([
      { currency: "USD", total_balance: "10.37", granted_balance: "5.55", topped_up_balance: "4.82" },
    ])

    expect(result).toMatchObject({
      status: "ok",
      currency: "USD",
      toppedUp: "4.82",
      granted: "5.55",
      total: "10.37",
      bonusCurrency: undefined,
      fetchedAt: 1_700_000_000_000,
    })

    expect(formatBalance(result!)).toEqual({
      primary: "$4.82",
      bonus: "$5.55 bonus",
      tooltip: "Balance: $10.37 ($4.82 + $5.55 bonus)",
    })
  })

  it("omits the bonus when the granted balance is zero", () => {
    const result = snapshot([
      { currency: "USD", total_balance: "4.82", granted_balance: "0.00", topped_up_balance: "4.82" },
    ])

    expect(formatBalance(result!)).toEqual({ primary: "$4.82", tooltip: "Balance: $4.82" })
  })

  it("formats CNY amounts with the yuan sign", () => {
    const withBonus = snapshot([
      { currency: "CNY", total_balance: "110.00", granted_balance: "10.00", topped_up_balance: "100.00" },
    ])
    const withoutBonus = snapshot([
      { currency: "CNY", total_balance: "110.00", granted_balance: "0.00", topped_up_balance: "110.00" },
    ])

    expect(formatBalance(withBonus!)).toEqual({
      primary: "¥100.00",
      bonus: "¥10.00 bonus",
      tooltip: "Balance: ¥110.00 (¥100.00 + ¥10.00 bonus)",
    })
    expect(formatBalance(withoutBonus!)).toEqual({ primary: "¥110.00", tooltip: "Balance: ¥110.00" })
  })

  it("renders a welcome bonus with a zero topped-up balance", () => {
    const result = snapshot([
      { currency: "USD", total_balance: "5.00", granted_balance: "5.00", topped_up_balance: "0.00" },
    ])

    expect(formatBalance(result!)).toEqual({
      primary: "$0.00",
      bonus: "$5.00 bonus",
      tooltip: "Balance: $5.00 ($0.00 + $5.00 bonus)",
    })
  })

  it("uses an unknown currency name as the prefix", () => {
    const result = snapshot([
      { currency: "EUR", total_balance: "4.82", granted_balance: "0.00", topped_up_balance: "4.82" },
    ])

    expect(formatBalance(result!)).toEqual({ primary: "EUR 4.82", tooltip: "Balance: EUR 4.82" })
  })

  it("picks a funded entry and prioritises USD over CNY", () => {
    const fundedCny = snapshot([
      { currency: "USD", total_balance: "0.00", granted_balance: "0.00", topped_up_balance: "0.00" },
      { currency: "CNY", total_balance: "50.00", granted_balance: "0.00", topped_up_balance: "50.00" },
    ])
    const bothFunded = snapshot([
      { currency: "CNY", total_balance: "50.00", granted_balance: "0.00", topped_up_balance: "50.00" },
      { currency: "USD", total_balance: "10.00", granted_balance: "0.00", topped_up_balance: "10.00" },
    ])

    expect(fundedCny).toMatchObject({ currency: "CNY", toppedUp: "50.00", total: "50.00" })
    expect(bothFunded).toMatchObject({ currency: "USD", toppedUp: "10.00", total: "10.00" })
  })

  it("shows a bonus in a different currency without summing currencies", () => {
    const result = snapshot([
      { currency: "CNY", total_balance: "110.00", granted_balance: "0.00", topped_up_balance: "110.00" },
      { currency: "USD", total_balance: "0.00", granted_balance: "5.00", topped_up_balance: "0.00" },
    ])

    expect(result).toMatchObject({
      currency: "CNY",
      toppedUp: "110.00",
      granted: "5.00",
      total: "110.00",
      bonusCurrency: "USD",
    })
    expect(formatBalance(result!)).toEqual({
      primary: "¥110.00",
      bonus: "$5.00 bonus",
      tooltip: "Balance: ¥110.00 + $5.00 bonus",
    })
  })

  it("derives the topped-up amount when topped_up_balance is missing or empty", () => {
    const missing = snapshot([{ currency: "USD", total_balance: "10.00", granted_balance: "4.00" }])
    const empty = snapshot([
      { currency: "USD", total_balance: "10.00", granted_balance: "4.00", topped_up_balance: "" },
    ])

    expect(missing).toMatchObject({ toppedUp: "6.00", granted: "4.00", total: "10.00" })
    expect(empty).toMatchObject({ toppedUp: "6.00", granted: "4.00", total: "10.00" })
  })

  it("rejects an empty or malformed response", () => {
    expect(parseBalanceResponse({})).toBeUndefined()
    expect(parseBalanceResponse({ balance_infos: [] })).toBeUndefined()
    expect(parseBalanceResponse({ balance_infos: [{}] })).toBeUndefined()
    expect(parseBalanceResponse({ balance_infos: [{ currency: "USD" }] })).toBeUndefined()
    expect(
      parseBalanceResponse(response([{ currency: "USD", total_balance: "NaN", granted_balance: "0.00" }])),
    ).toBeUndefined()
    expect(
      parseBalanceResponse(response([{ currency: "USD", total_balance: "10.00", granted_balance: "oops" }])),
    ).toBeUndefined()
  })

  it("formats amounts with exactly two decimals", () => {
    expect(formatMoney("USD", "4.8")).toBe("$4.80")
    expect(formatMoney("CNY", "110")).toBe("¥110.00")
    expect(formatMoney("EUR", "4.825")).toBe("EUR 4.83")
  })

  it("does not render a balance for no-key or error snapshots", () => {
    expect(formatBalance({ status: "no-key" })).toBeUndefined()
    expect(formatBalance({ status: "error" })).toBeUndefined()
  })
})
