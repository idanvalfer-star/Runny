import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function cx(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(' ')
}

export function Card({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cx(
        'rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70',
        'dark:bg-[#1A1F2E] dark:ring-slate-700',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between px-1">
      <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {children}
      </h2>
      {action}
    </div>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'md' | 'lg'
  full?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  full,
  className,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500'
  const variants = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600',
    secondary:
      'bg-slate-200 text-slate-900 hover:bg-slate-300 dark:bg-[#252B3A] dark:text-slate-100 dark:hover:bg-[#2F3649]',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost:
      'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-[#252B3A]',
  }
  // 44px minimum height: these get tapped mid-stride, one-handed.
  const sizes = { md: 'min-h-11 px-4 text-base', lg: 'min-h-14 px-6 text-lg' }
  return (
    <button
      className={cx(base, variants[variant], sizes[size], full && 'w-full', className)}
      {...props}
    />
  )
}

export function Metric({
  label,
  value,
  unit,
  size = 'md',
  accent,
}: {
  label: string
  value: string
  unit?: string
  size?: 'md' | 'lg' | 'xl'
  accent?: boolean
}) {
  const valueSize = {
    md: 'text-2xl',
    lg: 'text-4xl',
    xl: 'text-6xl',
  }[size]
  return (
    <div className="flex flex-col">
      <span className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {label}
      </span>
      <span
        className={cx(
          'tnum leading-tight font-bold',
          valueSize,
          accent && 'text-brand-600 dark:text-brand-400',
        )}
      >
        {value}
        {unit && (
          <span className="ml-1 text-base font-medium text-slate-500 dark:text-slate-400">
            {unit}
          </span>
        )}
      </span>
    </div>
  )
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="max-w-xs text-sm text-slate-500 dark:text-slate-400">{body}</p>
      {action}
    </div>
  )
}

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'brand' | 'warn' | 'danger'
}) {
  const tones = {
    neutral:
      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    brand: 'bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200',
    warn: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    danger: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  }
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
      )}
    >
      {children}
    </span>
  )
}

/** The medical-guidance boundary, stated plainly wherever it matters. */
export function Disclaimer({ className }: { className?: string }) {
  return (
    <p className={cx('text-xs text-slate-500 dark:text-slate-400', className)}>
      Runny gives fitness guidance based on published training research. It isn't
      medical advice, and it doesn't replace a coach or a doctor.
    </p>
  )
}
