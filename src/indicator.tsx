import { createMemo, Show } from "solid-js"
import { usePlugin, type SessionRef } from "@opencode/plugin/gui"
import { formatBalance } from "./balance"
import type { BalanceSnapshot } from "./contract"
import { formatLocalDateTime, formatRemaining, getStatus } from "./schedule"

export interface DeepSeekIndicatorProps {
  /** Reactive getter from the host slot; never destructure it. */
  readonly active: () => boolean
  /** Reactive getter from the host slot; read it when the click happens. */
  readonly session: () => SessionRef
  /** Shared one-second clock created in `setup`, not in this component. */
  readonly now: () => number
  /** Current balance snapshot, shared by every session header in the window. */
  readonly balance: () => BalanceSnapshot | undefined
  readonly openPricing: (session: SessionRef) => void
}

export function DeepSeekIndicator(props: DeepSeekIndicatorProps) {
  const ctx = usePlugin()

  // The memo stops all work for cached timelines whose tab is not on screen.
  const status = createMemo(() => (props.active() ? getStatus(props.now()) : undefined))

  const period = createMemo(() => status()?.period)
  const label = createMemo(() => (period() === "peak" ? "Peak" : "Off-Peak"))
  const timer = createMemo(() => {
    const current = status()

    return current ? formatRemaining(current.remainingMs) : ""
  })
  const until = createMemo(() => {
    const current = status()

    return current ? formatLocalDateTime(current.nextTransitionMs) : ""
  })
  const display = createMemo(() => {
    const snapshot = props.balance()

    return snapshot === undefined ? undefined : formatBalance(snapshot)
  })
  const tooltipBalance = createMemo(() => {
    const snapshot = props.balance()

    if (snapshot === undefined || snapshot.status === "no-key") return undefined
    if (snapshot.status === "error") return "Balance: unavailable"

    return display()?.tooltip
  })

  return (
    <Show when={props.active()}>
      <ctx.ui.Tooltip
        value={
          <span class="deepseek-tooltip">
            <span>Status: {label()}</span>
            <span>Until: {until()}</span>
            <Show when={tooltipBalance()}>
              <span>{tooltipBalance()}</span>
            </Show>
          </span>
        }
        placement="bottom"
      >
        <ctx.ui.Button
          type="button"
          class="deepseek-indicator"
          variant="ghost-muted"
          onClick={() => props.openPricing(props.session())}
        >
          <span
            class="deepseek-indicator__dot"
            data-appearance={ctx.appearance.mode()}
            data-period={period()}
            aria-hidden="true"
          />
          <span class="deepseek-indicator__sr">{label()}</span>
          <span class="deepseek-indicator__timer">{timer()}</span>
          <Show when={display()}>
            {(value) => (
              <span class="deepseek-indicator__balance">
                <span class="deepseek-indicator__separator"> · </span>
                {value().primary}
                <Show when={value().bonus}>
                  <span class="deepseek-indicator__plus">
                    {" + "}
                    <span class="deepseek-indicator__bonus" data-appearance={ctx.appearance.mode()}>
                      {value().bonus}
                    </span>
                  </span>
                </Show>
              </span>
            )}
          </Show>
        </ctx.ui.Button>
      </ctx.ui.Tooltip>
    </Show>
  )
}
