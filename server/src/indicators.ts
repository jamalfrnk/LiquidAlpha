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
  // Compute initial RSI
  let rs = avgLoss === 0 ? 0 : avgGain / avgLoss;
  rsi[length] = 100 - 100 / (1 + rs);
  // Iterate through the rest of the series
  for (let i = length + 1; i < series.length; i++) {
    const diff = series[i] - series[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (length - 1) + gain) / length;
    avgLoss = (avgLoss * (length - 1) + loss) / length;
    rs = avgLoss === 0 ? 0 : avgGain / avgLoss;
    rsi[i] = 100 - 100 / (1 + rs);
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
