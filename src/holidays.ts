/**
 * Statutory holidays of the People's Republic of China, computed offline.
 *
 * The plugin follows the seven statutory holidays (13 statutory days per year after
 * the State Council's 2025 reform). Dynamically announced 调休 make-up days and
 * extended breaks are intentionally not computed: without a network lookup they
 * cannot be known in advance.
 */

const MS_PER_DAY = 86_400_000
const ASIA_SHANGHAI = "Asia/Shanghai"
const RAD = Math.PI / 180

/** The apparent geocentric longitude of the Sun at the Qingming solar term. */
const QINGMING_LONGITUDE = 15

/**
 * Chinese lunar calendar formatter built into V8/ICU. No network access is needed.
 * The `day` and `month` parts are enough to identify every lunar holiday below.
 */
const chineseCalendar = new Intl.DateTimeFormat("en-US-u-ca-chinese", {
  timeZone: ASIA_SHANGHAI,
  month: "numeric",
  day: "numeric",
})

/** Formats an instant as a calendar date in China Standard Time. */
const shanghaiCalendar = new Intl.DateTimeFormat("en-CA", {
  timeZone: ASIA_SHANGHAI,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

interface LunarDate {
  /** Numeric lunar month. Leap months (`6bis`) are deliberately not returned. */
  readonly month: number
  readonly day: number
}

export interface QingmingDate {
  readonly year: number
  /** 1-based month, always 4 (April). */
  readonly month: number
  readonly day: number
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360
}

/** A signed angle in (-180, 180], used by the solar-longitude root finder. */
function normalizeSignedDegrees(value: number): number {
  return ((value + 180) % 360 + 360) % 360 - 180
}

/**
 * Apparent geocentric longitude of the Sun, in degrees, using the low-precision
 * solar coordinates from Jean Meeus, *Astronomical Algorithms* (chapter 25).
 *
 * The result includes the correction to the apparent equinox (nutation and
 * aberration). It is more than accurate enough to decide on which civil date in
 * Asia/Shanghai the Sun crosses a given longitude.
 */
export function apparentSolarLongitude(instantMs: number): number {
  const julianDay = instantMs / MS_PER_DAY + 2_440_587.5
  const t = (julianDay - 2_451_545.0) / 36_525

  const meanLongitude = 280.46646 + 36_000.76983 * t + 0.0003032 * t * t
  const meanAnomaly = (357.52911 + 35_999.05029 * t - 0.0001537 * t * t) * RAD

  const equationOfCenter =
    (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(meanAnomaly) +
    (0.019993 - 0.000101 * t) * Math.sin(2 * meanAnomaly) +
    0.000289 * Math.sin(3 * meanAnomaly)

  const trueLongitude = meanLongitude + equationOfCenter
  const ascendingNode = (125.04 - 1934.136 * t) * RAD

  return normalizeDegrees(trueLongitude - 0.00569 - 0.00478 * Math.sin(ascendingNode))
}

/**
 * The civil date of Qingming (清明节) in Asia/Shanghai for a Gregorian year.
 *
 * Finds the instant the Sun's apparent longitude reaches 15 degrees by bisection
 * between 3 and 6 April UTC, then converts that instant to the Chinese calendar
 * date. The result is 4, 5 or (rarely) 6 April for the supported 1900–2100 range.
 */
export function getQingmingDate(year: number): QingmingDate {
  // The apparent longitude increases monotonically through this window (roughly
  // 13.2° on 3 April to 16.2° on 6 April), so a plain bisection is sufficient.
  let lo = Date.UTC(year, 3, 3, 0, 0, 0, 0)
  let hi = Date.UTC(year, 3, 6, 23, 59, 59, 999)

  for (let iteration = 0; iteration < 64 && lo < hi; iteration++) {
    const mid = lo + Math.floor((hi - lo) / 2)

    if (normalizeSignedDegrees(apparentSolarLongitude(mid) - QINGMING_LONGITUDE) < 0) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }

  const parts = shanghaiCalendar.formatToParts(lo)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  }
}

/**
 * Reads the Chinese lunar date for a UTC calendar date at noon in Beijing.
 *
 * Noon avoids any boundary effect around midnight. A leap lunar month is marked by
 * ICU as e.g. `6bis`; rejecting non-numeric months means a holiday is never
 * duplicated in a leap month.
 */
function lunarDateForUtcDay(year: number, monthIndex: number, day: number): LunarDate | undefined {
  const noonInShanghai = Date.UTC(year, monthIndex, day, 4, 0, 0, 0)
  const parts = chineseCalendar.formatToParts(noonInShanghai)
  const monthPart = parts.find((part) => part.type === "month")?.value
  const dayPart = parts.find((part) => part.type === "day")?.value

  if (!monthPart || !dayPart) return undefined
  if (!/^\d+$/.test(monthPart)) return undefined
  if (!/^\d+$/.test(dayPart)) return undefined

  return { month: Number(monthPart), day: Number(dayPart) }
}

/** Lunar New Year's Eve, Spring Festival days 1–3, Dragon Boat and Mid-Autumn. */
function isLunarHoliday(year: number, monthIndex: number, day: number): boolean {
  const today = lunarDateForUtcDay(year, monthIndex, day)

  if (today) {
    if (today.month === 1 && today.day >= 1 && today.day <= 3) return true
    if (today.month === 5 && today.day === 5) return true
    if (today.month === 8 && today.day === 15) return true
  }

  // 除夕: the day before lunar 1/1. This handles both 29- and 30-day twelfth months.
  const tomorrow = lunarDateForUtcDay(year, monthIndex, day + 1)

  return !!tomorrow && tomorrow.month === 1 && tomorrow.day === 1
}

/**
 * Whether a UTC calendar date is a statutory public holiday in China.
 *
 * Fixed Gregorian dates: New Year (1 January), Labour Day (1–2 May) and National
 * Day (1–3 October). Qingming is computed from the solar term, while Spring
 * Festival, Dragon Boat and Mid-Autumn follow the built-in Chinese lunar calendar.
 */
export function isChineseStatutoryHoliday(date: Date): boolean {
  if (Number.isNaN(date.getTime())) return false

  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()

  // Fixed Gregorian holidays.
  if (month === 0 && day === 1) return true
  if (month === 4 && (day === 1 || day === 2)) return true
  if (month === 9 && day >= 1 && day <= 3) return true

  // Qingming falls on 4 or 5 April in almost every year, and on 6 April in a
  // few (e.g. 1910). Skip the solar calculation for every other date.
  if (month === 3 && day >= 4 && day <= 6) {
    const qingming = getQingmingDate(year)

    if (qingming.month === 4 && qingming.day === day) return true
  }

  return isLunarHoliday(year, month, day)
}

/** Convenience wrapper for callers that hold UTC date components. */
export function isChineseStatutoryHolidayUTC(year: number, monthIndex: number, day: number): boolean {
  return isChineseStatutoryHoliday(new Date(Date.UTC(year, monthIndex, day)))
}
