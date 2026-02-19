'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import './Navigation.css'

interface Course {
  id: string
  course_name: string
  color: string
}

export default function Navigation() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const [courses, setCourses] = useState<Course[]>([])
  const [mobileOpen, setMobileOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  // Add/remove sidebar body class
  useEffect(() => {
    document.body.classList.add('has-sidebar')
    return () => document.body.classList.remove('has-sidebar')
  }, [])

  useEffect(() => {
    loadCourses()
  }, [])

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const loadCourses = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data } = await supabase
        .from('courses')
        .select('id, course_name, color')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })

      setCourses(data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const activeCourseId = pathname.match(/\/courses\/([^/]+)/)?.[1]

  const SidebarContent = () => (
    <div className="sidebar-inner">
      {/* Logo */}
      <div className="sidebar-logo-row">
        <Link href="/courses" className="sidebar-logo">ORAH</Link>
      </div>

      {/* New course button */}
      <div className="sidebar-new-btn-wrap">
        <Link href="/courses/new" className="sidebar-new-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Course
        </Link>
      </div>

      {/* Courses section */}
      <div className="sidebar-section">
        <p className="sidebar-section-label">Courses</p>

        {loading ? (
          <div className="sidebar-loading">
            <span className="sidebar-loading-dot" />
            <span className="sidebar-loading-dot" />
            <span className="sidebar-loading-dot" />
          </div>
        ) : courses.length === 0 ? (
          <p className="sidebar-empty">No courses yet</p>
        ) : (
          <nav className="sidebar-course-list">
            {courses.map(course => {
              const isActive = activeCourseId === course.id
              return (
                <Link
                  key={course.id}
                  href={`/courses/${course.id}`}
                  className={`sidebar-course-item ${isActive ? 'active' : ''}`}
                >
                  <span
                    className="sidebar-course-dot"
                    style={{ background: course.color || '#4F46E5' }}
                  />
                  <span className="sidebar-course-name">
                    {course.course_name}
                  </span>
                </Link>
              )
            })}
          </nav>
        )}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        <button className="sidebar-signout-btn" onClick={handleSignOut}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sidebar-desktop">
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <header className="mobile-topbar">
        <button
          className="mobile-hamburger"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <Link href="/courses" className="mobile-topbar-logo">ORAH</Link>
        <Link href="/courses/new" className="mobile-topbar-new" aria-label="New course">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </Link>
      </header>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <>
          <div
            className="mobile-overlay"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="sidebar-mobile">
            <button
              className="mobile-close-btn"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <SidebarContent />
          </aside>
        </>
      )}
    </>
  )
}
