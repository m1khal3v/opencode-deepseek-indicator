import { describe, expect, it } from "vitest"
import { getQingmingDate, isChineseStatutoryHoliday, isChineseStatutoryHolidayUTC } from "./holidays"
import {
  DAY,
  HOUR,
  MINUTE,
  SECOND,
  formatLocalDateTime,
  formatRemaining,
  getStatus,
  isWorkdayUTC,
} from "./schedule"

function statusAt(iso: string) {
  const status = getStatus(Date.parse(iso))

  return { ...status, timer: formatRemaining(status.remainingMs) }
}

function holidayAt(iso: string): boolean {
  return isChineseStatutoryHoliday(new Date(iso))
}

describe("DeepSeek weekday boundaries", () => {
  it("switches at every UTC boundary on a normal weekday", () => {
    // Tuesday 9 June 2026 has no Chinese statutory holiday.
    expect(statusAt("2026-06-09T00:59:59.000Z")).toMatchObject({ period: "off-peak", timer: "1 second" })
    expect(statusAt("2026-06-09T01:00:00.000Z")).toMatchObject({ period: "peak", timer: "3 hours" })
    expect(statusAt("2026-06-09T03:59:59.000Z")).toMatchObject({ period: "peak", timer: "1 second" })
    expect(statusAt("2026-06-09T04:00:00.000Z")).toMatchObject({ period: "off-peak", timer: "2 hours" })
    expect(statusAt("2026-06-09T06:00:00.000Z")).toMatchObject({ period: "peak", timer: "4 hours" })
    expect(statusAt("2026-06-09T09:59:59.000Z")).toMatchObject({ period: "peak", timer: "1 second" })
  })

  it("jumps to the next workday after the last peak window", () => {
    // Monday–Thursday 10:00 UTC leaves 15 hours until 01:00 the next day.
    expect(statusAt("2026-06-08T10:00:00.000Z")).toMatchObject({ period: "off-peak", timer: "15 hours" })
    expect(statusAt("2026-06-09T10:00:00.000Z")).toMatchObject({ period: "off-peak", timer: "15 hours" })
    expect(statusAt("2026-06-10T10:00:00.000Z")).toMatchObject({ period: "off-peak", timer: "15 hours" })
    expect(statusAt("2026-06-11T10:00:00.000Z")).toMatchObject({ period: "off-peak", timer: "15 hours" })

    // Friday 10:00 UTC waits for Monday 01:00 UTC: 2 days 15 hours.
    expect(statusAt("2026-06-12T10:00:00.000Z")).toMatchObject({
      period: "off-peak",
      timer: "2 days 15 hours",
    })
  })

  it("never shows 0 seconds just below a boundary", () => {
    expect(statusAt("2026-06-09T00:59:59.800Z")).toMatchObject({ period: "off-peak", timer: "1 second" })
    expect(statusAt("2026-06-09T01:00:00.000Z").period).toBe("peak")
  })
})

describe("timer formatting", () => {
  it("implements all seven branches", () => {
    expect(formatRemaining(DAY + HOUR)).toBe("1 day 1 hour")
    expect(formatRemaining(2 * DAY + 15 * HOUR)).toBe("2 days 15 hours")
    expect(formatRemaining(DAY + MINUTE)).toBe("1 day 1 minute")
    expect(formatRemaining(3 * DAY + 5 * MINUTE)).toBe("3 days 5 minutes")
    expect(formatRemaining(DAY)).toBe("1 day")
    expect(formatRemaining(2 * DAY)).toBe("2 days")
    expect(formatRemaining(HOUR + MINUTE)).toBe("1 hour 1 minute")
    expect(formatRemaining(14 * HOUR + 30 * MINUTE)).toBe("14 hours 30 minutes")
    expect(formatRemaining(HOUR)).toBe("1 hour")
    expect(formatRemaining(3 * HOUR)).toBe("3 hours")
    expect(formatRemaining(MINUTE)).toBe("1 minute")
    expect(formatRemaining(59 * MINUTE)).toBe("59 minutes")
    expect(formatRemaining(SECOND)).toBe("1 second")
    expect(formatRemaining(45 * SECOND)).toBe("45 seconds")
  })

  it("rounds sub-second remainders up to one second", () => {
    expect(formatRemaining(0)).toBe("1 second")
    expect(formatRemaining(1)).toBe("1 second")
    expect(formatRemaining(999)).toBe("1 second")
  })
})

