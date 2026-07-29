import { NavLink } from 'react-router-dom'
import { cx } from './ui'

const TABS = [
  { to: '/', label: 'Home', icon: '🏠', end: true },
  { to: '/plan', label: 'Plan', icon: '📅', end: false },
  { to: '/track', label: 'Track', icon: '▶', end: false, primary: true },
  { to: '/history', label: 'History', icon: '📋', end: false },
  { to: '/trends', label: 'Trends', icon: '📈', end: false },
]

export function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-lg border-t border-slate-200 bg-white/95 backdrop-blur safe-bottom dark:border-slate-800 dark:bg-slate-900/95">
      <ul className="flex items-stretch justify-around">
        {TABS.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cx(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition',
                  isActive
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-slate-500 dark:text-slate-400',
                )
              }
            >
              <span
                className={cx(
                  'text-lg leading-none',
                  tab.primary &&
                    'flex size-9 items-center justify-center rounded-full bg-brand-600 text-sm text-white',
                )}
                aria-hidden
              >
                {tab.icon}
              </span>
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
