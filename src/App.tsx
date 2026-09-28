import { Chart } from './components/Chart'
import { DrawingToolbar } from './components/DrawingToolbar'
import { ReplayBar } from './components/ReplayBar'
import { RightPanel } from './components/RightPanel'
import { TopToolbar } from './components/TopToolbar'
import { useHotkeys } from './hooks/useHotkeys'

export default function App() {
  useHotkeys()

  return (
    <div className="app">
      <TopToolbar />
      <main className="main">
        <DrawingToolbar />
        <div className="chart-area">
          <Chart />
          <ReplayBar />
        </div>
        <RightPanel />
      </main>
    </div>
  )
}
