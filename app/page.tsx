'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { posthog } from '@/lib/posthog'
import './landing.css'

export default function LandingPage() {
  const router = useRouter()
  const floatingCardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Send a test event when landing page loads
    if (typeof window !== 'undefined' && posthog.__loaded) {
      posthog.capture('landing_page_viewed', {
        timestamp: new Date().toISOString(),
      })
    }
  }, [])

  useEffect(() => {
    // 3D tilt effect for floating card
    const floatingCard = floatingCardRef.current
    
    if (floatingCard) {
      const handleMouseMove = (e: MouseEvent) => {
        const rect = floatingCard.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        
        const centerX = rect.width / 2
        const centerY = rect.height / 2
        
        const rotateX = (y - centerY) / 20
        const rotateY = (centerX - x) / 20
        
        floatingCard.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(20px)`
      }
      
      const handleMouseLeave = () => {
        floatingCard.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)'
      }

      floatingCard.addEventListener('mousemove', handleMouseMove)
      floatingCard.addEventListener('mouseleave', handleMouseLeave)
      
      return () => {
        floatingCard.removeEventListener('mousemove', handleMouseMove)
        floatingCard.removeEventListener('mouseleave', handleMouseLeave)
      }
    }
  }, [])

  useEffect(() => {
    // Intersection Observer for fade-in animations
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -100px 0px'
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('fadeInUp')
          observer.unobserve(entry.target)
        }
      })
    }, observerOptions)

    document.querySelectorAll('.feature-card').forEach(card => {
      observer.observe(card)
    })

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    // Task animation on load
    const tasks = document.querySelectorAll('.task-item')
    tasks.forEach((task, index) => {
      const taskEl = task as HTMLElement
      taskEl.style.opacity = '0'
      taskEl.style.transform = 'translateX(-20px)'
      
      setTimeout(() => {
        taskEl.style.transition = 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)'
        taskEl.style.opacity = '1'
        taskEl.style.transform = 'translateX(0)'
      }, 1000 + (index * 100))
    })
  }, [])

  const handleSmoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith('#')) {
      e.preventDefault()
      const target = document.querySelector(href)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }

  return (
    <>
      {/* Background */}
      <div className="noise-bg"></div>
      <div className="grid-overlay"></div>

      {/* Navigation */}
      <nav>
        <div className="nav-container">
          <Link href="/" className="logo-text">ORAH</Link>
          <div className="nav-actions">
            <a href="#features" className="nav-link" onClick={(e) => handleSmoothScroll(e, '#features')}>Features</a>
            <a href="#how-it-works" className="nav-link" onClick={(e) => handleSmoothScroll(e, '#how-it-works')}>How it Works</a>
            <Link href="/login" className="btn btn-secondary">Sign In</Link>
            <Link href="/signup" className="btn btn-primary">
              Get Started Free
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ position: 'relative' }}>
                <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-container">
          <div className="hero-badge">
            <span className="dot"></span>
            AI-Powered Academic Success
          </div>
          
          <h1 className="hero-title">
            Become an<br/>
            <span className="gradient-text">Academic Weapon</span>
          </h1>
          
          <p className="hero-subtitle">
            Transform your syllabi, assignments, and exams into structured daily tasks. 
            ORAH breaks down your semester into achievable actions—no more overwhelm, 
            just consistent progress toward your goals.
          </p>

          <div className="hero-cta">
            <Link href="/signup" className="btn btn-primary">
              Start Planning for Free
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M7 4L13 10L7 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
            <a href="#features" className="btn btn-secondary" onClick={(e) => handleSmoothScroll(e, '#features')}>See How It Works</a>
          </div>

          <div className="hero-stats">
            <div className="stat">
              <div className="stat-value">500+</div>
              <div className="stat-label">Students Crushing Goals</div>
            </div>
            <div className="stat">
              <div className="stat-value">2,000+</div>
              <div className="stat-label">Tasks Completed</div>
            </div>
            <div className="stat">
              <div className="stat-value">92%</div>
              <div className="stat-label">Success Rate</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features" id="features">
        <div className="section-header">
          <div className="section-badge">Everything You Need</div>
          <h2 className="section-title">Four Tools. Infinite Possibilities.</h2>
          <p className="section-description">
            ORAH gives you specialized AI tools for every academic scenario—from managing 
            entire semesters to acing individual assignments and exams.
          </p>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon-wrapper">
              <svg viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <h3 className="feature-title">Semester Tracking</h3>
            <p className="feature-description">
              Upload your syllabus and watch ORAH extract every deadline, assignment, and 
              exam. Get a comprehensive semester-long plan that distributes your workload 
              intelligently across the entire term.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon-wrapper">
              <svg viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <h3 className="feature-title">Assignment Helper</h3>
            <p className="feature-description">
              Got a big assignment due? Upload the details, specify your deadline, and 
              ORAH creates a strategic breakdown. Work steadily toward completion without 
              the last-minute panic.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon-wrapper">
              <svg viewBox="0 0 24 24">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
            </div>
            <h3 className="feature-title">Exam Prep</h3>
            <p className="feature-description">
              Tell ORAH about your exam topics and test date. Receive a personalized study 
              plan optimized with spaced repetition principles to maximize retention and 
              crush your exams.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon-wrapper">
              <svg viewBox="0 0 24 24">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </div>
            <h3 className="feature-title">Lecture Notes</h3>
            <p className="feature-description">
              Paste your lecture transcripts and let ORAH transform them into structured, 
              comprehensive notes. Key concepts organized, definitions highlighted, examples 
              included—review made effortless.
            </p>
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section className="demo-section" id="how-it-works">
        <div className="demo-container">
          <div className="demo-header">
            <div className="demo-badge">See It In Action</div>
            <h2 className="demo-title">This Is What Success Looks Like</h2>
            <p className="demo-description">
              Watch your goals transform into daily wins. Track progress, complete tasks, 
              and build momentum—one day at a time.
            </p>
          </div>

          <div className="floating-card" ref={floatingCardRef}>
            <div className="card-header">
              <div className="card-icon">
                <svg viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <div>
                <div className="card-title">PSYC 101 Final</div>
                <div className="card-subtitle">12 days until exam • Day 4 of 15</div>
              </div>
            </div>

            <div className="progress-section">
              <div className="progress-label">
                <span style={{ color: 'var(--text-secondary)' }}>Study Progress</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>68%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill"></div>
              </div>
            </div>

            <div className="task-list">
              <div className="task-item completed">
                <div className="task-checkbox">
                  <svg viewBox="0 0 12 12">
                    <polyline points="2 6 5 9 10 3"/>
                  </svg>
                </div>
                <div className="task-text">Review cognitive psychology notes</div>
              </div>
              <div className="task-item completed">
                <div className="task-checkbox">
                  <svg viewBox="0 0 12 12">
                    <polyline points="2 6 5 9 10 3"/>
                  </svg>
                </div>
                <div className="task-text">Complete practice quiz 1-3</div>
              </div>
              <div className="task-item">
                <div className="task-checkbox"></div>
                <div className="task-text">Memorize key definitions</div>
              </div>
              <div className="task-item">
                <div className="task-checkbox"></div>
                <div className="task-text">Study group session prep</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="cta-container">
          <h2 className="cta-title">Ready to Level Up Your Grades?</h2>
          <p className="cta-subtitle">
            Join hundreds of students who are transforming their academic performance 
            with AI-powered planning. Start for free today.
          </p>
          <div className="cta-buttons">
            <Link href="/signup" className="btn btn-primary">
              Get Started Free
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M7 4L13 10L7 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
            <a href="#features" className="btn btn-secondary" onClick={(e) => handleSmoothScroll(e, '#features')}>Learn More</a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer>
        <div className="footer-container">
          <div className="footer-text">© 2026 ORAH. All rights reserved.</div>
          <div className="footer-links">
            <Link href="/privacy" className="footer-link">Privacy</Link>
            <Link href="/terms" className="footer-link">Terms</Link>
            <Link href="/contact" className="footer-link">Contact</Link>
          </div>
    </div>
      </footer>
    </>
  )
}
