import { Chart } from './components/Chart'
import { ReplayBar } from './components/ReplayBar'
import { TopToolbar } from './components/TopToolbar'
import { Watchlist } from './components/Watchlist'

export default function App() {
  return (
    <div className="app">
      <TopToolbar />
      <main className="main">
        <div className="chart-area">
          <Chart />
          <ReplayBar />
        </div>
        <Watchlist />
      </main>
    </div>
  )
}
