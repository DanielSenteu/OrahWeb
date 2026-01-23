'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import './Navigation.css'

export default function Navigation() {
  const pathname = usePathname()

  const navItems = [
    { href: '/lecture-notes', label: 'Notes', icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    )},
    { href: '/goals', label: 'Goals', icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    )},
    { href: '/schedule', label: 'Schedule', icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    )},
    { href: '/assistant', label: 'Orah', icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    )},
    { href: '/dashboard', label: 'Dashboard', icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7"/>
        <rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/>
      </svg>
    )},
  ]

  return (
    <>
      {/* Top Navigation - Desktop Only */}
      <nav className="top-nav">
        <div className="nav-container">
          <Link href="/" className="logo">ORAH</Link>
          <div className="nav-tabs">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-tab ${pathname === item.href ? 'active' : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* Bottom Navigation - Mobile Only */}
      <nav className="bottom-nav">
        <div className="bottom-nav-container">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`bottom-nav-item ${pathname === item.href ? 'active' : ''}`}
            >
              <div className="bottom-nav-icon">{item.icon}</div>
              <span className="bottom-nav-label">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  )
}
