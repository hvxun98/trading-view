/**
 * Backtest chiến lược trên dữ liệu thật:
 *   npm run backtest -- --strategy breakout-m15 --symbol XAUUSD --days 60
 *   npm run backtest -- --days 30                       (mọi chiến lược × mã trong config)
 *   npm run backtest -- --strategy x --input bars.json  (dữ liệu có sẵn: { "15m": [...], "1h": [...] })
 * Tuỳ chọn: --levels entry,watch  --hold 100  --json ket-qua.json
 * Vàng / bạc dùng OANDA nếu có biến môi trường OANDA_TOKEN, không thì Dukascopy.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { backtest, type BacktestResult } from '../src/backtest'
import { STRATEGIES, SYMBOLS } from '../src/config'
import { fetchHistory } from '../src/data/history'
import { requiredTimeframes } from '../src/engine/evaluate'
import { TF_LABEL, TF_SECONDS } from '../src/engine/timeframes'
import type { Env } from '../src/env'
import type { Bar, SignalLevel, SymbolId, Timeframe } from '../src/types'

const args = new Map<string, string>()
process.argv.slice(2).forEach((a, i, all) => a.startsWith('--') && args.set(a.slice(2), all[i + 1] ?? ''))

const days = Number(args.get('days') ?? 60)
const levels = (args.get('levels') ?? 'entry').split(',') as SignalLevel[]
const hold = Number(args.get('hold') ?? 100)
const strategies = STRATEGIES.filter((s) => !args.has('strategy') || s.id === args.get('strategy'))
if (!strategies.length) {
  console.error(`Không có chiến lược "${args.get('strategy')}". Có: ${STRATEGIES.map((s) => s.id).join(', ')}`)
  process.exit(1)
}
const env = process.env as unknown as Env
const input = args.has('input')
  ? (JSON.parse(readFileSync(args.get('input')!, 'utf8')) as Partial<Record<Timeframe, Bar[]>>)
  : null

const pct = (v: number) => `${(v * 100).toFixed(1)}%`
const fmtTime = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ')
const report: { strategy: string; symbol: string; source: string; result: BacktestResult }[] = []

for (const strategy of strategies) {
  const symbols = (args.has('symbol') ? [args.get('symbol')] : strategy.symbols) as SymbolId[]
  for (const symbol of symbols) {
    const to = Math.floor(Date.now() / 1000)
    let history: Partial<Record<Timeframe, Bar[]>> = {}
    let source = 'input'
    if (input) history = input
    else {
      // Lấy thêm 300 nến trước khoảng test để chỉ báo (EMA200…) kịp hội tụ
      for (const tf of requiredTimeframes(strategy)) {
        const from = to - days * 86400 - 300 * TF_SECONDS[tf]
        process.stdout.write(`Đang tải ${symbol} ${TF_LABEL[tf]}… `)
        const r = await fetchHistory(symbol, tf, from, to, env)
        history[tf] = r.bars
        source = r.source
        console.log(`${r.bars.length} nến (${r.source})`)
      }
    }
    const result = backtest(strategy, symbol, history, {
      levels,
      maxHoldBars: hold,
      precision: SYMBOLS[symbol].precision,
    })
    report.push({ strategy: strategy.id, symbol, source, result })
    const s = result.stats
    console.log(`\n== ${strategy.name} · ${symbol} · ${TF_LABEL[strategy.timeframe]} · ${source}`)
    console.log(
      `Lệnh: ${s.signals} | Thắng (TP1): ${s.wins} | Thua (SL): ${s.losses} | Chưa đóng: ${s.open} | Tỉ lệ thắng: ${pct(s.winRate)}`,
    )
    console.log(
      `Tổng: ${s.totalR.toFixed(2)}R | TB mỗi lệnh: ${s.avgR.toFixed(2)}R | Chạm TP cuối: ${pct(s.finalTpRate)} | Thua liên tiếp tối đa: ${s.maxLosingStreak}`,
    )
    for (const t of result.trades.slice(-10)) {
      const sig = t.signal
      console.log(
        `  ${fmtTime(sig.barTime)} ${sig.side === 'long' ? 'BUY ' : 'SELL'} ${sig.entry} SL ${sig.sl} TP ${sig.tp.join('/')} ` +
          `(${sig.score}/${sig.total}) -> ${t.outcome.toUpperCase()} ${t.r >= 0 ? '+' : ''}${t.r.toFixed(2)}R`,
      )
    }
  }
}

if (args.has('json')) {
  writeFileSync(args.get('json')!, JSON.stringify(report, null, 2))
  console.log(`\nĐã ghi ${args.get('json')}`)
}
