import { useState, useEffect } from 'react'

function App() {
  const [data, setData] = useState("Loading backend data...")

  useEffect(() => {
    // Uses the environment variable injected by Vite
    console.log(import.meta.env.VITE_API_BASE_URL)
    const apiUrl = `${import.meta.env.VITE_API_BASE_URL || '/api'}/`

    fetch(apiUrl)
      .then(res => res.json())
      .then(result => setData(JSON.stringify(result, null, 2)))
      .catch(err => setData("Error connecting to backend: " + err.message))
  }, [])

  return (
    <div style={{ padding: "20px", fontFamily: "monospace" }}>
      <h2>Game Challenge - Backend Connection Test</h2>
      <pre>{data}</pre>
    </div>
  )
}

export default App