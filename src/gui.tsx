import { createSignal } from "solid-js"
import { Plugin, Slot, Style, type SessionRef } from "@opencode/plugin/gui"
import { Browser } from "@opencode/plugin/gui/browser"
import { PeakIndicator } from "./indicator"
import css from "./styles.css?inline"

const DEEPSEEK_PRICING_URL = "https://api-docs.deepseek.com/quick_start/pricing"

export default Plugin.define({
  setup(ctx) {
    // One clock for every session header in this window. The signal lives here,
    // never at module scope, so hot reloads and extra windows cannot share it.
    const [now, setNow] = createSignal(Date.now())
    const syncNow = () => setNow(Date.now())
    const timer = setInterval(syncNow, 1_000)

    // Returning from sleep or switching back to the app should not wait for the
    // next interval tick to correct a stale countdown.
    document.addEventListener("visibilitychange", syncNow)
    window.addEventListener("focus", syncNow)

    ctx.add(Style, css)

    // The built-in browser pane is optional: on the web client or while its
    // plugin is disabled the contract is inactive and we fall back to the OS.
    const browser = ctx.use(Browser)

    const openPricing = (session: SessionRef) => {
      try {
        const live = browser()

        if (live.status === "active" && live.value.canOpen(session, DEEPSEEK_PRICING_URL)) {
          live.value.open(session, DEEPSEEK_PRICING_URL)
          return
        }
      } catch {
        // A pane that cannot open the URL must not swallow the click.
      }

      ctx.system.openExternal(DEEPSEEK_PRICING_URL)
    }

    ctx.add(Slot, {
      at: "session.header",
      // The built-in "Toggle session context" contribution uses order 10, and
      // the details popover uses 20. Order 9 places us directly to its left.
      order: 9,
      render: (input) => (
        <PeakIndicator
          active={() => input.active}
          session={() => input.session}
          now={now}
          openPricing={openPricing}
        />
      ),
    })

    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", syncNow)
      window.removeEventListener("focus", syncNow)
    }
  },
})
