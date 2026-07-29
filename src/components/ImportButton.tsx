import { useRef, useState } from 'react'
import { useApp } from '../state/AppContext'
import { parseActivityFile } from '../lib/import'
import { saveActivity } from '../db/repo'
import { Button } from './ui'

export function ImportButton({ onImported }: { onImported: () => void | Promise<void> }) {
  const { profile } = useApp()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    setError(undefined)
    let imported = 0
    for (const file of Array.from(files)) {
      try {
        const text = await file.text()
        const activity = parseActivityFile(
          file.name,
          text,
          'run',
          profile?.weightKg ?? 70,
        )
        if (activity) {
          await saveActivity(activity)
          imported++
        }
      } catch {
        // Keep going: one malformed file shouldn't sink the rest of a batch.
      }
    }
    setBusy(false)
    if (imported === 0) {
      setError('Could not read any activities from that file.')
    } else {
      await onImported()
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={inputRef}
        type="file"
        accept=".gpx,.tcx,.csv,application/gpx+xml,text/csv"
        multiple
        hidden
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <Button
        variant="secondary"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {busy ? 'Importing…' : 'Import'}
      </Button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  )
}
