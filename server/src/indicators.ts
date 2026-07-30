/**
 * A collection of pure functions for calculating technical indicators from
 * numerical series.  None of these functions mutate their inputs and all
 * return new arrays.  They are intentionally simple so that the signal
 * generator can remain easy to reason about.  For production use you may
 * wish to adopt a battle‑tested library such as `technicalindicators`.
 */

/**
 * Computes an exponential moving average (EMA) for the given series.
 *
 * The EMA is initialised using the first value of the series and then
 * updated using the smoothing factor `k = 2/(period + 1)`.  When the
 * period is less than or equal to 1 the input series is returned.
 *
 * Time complexity: O(n) where n = series.length.
 *
 * @param series – an array of numerical values
 * @param period – the number of samples over which to smooth
 * @returns a new array containing the EMA for each element in the series
 */
export function ema(series: number[], period: number): number[] {
  if (period <= 1) return [...series];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = series[0];
  out.push(prev);
  for (let i = 1; i < series.length; i++) {
    const v = series[i] * k + prev * (1 - k);
    out.push(v);
    prev = v;
  }
  return out;
}

/**
 * Calculates the MACD (Moving Average Convergence Divergence) for the series.
 *
 * The MACD line is the difference between a fast EMA and a slow EMA.  A
 * signal line is computed by applying an EMA to the MACD line.  The
 * histogram is the difference between the MACD line and the signal line.
 *
 * If the input series is shorter than (slow + signal + 5) samples an empty
 * result is returned to indicate insufficient data.
 *
 * Time complexity: O(n).
 *
 * @param series – an array of closing prices
 * @param fast – the period for the fast EMA (default 12)
 * @param slow – the period for the slow EMA (default 26)
 * @param signal – the period for the signal line EMA (default 9)
 * @returns an object containing arrays for the macd line, signal line and histogram
 */
export function macd(series: number[], fast = 12, slow = 26, signal = 9) {
  if (series.length < slow + signal + 5) return { macd: [], signal: [], hist: [] };
  const emaFast = ema(series, fast);
  const emaSlow = ema(series, slow);
  const macdLine: number[] = [];
  for (let i = 0; i < series.length; i++) {
    macdLine.push((emaFast[i] ?? 0) - (emaSlow[i] ?? 0));
  }
  const signalLine = ema(macdLine, signal);
  const hist: number[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    hist.push(macdLine[i] - (signalLine[i] ?? 0));
  }
  return { macd: macdLine, signal: signalLine, hist };
}

/**
 * Computes the Relative Strength Index (RSI) for a series of closing prices.
 *
 * The RSI measures the magnitude of recent price changes to evaluate
 * overbought or oversold conditions.  Values range from 0 to 100.
 *
 * @param series – an array of closing prices
 * @param length – the lookback period (default 14)
 * @returns an array of RSI values; the first `length` values will be NaN
 */
