import { createMemo, Show } from "solid-js"
import { usePlugin, type SessionRef } from "@opencode/plugin/gui"
import { formatLocalDateTime, formatRemaining, getStatus } from "./schedule"

export interface PeakIndicatorProps {
  /** Reactive getter from the host slot; never destructure it. */
  readonly active: () => boolean
  /** Reactive getter from the host slot; read it when the click happens. */
  readonly session: () => SessionRef
  /** Shared one-second clock created in `setup`, not in this component. */
  readonly now: () => number
  readonly openPricing: (session: SessionRef) => void
}

export function PeakIndicator(props: PeakIndicatorProps) {
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

  return (
    <Show when={props.active()}>
      <ctx.ui.Tooltip
        value={
          <span class="deepseek-peak-tooltip">
            <span>Status: {label()}</span>
            <span>Until: {until()}</span>
          </span>
        }
        placement="bottom"
      >
        <ctx.ui.Button
          type="button"
          class="deepseek-peak-indicator"
          variant="ghost-muted"
          onClick={() => props.openPricing(props.session())}
        >
          <span
            class="deepseek-peak-indicator__dot"
            data-appearance={ctx.appearance.mode()}
            data-period={period()}
            aria-hidden="true"
          />
          <span class="deepseek-peak-indicator__sr">{label()}</span>
          <span class="deepseek-peak-indicator__timer">{timer()}</span>
        </ctx.ui.Button>
      </ctx.ui.Tooltip>
    </Show>
  )
}
