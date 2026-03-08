export const CANVAS_REQUIRED_SCOPES = [
  'url:GET|/api/v1/users/self/profile',
  'url:GET|/api/v1/courses',
  'url:GET|/api/v1/courses/:course_id/assignments',
  'url:GET|/api/v1/courses/:course_id/quizzes',
  'url:GET|/api/v1/courses/:course_id/files',
  'url:GET|/api/v1/courses/:course_id/enrollments',
  'url:GET|/api/v1/users/self/files',
] as const

export type CanvasIntent = 'login' | 'signup' | 'connect'

export type CanvasEndpointInfo = {
  name: string
  method: 'GET'
  path: string
  purpose: string
}

export const CANVAS_ENDPOINT_REFERENCE: CanvasEndpointInfo[] = [
  {
    name: 'User Profile',
    method: 'GET',
    path: '/api/v1/users/self/profile',
    purpose: 'Identity basics (name, email when available, avatar)',
  },
  {
    name: 'Courses',
    method: 'GET',
    path: '/api/v1/courses',
    purpose: 'All enrolled courses and course metadata',
  },
  {
    name: 'Assignments',
    method: 'GET',
    path: '/api/v1/courses/:course_id/assignments',
    purpose: 'Assignment names, due dates, submission requirements, points',
  },
  {
    name: 'Quizzes / Exams',
    method: 'GET',
    path: '/api/v1/courses/:course_id/quizzes',
    purpose: 'Quiz/exam windows, due dates, metadata',
  },
  {
    name: 'Files',
    method: 'GET',
    path: '/api/v1/courses/:course_id/files',
    purpose: 'Course file catalog and downloadable resources',
  },
  {
    name: 'Enrollments / Grades',
    method: 'GET',
    path: '/api/v1/courses/:course_id/enrollments',
    purpose: 'Current score, grade, enrollment state (permission dependent)',
  },
]

export function normalizeCanvasBaseUrl(input: string): string | null {
  if (!input) return null
  let value = input.trim()
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`
  }

  try {
    const parsed = new URL(value)
    if (!parsed.hostname) return null
    parsed.pathname = ''
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export function getAppBaseUrl(requestUrl: URL): string {
  return process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin
}
