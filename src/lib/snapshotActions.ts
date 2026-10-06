import { showToast } from './toast'
import { translate } from '../i18n'
import { useAppStore } from '../store/useAppStore'
import { copySnapshot, downloadSnapshot } from './snapshot'

const t = (key: Parameters<typeof translate>[1]) => translate(useAppStore.getState().language, key)

/** Chép ảnh biểu đồ đang chọn vào bộ nhớ tạm và báo kết quả (gọi trong sự kiện phím / click) */
export async function copyChartImage() {
  const result = await copySnapshot()
  if (result === 'copied') showToast(t('snapshot.copied'))
  else if (result === 'downloaded') showToast(t('snapshot.downloadedInstead'), 'error')
  else showToast(t('snapshot.failed'), 'error')
}

/** Tải ảnh biểu đồ đang chọn xuống máy */
export async function downloadChartImage() {
  if (await downloadSnapshot()) showToast(t('snapshot.downloaded'))
  else showToast(t('snapshot.failed'), 'error')
}
