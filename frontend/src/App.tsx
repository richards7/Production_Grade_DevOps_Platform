import { useEffect, useState } from 'react'
import { getStudents, addStudent, Student } from './api'

// A deliberately simple page: fetch students on load, show them in a list,
// and let you add a new one. This exists to PROVE the frontend can talk to
// the backend — not to be a polished product.
function App() {
  const [students, setStudents] = useState<Student[]>([])
  const [name, setName] = useState('')
  const [course, setCourse] = useState('')
  const [error, setError] = useState('')

  const loadStudents = () => {
    getStudents()
      .then(setStudents)
      .catch(() => setError('Could not reach backend. Is it running?'))
  }

  useEffect(() => {
    loadStudents()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !course) return
    await addStudent({ name, course })
    setName('')
    setCourse('')
    loadStudents()
  }

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 500, margin: '40px auto' }}>
      <h1>Students - CI/CD - webhook - test !</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ marginRight: 8 }}
        />
        <input
          placeholder="Course"
          value={course}
          onChange={(e) => setCourse(e.target.value)}
          style={{ marginRight: 8 }}
        />
        <button type="submit">Add</button>
      </form>

      <ul>
        {students.map((s) => (
          <li key={s.id}>
            {s.name} — {s.course}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default App