describe("Chinese statutory holidays", () => {
  it("covers fixed Gregorian dates, including the 2025 Labour Day reform", () => {
    for (const year of [2025, 2026, 2027, 2028]) {
      expect(isChineseStatutoryHolidayUTC(year, 0, 1)).toBe(true)
      expect(isChineseStatutoryHolidayUTC(year, 4, 1)).toBe(true)
      expect(isChineseStatutoryHolidayUTC(year, 4, 2)).toBe(true)
      expect(isChineseStatutoryHolidayUTC(year, 9, 1)).toBe(true)
      expect(isChineseStatutoryHolidayUTC(year, 9, 2)).toBe(true)
      expect(isChineseStatutoryHolidayUTC(year, 9, 3)).toBe(true)
    }
  })

  it("calculates Qingming from the 15° solar term", () => {
    expect(getQingmingDate(2025)).toMatchObject({ month: 4, day: 4 })
    expect(getQingmingDate(2026)).toMatchObject({ month: 4, day: 5 })
    expect(getQingmingDate(2028)).toMatchObject({ month: 4, day: 4 })
    // A rare 6 April Qingming (00:23 China Standard Time).
    expect(getQingmingDate(1910)).toMatchObject({ month: 4, day: 6 })
    expect(isChineseStatutoryHolidayUTC(1910, 3, 6)).toBe(true)

    expect(holidayAt("2025-04-04T12:00:00Z")).toBe(true)
    expect(holidayAt("2026-04-05T12:00:00Z")).toBe(true)
    expect(holidayAt("2028-04-04T12:00:00Z")).toBe(true)

    // A Friday Qingming is Off-Peak even inside a normal peak window.
    expect(statusAt("2025-04-04T02:00:00.000Z").period).toBe("off-peak")
    expect(statusAt("2028-04-04T02:00:00.000Z").period).toBe("off-peak")
    expect(statusAt("2026-04-05T02:00:00.000Z").period).toBe("off-peak")

    // The day before Qingming in 2025 is an ordinary Thursday.
    expect(holidayAt("2025-04-03T12:00:00Z")).toBe(false)
  })

  it("covers the 2026 Spring Festival, Dragon Boat and Mid-Autumn holidays", () => {
    // 除夕, the 29th day of the 12th lunar month, then Spring Festival days 1–3.
    expect(holidayAt("2026-02-16T12:00:00Z")).toBe(true)
    expect(holidayAt("2026-02-17T12:00:00Z")).toBe(true)
    expect(holidayAt("2026-02-18T12:00:00Z")).toBe(true)
    expect(holidayAt("2026-02-19T12:00:00Z")).toBe(true)
    expect(holidayAt("2026-02-15T12:00:00Z")).toBe(false)
    expect(holidayAt("2026-02-20T12:00:00Z")).toBe(false)

    expect(holidayAt("2026-06-19T12:00:00Z")).toBe(true) // 端午节
    expect(holidayAt("2026-09-25T12:00:00Z")).toBe(true) // 中秋节
  })

  it("does not duplicate a holiday in a leap lunar month", () => {
    // 25 July 2025 is the first day of the leap sixth lunar month (6bis).
    expect(holidayAt("2025-07-25T12:00:00Z")).toBe(false)
    expect(isWorkdayUTC(new Date("2025-07-25T12:00:00Z"))).toBe(true)
  })

  it("treats every weekend as Off-Peak, including 调休 working weekends", () => {
    // Saturday 13 June 2026.
    expect(statusAt("2026-06-13T12:00:00.000Z")).toMatchObject({
      period: "off-peak",
      timer: "1 day 13 hours",
    })

    // Sunday 28 September 2025 is a make-up workday in China, but not in this
    // offline model: weekends are always Off-Peak.
    expect(statusAt("2025-09-28T12:00:00.000Z")).toMatchObject({
      period: "off-peak",
      timer: "13 hours",
    })
  })

  it("keeps a holiday Off-Peak through the whole day and over the following weekend", () => {
    expect(statusAt("2025-05-02T01:00:00.000Z")).toMatchObject({
      period: "off-peak",
      timer: "3 days",
    })
    expect(statusAt("2025-05-02T12:00:00.000Z")).toMatchObject({
      period: "off-peak",
      timer: "2 days 13 hours",
    })

    expect(statusAt("2026-02-17T12:00:00.000Z")).toMatchObject({
      period: "off-peak",
      timer: "2 days 13 hours",
    })
  })
})

describe("tooltip", () => {
  it("uses the local date and time of the next switch only", () => {
    const next = Date.UTC(2026, 10, 14, 2, 0, 0)
    const expected = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(next)

    const text = formatLocalDateTime(next)

    expect(text).toBe(expected)
    expect(text).not.toMatch(/UTC|GMT/)
    expect(text).not.toMatch(/\$|USD|CNY|%/)
  })
})
