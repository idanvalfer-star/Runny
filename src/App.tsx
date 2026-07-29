import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppProvider, useApp } from './state/AppContext'
import { TabBar } from './components/TabBar'
import { Home } from './screens/Home'
import { Track } from './screens/Track'
import { Onboarding } from './screens/Onboarding'

/**
 * Home and Track load eagerly — starting a run is the one thing that has to be
 * instant, and it must work with no signal. Everything that pulls in Leaflet or
 * Recharts is split out so those libraries never touch the critical path.
 */
const ActivitySummary = lazy(() =>
  import('./screens/ActivitySummary').then((m) => ({ default: m.ActivitySummary })),
)
const History = lazy(() => import('./screens/History').then((m) => ({ default: m.History })))
const Trends = lazy(() => import('./screens/Trends').then((m) => ({ default: m.Trends })))
const PlanScreen = lazy(() => import('./screens/Plan').then((m) => ({ default: m.PlanScreen })))
const PlanDay = lazy(() => import('./screens/PlanDay').then((m) => ({ default: m.PlanDay })))
const Intake = lazy(() => import('./screens/Intake').then((m) => ({ default: m.Intake })))
const SettingsScreen = lazy(() =>
  import('./screens/Settings').then((m) => ({ default: m.SettingsScreen })),
)

/** The tab bar would only get in the way on full-screen flows. */
const CHROMELESS = ['/track', '/onboarding', '/intake']

function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <span className="text-sm text-slate-500">Loading…</span>
    </div>
  )
}

function Shell() {
  const { loading, settings } = useApp()
  const location = useLocation()

  if (loading) return <Loading />

  if (!settings.onboardingComplete && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  const showTabs = !CHROMELESS.some((p) => location.pathname.startsWith(p))

  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      <div className={showTabs ? 'pb-20' : ''}>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/track" element={<Track />} />
            <Route path="/activity/:id" element={<ActivitySummary />} />
            <Route path="/history" element={<History />} />
            <Route path="/trends" element={<Trends />} />
            <Route path="/plan" element={<PlanScreen />} />
            <Route path="/plan/session/:id" element={<PlanDay />} />
            <Route path="/intake" element={<Intake />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
      {showTabs && <TabBar />}
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </AppProvider>
  )
}
