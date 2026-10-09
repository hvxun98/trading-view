import { ChartLayout } from './components/ChartLayout'
import { DrawingToolbar } from './components/DrawingToolbar'
import { ReplayBar } from './components/ReplayBar'
import { RightPanel } from './components/RightPanel'
import { TopToolbar } from './components/TopToolbar'
import { Toaster } from './components/Toaster'
import { useDeepLink } from './hooks/useDeepLink'
import { useHotkeys } from './hooks/useHotkeys'

export default function App() {
  useHotkeys()
  useDeepLink()

  return (
    <div className="app">
      <TopToolbar />
      <main className="main">
        <DrawingToolbar />
        <div className="chart-area">
          <ChartLayout />
          <ReplayBar />
        </div>
        <RightPanel />
      </main>
      <Toaster />
    </div>
  )
}
