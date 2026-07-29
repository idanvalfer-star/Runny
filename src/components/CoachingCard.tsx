export function CoachingCard({ message }: { message: string }) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 dark:from-brand-600 dark:to-brand-700 p-5 text-white shadow-lg">
      <div className="flex gap-3">
        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-xl">
          🏃
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-white mb-1">Coach Sarah</h3>
          <p className="text-sm text-white/90 leading-relaxed">{message}</p>
        </div>
      </div>
    </div>
  )
}
