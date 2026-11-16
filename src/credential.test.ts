import { describe, expect, it } from "vitest"
import { selectDeepSeekKey, type CredentialEntryLike } from "./credential"

function key(integrationID: string, value: string, active = false): CredentialEntryLike {
  return { integrationID, active, value: { type: "key", key: value } }
}

describe("DeepSeek credential selection", () => {
  it("ignores other providers", () => {
    expect(selectDeepSeekKey([key("openai", "sk-openai"), key("deepseek", "sk-deepseek")], undefined)).toBe(
      "sk-deepseek",
    )
  })

  it("prefers the active DeepSeek key", () => {
    expect(
      selectDeepSeekKey([key("deepseek", "sk-first"), key("deepseek", "sk-active", true)], undefined),
    ).toBe("sk-active")
  })

  it("accepts the first valid DeepSeek key when none is active", () => {
    expect(selectDeepSeekKey([key("deepseek", "sk-first"), key("deepseek", "sk-second")], undefined)).toBe("sk-first")
  })

  it("falls back to DEEPSEEK_API_KEY", () => {
    expect(selectDeepSeekKey([key("openai", "sk-openai")], "sk-env")).toBe("sk-env")
    expect(selectDeepSeekKey([], "sk-env")).toBe("sk-env")
  })

  it("returns undefined when no key is configured", () => {
    expect(selectDeepSeekKey([], undefined)).toBeUndefined()
    expect(selectDeepSeekKey([], "   ")).toBeUndefined()
  })

  it("ignores non-key and empty credential values", () => {
    const entries: CredentialEntryLike[] = [
      { integrationID: "deepseek", value: { type: "oauth" } },
      { integrationID: "deepseek", value: { type: "key", key: "   " } },
      { integrationID: "deepseek", value: { type: "external" } },
    ]

    expect(selectDeepSeekKey(entries, undefined)).toBeUndefined()
  })
})
