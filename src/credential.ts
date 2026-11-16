export interface CredentialValueLike {
  readonly type?: string
  readonly key?: string
}

export interface CredentialEntryLike {
  readonly integrationID?: string
  readonly active?: boolean
  readonly value?: CredentialValueLike
}

/**
 * Selects the DeepSeek API key from OpenCode credentials, preferring the
 * active key, then the first stored key. An environment key is the fallback.
 */
export function selectDeepSeekKey(
  entries: readonly CredentialEntryLike[],
  envKey: string | undefined,
): string | undefined {
  const keys = entries.filter(
    (entry) =>
      entry.integrationID === "deepseek" &&
      entry.value?.type === "key" &&
      typeof entry.value.key === "string" &&
      entry.value.key.trim() !== "",
  )
  const selected = keys.find((entry) => entry.active === true) ?? keys[0]
  const key = selected?.value?.key?.trim()

  if (key !== undefined && key !== "") return key
  if (envKey === undefined) return undefined

  const fallback = envKey.trim()

  return fallback === "" ? undefined : fallback
}
