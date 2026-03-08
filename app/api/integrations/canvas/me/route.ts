import { NextResponse } from 'next/server'

type CanvasSession = {
  canvasBaseUrl: string
  accessToken: string
}

function readSession(req: Request): CanvasSession | null {
  const cookieHeader = req.headers.get('cookie')
  const raw = cookieHeader
    ?.split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith('canvas_oauth_session='))
    ?.split('=')[1]

  if (!raw) return null

  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as CanvasSession
    if (!parsed.accessToken || !parsed.canvasBaseUrl) return null
    return parsed
  } catch {
    return null
  }
}

async function fetchCanvas<T>(baseUrl: string, accessToken: string, path: string): Promise<T | null> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  return (await res.json()) as T
}

export async function GET(req: Request) {
  const session = readSession(req)
  if (!session) {
    return NextResponse.json({ error: 'Not connected to Canvas.' }, { status: 401 })
  }

  const [profile, courses, enrollments, folders] = await Promise.all([
    fetchCanvas(session.canvasBaseUrl, session.accessToken, '/api/v1/users/self/profile'),
    fetchCanvas(session.canvasBaseUrl, session.accessToken, '/api/v1/courses?enrollment_state=active&per_page=10'),
    fetchCanvas(session.canvasBaseUrl, session.accessToken, '/api/v1/users/self/enrollments?state=active&per_page=10'),
    fetchCanvas(session.canvasBaseUrl, session.accessToken, '/api/v1/users/self/folders?per_page=10'),
  ])

  // Best-effort previews of assignments/quizzes/files/grades from first visible course.
  const firstCourseId = Array.isArray(courses) && courses.length > 0 ? courses[0]?.id : null

  const [assignments, quizzes, files] = firstCourseId
    ? await Promise.all([
        fetchCanvas(session.canvasBaseUrl, session.accessToken, `/api/v1/courses/${firstCourseId}/assignments?per_page=10`),
        fetchCanvas(session.canvasBaseUrl, session.accessToken, `/api/v1/courses/${firstCourseId}/quizzes?per_page=10`),
        fetchCanvas(session.canvasBaseUrl, session.accessToken, `/api/v1/courses/${firstCourseId}/files?per_page=10`),
      ])
    : [null, null, null]

  return NextResponse.json({
    profile,
    courses,
    enrollments,
    folders,
    assignments,
    quizzes,
    files,
    sampledCourseId: firstCourseId,
  })
}
