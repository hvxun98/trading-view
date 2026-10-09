import type { Session, Timeframe } from '../types'

export const TF_SECONDS: Record<Timeframe, number> = {
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
}

export const TF_LABEL: Record<Timeframe, string> = {
  '5m': 'M5',
  '15m': 'M15',
  '30m': 'M30',
  '1h': 'H1',
  '4h': 'H4',
  '1d': 'D1',
}

/** Giờ UTC [bắt đầu, kết thúc) của các phiên (xấp xỉ, gồm giờ chồng phiên) */
export const SESSIONS: Record<Session, [number, number]> = {
  asia: [0, 8],
  london: [7, 16],
  newyork: [12, 21],
}

export function inSessions(time: number, sessions: Session[] | undefined): boolean {
  if (!sessions?.length) return true
  const hour = new Date(time * 1000).getUTCHours()
  return sessions.some((s) => hour >= SESSIONS[s][0] && hour < SESSIONS[s][1])
}

/** Thời điểm mở của nến đã đóng gần nhất tại `now` (giây) */
export function lastClosedOpen(now: number, tf: Timeframe): number {
  const s = TF_SECONDS[tf]
  return Math.floor(now / s) * s - s
}
