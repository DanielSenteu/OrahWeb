'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import './Navigation.css'

export default function Navigation() {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navItems = [
    { href: '/courses', label: 'Courses', icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
    )},
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

  const closeMenu = () => setMobileMenuOpen(false)

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

      {/* Mobile Header with Hamburger - Mobile Only */}
      <nav className="mobile-header">
        <div className="mobile-header-container">
          <Link href="/" className="mobile-logo">ORAH</Link>
          <button 
            className="hamburger-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <span className={`hamburger-line ${mobileMenuOpen ? 'open' : ''}`}></span>
            <span className={`hamburger-line ${mobileMenuOpen ? 'open' : ''}`}></span>
            <span className={`hamburger-line ${mobileMenuOpen ? 'open' : ''}`}></span>
          </button>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="mobile-menu-overlay" onClick={closeMenu}>
          <div className="mobile-menu" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-menu-header">
              <Link href="/" className="mobile-menu-logo" onClick={closeMenu}>ORAH</Link>
              <button className="mobile-menu-close" onClick={closeMenu} aria-label="Close menu">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="mobile-menu-items">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`mobile-menu-item ${pathname === item.href ? 'active' : ''}`}
                  onClick={closeMenu}
                >
                  <div className="mobile-menu-icon">{item.icon}</div>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

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
