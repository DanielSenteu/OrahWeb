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
    { href: '/lecture-notes', label: 'Lecture Notes', icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 20h9"/>
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
    )},
    { href: '/assistant', label: 'Orah AI', icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
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
                className={`nav-tab ${pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href)) ? 'active' : ''}`}
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
                  className={`mobile-menu-item ${pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href)) ? 'active' : ''}`}
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
              className={`bottom-nav-item ${pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href)) ? 'active' : ''}`}
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
