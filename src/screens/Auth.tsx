import { useState } from 'react'
import { useAuth } from '../state/AuthContext'
import { Button, Card } from '../components/ui'

export function Auth() {
  const { signUp, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: authError } = isSignUp
      ? await signUp(email, password)
      : await signIn(email, password)

    if (authError) {
      setError(authError.message)
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-4 dark:bg-[#0F1419]">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white">Runny</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {isSignUp ? 'Create an account to get started' : 'Sign in to your account'}
          </p>
        </div>

        <Card className="dark:bg-[#1A1F2E]">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 dark:border-slate-600 dark:bg-[#252B3A] dark:text-white"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 dark:border-slate-600 dark:bg-[#252B3A] dark:text-white"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-200">
                {error}
              </div>
            )}

            <Button size="lg" full disabled={loading} type="submit">
              {loading ? 'Loading…' : isSignUp ? 'Sign Up' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-4 border-t border-slate-200 pt-4 text-center dark:border-slate-700">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp)
                setError(null)
              }}
              className="text-sm text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
            >
              {isSignUp
                ? 'Already have an account? Sign in'
                : "Don't have an account? Sign up"}
            </button>
          </div>
        </Card>
      </div>
    </div>
  )
}
