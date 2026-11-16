import { Schema } from "effect"
import { Ipc } from "@opencode/plugin/gui"

export const BalanceSnapshot = Schema.Struct({
  status: Schema.Literals(["ok", "no-key", "error"]),
  currency: Schema.optional(Schema.String),
  toppedUp: Schema.optional(Schema.String),
  granted: Schema.optional(Schema.String),
  total: Schema.optional(Schema.String),
  bonusCurrency: Schema.optional(Schema.String),
  fetchedAt: Schema.optional(Schema.Number),
})

export type BalanceSnapshot = typeof BalanceSnapshot.Type

export const BalanceIpc = Ipc.define({
  id: "opencode-deepseek-indicator.balance",
  methods: {
    getBalance: {
      input: Schema.Struct({ force: Schema.optional(Schema.Boolean) }),
      output: BalanceSnapshot,
    },
  },
  events: {
    changed: BalanceSnapshot,
  },
})
