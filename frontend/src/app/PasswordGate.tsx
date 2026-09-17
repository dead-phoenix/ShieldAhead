import { type FormEvent, type ReactNode, useState } from 'react'
import { Eye, EyeSlash, LockKey } from '@phosphor-icons/react'
import { productConfig, storageKeys } from './config/product'
import './PasswordGate.css'

const SITE_PASSWORD = 'test'

function readUnlocked(): boolean {
  try {
    return window.localStorage.getItem(storageKeys.siteUnlocked) === 'true'
  } catch {
    return false
  }
}

function writeUnlocked() {
  try {
    window.localStorage.setItem(storageKeys.siteUnlocked, 'true')
  } catch {
    // If storage is unavailable the gate just re-appears next load — not fatal.
  }
}

export function PasswordGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(readUnlocked)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(false)

  if (unlocked) return <>{children}</>

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (password === SITE_PASSWORD) {
      writeUnlocked()
      setUnlocked(true)
      return
    }
    setError(true)
  }

  return (
    <div className="password-gate">
      <form className="password-gate__card flow-page" onSubmit={handleSubmit}>
        <div className="welcome-symbol" aria-hidden="true"><LockKey size={32} weight="duotone" /></div>
        <p className="password-gate__eyebrow">Private preview</p>
        <h1>This site is password protected</h1>
        <p className="lead">Enter the site password to continue.</p>
        <div className="field">
          <label htmlFor="site-password">Password</label>
          <div className="password-gate__input-row">
            <input
              id="site-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="off"
              autoFocus
              value={password}
              aria-invalid={error}
              onChange={(event) => {
                setPassword(event.target.value)
                setError(false)
              }}
            />
            <button
              type="button"
              className="password-gate__toggle"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeSlash size={20} /> : <Eye size={20} />}
            </button>
          </div>
          {error ? <p className="field-error" role="alert">Incorrect password, try again.</p> : null}
        </div>
        <button type="submit" className="button button--primary password-gate__submit">Enter</button>
        <p className="password-gate__footer">{productConfig.name}</p>
      </form>
    </div>
  )
}
