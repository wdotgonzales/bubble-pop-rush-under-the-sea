import { useState, useEffect } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

async function fetchHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`)
    const body = await res.json().catch(() => ({}))
    return {
      status: res.ok ? 'ok' : 'error',
      data: `HTTP ${res.status}\n${JSON.stringify(body, null, 2)}`,
    }
  } catch (err) {
    return { status: 'error', data: 'Error connecting to backend: ' + err.message }
  }
}

function App() {
  const [result, setResult] = useState({ status: 'loading', data: 'Checking backend...' })

  const recheck = () => {
    setResult({ status: 'loading', data: 'Checking backend...' })
    fetchHealth().then(setResult)
  }

  useEffect(() => {
    let active = true
    fetchHealth().then((r) => {
      if (active) setResult(r)
    })
    return () => {
      active = false
    }
  }, [])

  const color = result.status === 'ok' ? 'green' : result.status === 'error' ? 'crimson' : 'gray'

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h2>Game Challenge - Backend Connection Test</h2>
      <p>
        GET <code>{API_BASE}/health</code>:{' '}
        <strong style={{ color }}>{result.status}</strong>
      </p>
      <pre>{result.data}</pre>
      <button onClick={recheck}>Check again</button>
    </div>
  )
}

export default App