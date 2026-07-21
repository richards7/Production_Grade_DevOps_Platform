// This file is the ONLY place that knows the backend's URL.
// Keeping it separate means if the backend address changes, you edit one line, not every component.

// When running via docker-compose, the browser still calls localhost — because the API call
// happens in the USER'S BROWSER, not inside the frontend container. So this must be a URL
// reachable from the browser, e.g. localhost:8080 when testing locally.
const API_BASE_URL = 'http://localhost:8080'

export interface Student {
  id?: number
  name: string
  course: string
}

export async function getStudents(): Promise<Student[]> {
  const response = await fetch(`${API_BASE_URL}/students`)
  if (!response.ok) throw new Error('Failed to fetch students')
  return response.json()
}

export async function addStudent(student: Student): Promise<Student> {
  const response = await fetch(`${API_BASE_URL}/students`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(student),
  })
  if (!response.ok) throw new Error('Failed to add student')
  return response.json()
}