export function rsi(series: number[], length = 14): number[] {
  const rsi: number[] = [];
  let gainSum = 0;
  let lossSum = 0;
  // Seed the initial sums
  for (let i = 1; i <= length; i++) {
    const diff = series[i] - series[i - 1];
    if (diff >= 0) gainSum += diff; else lossSum -= diff;
    rsi.push(NaN);
  }
  // First average gains and losses
  let avgGain = gainSum / length;
  let avgLoss = lossSum / length;
  // Compute initial RSI. When avgLoss is 0, RS is mathematically infinite
  // (unbounded gains, no losses at all), which means RSI -> 100, not 0 --
  // treating rs as 0 in that case (as this used to) computes
  // 100 - 100/(1+0) = 0, the exact opposite of correct. A perfectly flat
  // window (no gains either) is conventionally 50, since there's no
  // directional information at all.
  rsi[length] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
  // Iterate through the rest of the series
  for (let i = length + 1; i < series.length; i++) {
    const diff = series[i] - series[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (length - 1) + gain) / length;
    avgLoss = (avgLoss * (length - 1) + loss) / length;
    rsi[i] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

/**
 * Calculates the Average True Range (ATR) given arrays of high, low and close
 * prices.  ATR measures market volatility by averaging true ranges over a
 * period.  The true range is defined as the greatest of:
 *   1. high - low
 *   2. abs(high - previousClose)
 *   3. abs(low - previousClose)
 *
 * Note: this project's price history is tick-level (one price per
 * observation, no OHLC candles -- see price-history.ts), not real bar data.
 * Callers without genuine high/low series should pass the same closing-price
 * array for all three parameters; the true range then degenerates to
 * abs(close[i] - close[i-1]), making this "average absolute price change"
 * rather than textbook OHLC ATR. That's an honest simplification worth
 * naming rather than fabricating high/low data that was never observed.
 *
 * @param high – array of high prices
 * @param low – array of low prices
 * @param close – array of close prices
 * @param period – lookback period (default 14)
 * @returns an array of ATR values
 */
export function atr(high: number[], low: number[], close: number[], period = 14): number[] {
  const tr: number[] = [];
  for (let i = 0; i < high.length; i++) {
    if (i === 0) {
      tr.push(high[i] - low[i]);
    } else {
      const a = high[i] - low[i];
      const b = Math.abs(high[i] - close[i - 1]);
      const c = Math.abs(low[i] - close[i - 1]);
      tr.push(Math.max(a, b, c));
    }
  }
  const out: number[] = [];
  // Calculate first ATR as simple average of true range over the period
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  out[period - 1] = sum / period;
  // Subsequent ATR values use exponential smoothing
  for (let i = period; i < tr.length; i++) {
    out[i] = (out[i - 1] * (period - 1) + tr[i]) / period;
  }
  return out;
}

/**
 * Fisher Transform of a price series over a rolling lookback window.
 * Normalizes price position within its recent high/low range into
 * [-1, 1], then applies the inverse hyperbolic tangent transform, which
 * sharpens turning points relative to a raw price series -- large swings
 * in the Fisher value tend to precede or coincide with price reversals.
 *
 * Ported from the math in the (dead, unused) Replit reference app's
 * technical-analysis.ts -- deliberately excluding that file's confidence
 * scoring, which is what's actually wrong with it (see REPLIT_REPOSITORY_AUDIT.md, H-3).
 *
 * @param series – closing prices
 * @param period – lookback window for the high/low range (default 10)
 * @returns Fisher Transform values; the first `period - 1` entries are NaN
 */
export function fisherTransform(series: number[], period = 10): number[] {
  const out: number[] = new Array(series.length).fill(NaN);
  let prevValue = 0;
  let prevFisher = 0;

  for (let i = period - 1; i < series.length; i++) {
    const window = series.slice(i - period + 1, i + 1);
    const high = Math.max(...window);
    const low = Math.min(...window);
    const range = high - low;

    const rawPosition = range === 0 ? 0 : (2 * ((series[i] - low) / range - 0.5));
    let value = 0.33 * rawPosition + 0.67 * prevValue;
    value = Math.max(-0.999, Math.min(0.999, value));

    const fisher = 0.5 * Math.log((1 + value) / (1 - value)) + 0.5 * prevFisher;
    out[i] = fisher;
    prevValue = value;
    prevFisher = fisher;
  }

  return out;
}

/**
 * Average Directional Index -- measures trend *strength* (not direction).
 * Values run roughly 0-100; above ~25 conventionally indicates a
 * meaningfully trending market, below suggests a range-bound one.
 *
 * This is the price-only variant: real ADX uses high/low directional
 * movement, which this tick-level dataset doesn't have (see the ATR note
 * above for why). Directional movement here is derived from period-over-
 * period price change instead, which is a reasonable degeneracy of the
 * same idea, not the textbook OHLC formula -- named as such rather than
 * dressed up as the real thing.
 *
 * @param series – closing prices
 * @param period – smoothing period (default 14)
 * @returns ADX values; early entries are NaN until enough data has smoothed
 */
export function adx(series: number[], period = 14): number[] {
  const out: number[] = new Array(series.length).fill(NaN);
  if (series.length < period * 2) return out;

  const plusDm: number[] = [0];
  const minusDm: number[] = [0];
  const tr: number[] = [0];
  for (let i = 1; i < series.length; i++) {
    const change = series[i] - series[i - 1];
    plusDm.push(Math.max(change, 0));
    minusDm.push(Math.max(-change, 0));
    tr.push(Math.abs(change));
  }

  const smooth = (values: number[]): number[] => {
    const smoothed: number[] = new Array(values.length).fill(NaN);
    let sum = 0;
    for (let i = 1; i <= period; i++) sum += values[i];
    smoothed[period] = sum;
    for (let i = period + 1; i < values.length; i++) {
      smoothed[i] = smoothed[i - 1] - smoothed[i - 1] / period + values[i];
    }
    return smoothed;
  };

  const smoothedPlusDm = smooth(plusDm);
  const smoothedMinusDm = smooth(minusDm);
  const smoothedTr = smooth(tr);

  const dx: number[] = new Array(series.length).fill(NaN);
  for (let i = period; i < series.length; i++) {
    if (!smoothedTr[i]) continue;
    const plusDi = (100 * smoothedPlusDm[i]) / smoothedTr[i];
    const minusDi = (100 * smoothedMinusDm[i]) / smoothedTr[i];
    const diSum = plusDi + minusDi;
    dx[i] = diSum === 0 ? 0 : (100 * Math.abs(plusDi - minusDi)) / diSum;
  }

  const firstDxIndex = period * 2 - 1;
  if (firstDxIndex >= series.length) return out;
  let adxSum = 0;
  let count = 0;
  for (let i = period; i <= firstDxIndex; i++) {
    if (!isNaN(dx[i])) {
      adxSum += dx[i];
      count += 1;
    }
  }
  if (count === 0) return out;
  out[firstDxIndex] = adxSum / count;
  for (let i = firstDxIndex + 1; i < series.length; i++) {
    out[i] = (out[i - 1] * (period - 1) + dx[i]) / period;
  }

  return out;
}

export interface KeltnerChannel {
  middle: number[];
  upper: number[];
  lower: number[];
}

/**
 * Keltner Channel: an EMA midline with bands offset by a multiple of ATR,
 * used to gauge volatility and breakouts. Wider than the price's recent
 * average true range means the current move is larger than typical.
 *
 * @param series – closing prices
 * @param period – EMA period for the midline (default 20)
 * @param atrPeriod – ATR period for the bands (default 10)
 * @param multiplier – how many ATRs wide the bands are (default 2)
 */
export function keltnerChannel(
  series: number[],
  period = 20,
  atrPeriod = 10,
  multiplier = 2,
): KeltnerChannel {
  const middle = ema(series, period);
  // Tick-level data has no real high/low -- see the ATR degeneracy note above.
  const atrValues = atr(series, series, series, atrPeriod);
  const upper = middle.map((m, i) => m + multiplier * (atrValues[i] ?? 0));
  const lower = middle.map((m, i) => m - multiplier * (atrValues[i] ?? 0));
  return { middle, upper, lower };
}
