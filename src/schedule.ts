import { isChineseStatutoryHoliday } from "./holidays"

export type Period = "off-peak" | "peak"

export interface PeriodStatus {
  readonly period: Period
  /** Instant of the next Peak/Off-Peak switch, in milliseconds since the Unix epoch. */
  readonly nextTransitionMs: number
  /** `nextTransitionMs - nowMs`, always positive. */
  readonly remainingMs: number
}

const MS_PER_SECOND = 1_000
const MS_PER_MINUTE = 60 * MS_PER_SECOND
const MS_PER_HOUR = 60 * MS_PER_MINUTE
const MS_PER_DAY = 24 * MS_PER_HOUR

/** Peak windows on a Chinese statutory workday, as UTC offsets from midnight. */
const PEAK_WINDOWS = [
  { start: 1 * MS_PER_HOUR, end: 4 * MS_PER_HOUR },
  { start: 6 * MS_PER_HOUR, end: 10 * MS_PER_HOUR },
] as const

/** Safety valve for the next-workday search. */
const MAX_LOOKAHEAD_DAYS = 30

const localDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
})

/**
 * A UTC day is a workday when it is Monday–Friday and not a Chinese statutory
 * holiday. Chinese make-up workdays (调休) are not modelled: weekends are always
 * Off-Peak even when the State Council turns one into a working day.
 */
export function isWorkdayUTC(date: Date): boolean {
  const weekday = date.getUTCDay()

  return weekday >= 1 && weekday <= 5 && !isChineseStatutoryHoliday(date)
}

function nextWorkdayPeakStart(year: number, monthIndex: number, day: number): number {
  for (let offset = 1; offset <= MAX_LOOKAHEAD_DAYS; offset++) {
    const midnight = Date.UTC(year, monthIndex, day + offset)

    if (isWorkdayUTC(new Date(midnight))) return midnight + 1 * MS_PER_HOUR
  }

  throw new Error("Unable to find the next DeepSeek workday within 30 days")
}

/**
 * DeepSeek's current tariff period and the next switch.
 *
 * Rules, relative to UTC:
 * - Peak: 01:00–04:00 and 06:00–10:00 on Monday–Friday, except Chinese statutory
 *   holidays.
 * - Off-Peak: every other time, including all weekends and holidays.
 */
export function getStatus(nowMs: number): PeriodStatus {
  const now = new Date(nowMs)
  const year = now.getUTCFullYear()
  const monthIndex = now.getUTCMonth()
  const day = now.getUTCDate()
  const midnight = Date.UTC(year, monthIndex, day)
  const elapsed = nowMs - midnight

  if (!isWorkdayUTC(now)) {
    const nextTransitionMs = nextWorkdayPeakStart(year, monthIndex, day)

    return { period: "off-peak", nextTransitionMs, remainingMs: nextTransitionMs - nowMs }
  }

  for (const window of PEAK_WINDOWS) {
    if (elapsed >= window.start && elapsed < window.end) {
      return {
        period: "peak",
        nextTransitionMs: midnight + window.end,
        remainingMs: midnight + window.end - nowMs,
      }
    }
  }

  if (elapsed < PEAK_WINDOWS[0].start) {
    return {
      period: "off-peak",
      nextTransitionMs: midnight + PEAK_WINDOWS[0].start,
      remainingMs: midnight + PEAK_WINDOWS[0].start - nowMs,
    }
  }

  if (elapsed >= PEAK_WINDOWS[0].end && elapsed < PEAK_WINDOWS[1].start) {
    return {
      period: "off-peak",
      nextTransitionMs: midnight + PEAK_WINDOWS[1].start,
      remainingMs: midnight + PEAK_WINDOWS[1].start - nowMs,
    }
  }

  // 10:00 UTC or later: the next peak starts on the next workday at 01:00 UTC.
  const nextTransitionMs = nextWorkdayPeakStart(year, monthIndex, day)

  return { period: "off-peak", nextTransitionMs, remainingMs: nextTransitionMs - nowMs }
}

export function plural(value: number, singular: string): string {
  return value === 1 ? singular : `${singular}s`
}

/**
 * Formats the time until the next switch using the seven required branches.
 * Sub-second remainders show as `1 second`, never `0 seconds`.
 */
export function formatRemaining(diffMs: number): string {
  const totalSeconds = Math.max(1, Math.floor(diffMs / MS_PER_SECOND))
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0 && hours > 0) return `${days} ${plural(days, "day")} ${hours} ${plural(hours, "hour")}`
  if (days > 0 && hours === 0 && minutes > 0)
    return `${days} ${plural(days, "day")} ${minutes} ${plural(minutes, "minute")}`
  if (days > 0 && hours === 0 && minutes === 0) return `${days} ${plural(days, "day")}`
  if (days === 0 && hours > 0 && minutes > 0)
    return `${hours} ${plural(hours, "hour")} ${minutes} ${plural(minutes, "minute")}`
  if (days === 0 && hours > 0 && minutes === 0) return `${hours} ${plural(hours, "hour")}`
  if (days === 0 && hours === 0 && minutes > 0) return `${minutes} ${plural(minutes, "minute")}`

  return `${seconds} ${plural(seconds, "second")}`
}

/**
 * The exact next switch in the user's local date and time, with no UTC label
 * and no pricing modifiers.
 */
export function formatLocalDateTime(nextTransitionMs: number): string {
  return localDateTimeFormatter.format(nextTransitionMs)
}

export const SECOND = MS_PER_SECOND
export const MINUTE = MS_PER_MINUTE
export const HOUR = MS_PER_HOUR
export const DAY = MS_PER_DAY
