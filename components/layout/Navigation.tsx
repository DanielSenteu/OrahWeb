'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import './Navigation.css'

// Only Courses and Schedule live in the pill — everything else in the drawer
const navItems = [
  {
    href: '/courses',
    label: 'Courses',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    href: '/schedule',
    label: 'Schedule',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
]

const drawerItems = [
  {
    href: '/courses',
    label: 'Courses',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    href: '/schedule',
    label: 'Schedule',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href: '/goals',
    label: 'Goals',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    ),
  },
  {
    href: '/assistant',
    label: 'Orah AI',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    href: '/lecture-notes',
    label: 'Lecture Notes',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    href: '/exam-prep',
    label: 'Exam Prep',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    ),
  },
  {
    href: '/assignment-helper',
    label: 'Assignment Helper',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
  },
  {
    href: '/semester-tracking',
    label: 'Semester',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
]

export default function Navigation() {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  // Prevent body scroll when drawer open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  const currentPage = [...navItems, ...drawerItems].find(i => i.href === pathname)

  return (
    <>
      {/* ── Floating Pill ── Desktop */}
      <nav className={`pill-nav ${scrolled ? 'pill-nav--scrolled' : ''}`}>
        <div className="pill-inner">
          {/* Logo */}
          <Link href="/" className="pill-logo">
            <span className="pill-logo-text">ORAH</span>
          </Link>

          <div className="pill-divider" />

          {/* Nav items */}
          <div className="pill-items">
            {navItems.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`pill-item ${active ? 'pill-item--active' : ''}`}
                  title={item.label}
                >
                  <span className="pill-item-icon">{item.icon}</span>
                  <span className="pill-item-label">{item.label}</span>
                </Link>
              )
            })}
          </div>

          <div className="pill-divider" />

          {/* Drawer trigger */}
          <button
            className="pill-menu-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="15" y2="18" />
            </svg>
          </button>
        </div>
      </nav>

      {/* ── Mobile Bottom Tab Bar ── */}
      <nav className="mobile-tabs">
        {navItems.map((item) => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-tab ${active ? 'mobile-tab--active' : ''}`}
            >
              <span className="mobile-tab-icon">{item.icon}</span>
              <span className="mobile-tab-label">{item.label}</span>
            </Link>
          )
        })}
        <button
          className="mobile-tab"
          onClick={() => setDrawerOpen(true)}
          aria-label="More"
        >
          <span className="mobile-tab-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <span className="mobile-tab-label">More</span>
        </button>
      </nav>

      {/* ── Slide-out Drawer ── */}
      {drawerOpen && (
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            {/* Drawer header */}
            <div className="drawer-header">
              <Link href="/" className="drawer-logo" onClick={() => setDrawerOpen(false)}>
                ORAH
              </Link>
              <button
                className="drawer-close"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* All items */}
            <div className="drawer-section-label">Navigation</div>
            <div className="drawer-items">
              {drawerItems.map((item) => {
                const active = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`drawer-item ${active ? 'drawer-item--active' : ''}`}
                    onClick={() => setDrawerOpen(false)}
                  >
                    <span className="drawer-item-icon">{item.icon}</span>
                    <span className="drawer-item-label">{item.label}</span>
                    {active && <span className="drawer-item-dot" />}
                  </Link>
                )
              })}
            </div>

            {/* Drawer footer */}
            <div className="drawer-footer">
              <p className="drawer-footer-text">Orah — Your Academic AI</p>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
