/** Tách màu CSS (#rgb, #rrggbb, rgb(), rgba()) thành hex + độ đục 0..1 */
export function parseColor(color: string): { hex: string; alpha: number } {
  const c = color.trim()
  const rgba = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i)
  if (rgba) {
    const hex = [rgba[1], rgba[2], rgba[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')
    return { hex: `#${hex}`, alpha: rgba[4] === undefined ? 1 : Number(rgba[4]) }
  }
  if (/^#[0-9a-f]{3}$/i.test(c)) return { hex: `#${[...c.slice(1)].map((x) => x + x).join('')}`.toLowerCase(), alpha: 1 }
  return { hex: c.toLowerCase(), alpha: 1 }
}

/** Màu hex + độ đục -> hex (đục hoàn toàn) hoặc rgba() */
export function withAlpha(hex: string, alpha: number): string {
  if (alpha >= 1) return hex
  const n = parseInt(hex.slice(1), 16)
  const a = Math.round(Math.max(0, alpha) * 100) / 100
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}
