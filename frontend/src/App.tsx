import '@fontsource/atkinson-hyperlegible-next/latin-400.css'
import '@fontsource/atkinson-hyperlegible-next/latin-700.css'
import '@fontsource/fraunces/latin-600.css'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import { AppRouter } from './app/AppRouter'
import { PasswordGate } from './app/PasswordGate'
import { AppErrorBoundary } from './shared/components/AppErrorBoundary'
import './App.css'

function App() {
  return (
    <AppErrorBoundary>
      <PasswordGate>
        <AppRouter />
      </PasswordGate>
    </AppErrorBoundary>
  )
}

export default App
