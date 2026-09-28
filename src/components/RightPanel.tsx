import { useState } from 'react'
import { useChartStore } from '../store/useChartStore'
import { ObjectTree } from './ObjectTree'
import { Watchlist } from './Watchlist'

type Tab = 'watchlist' | 'objects'

export function RightPanel() {
  const [tab, setTab] = useState<Tab>('watchlist')
  const count = useChartStore((s) => s.drawings[s.symbol]?.length ?? 0)

  return (
    <aside className="right-panel">
      <div className="panel-tabs">
        <button className={`panel-tab ${tab === 'watchlist' ? 'active' : ''}`} onClick={() => setTab('watchlist')}>
          Watchlist
        </button>
        <button className={`panel-tab ${tab === 'objects' ? 'active' : ''}`} onClick={() => setTab('objects')}>
          Object Tree{count > 0 && <span className="panel-badge">{count}</span>}
        </button>
      </div>
      {/* Giữ Watchlist luôn mounted để không phải kết nối lại WebSocket khi đổi tab */}
      <div className="panel-body" hidden={tab !== 'watchlist'}>
        <Watchlist />
      </div>
      {tab === 'objects' && (
        <div className="panel-body">
          <ObjectTree />
        </div>
      )}
    </aside>
  )
}
