'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navigation from '@/components/layout/Navigation'
import toast from 'react-hot-toast'
import './new-course.css'

export default function NewCoursePage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    course_name: '',
    professor_name: '',
    semester: '',
    year: new Date().getFullYear(),
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.course_name.trim()) {
      toast.error('Course name is required')
      return
    }

    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Determine semester if not provided
      let semester = formData.semester
      if (!semester) {
        const month = new Date().getMonth()
        if (month >= 0 && month <= 4) {
          semester = 'Spring'
        } else if (month >= 5 && month <= 7) {
          semester = 'Summer'
        } else {
          semester = 'Fall'
        }
      }

      const { data, error } = await supabase
        .from('courses')
        .insert({
          user_id: user.id,
          course_name: formData.course_name.trim(),
          professor_name: formData.professor_name.trim() || null,
          semester: semester || null,
          year: formData.year || null,
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating course:', error)
        toast.error(error.message || 'Failed to create course')
        setLoading(false)
        return
      }

      toast.success('Course created successfully!')
      
      // Redirect to syllabus upload page
      router.push(`/courses/${data.id}/syllabus`)
    } catch (error: any) {
      console.error('Error creating course:', error)
      toast.error('Failed to create course. Please try again.')
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }))
  }

  return (
    <>
      <Navigation />
      <div className="new-course-container">
        <div className="new-course-card">
          <div className="new-course-header">
            <button
              onClick={() => router.back()}
              className="back-button"
              aria-label="Go back"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
            <h1 className="new-course-title">Add New Course</h1>
            <p className="new-course-subtitle">
              Create a new course to organize your lectures, assignments, and exams
            </p>
          </div>

          <form onSubmit={handleSubmit} className="new-course-form">
            <div className="form-group">
              <label htmlFor="course_name" className="form-label">
                Course Name <span className="required">*</span>
              </label>
              <input
                type="text"
                id="course_name"
                name="course_name"
                value={formData.course_name}
                onChange={handleChange}
                placeholder="e.g., Introduction to Computer Science"
                className="form-input"
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="professor_name" className="form-label">
                Professor Name <span className="optional">(optional)</span>
              </label>
              <input
                type="text"
                id="professor_name"
                name="professor_name"
                value={formData.professor_name}
                onChange={handleChange}
                placeholder="e.g., Dr. Smith"
                className="form-input"
                disabled={loading}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="semester" className="form-label">
                  Semester <span className="optional">(optional)</span>
                </label>
                <select
                  id="semester"
                  name="semester"
                  value={formData.semester}
                  onChange={handleChange}
                  className="form-input"
                  disabled={loading}
                >
                  <option value="">Auto-detect</option>
                  <option value="Fall">Fall</option>
                  <option value="Spring">Spring</option>
                  <option value="Summer">Summer</option>
                  <option value="Winter">Winter</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="year" className="form-label">
                  Year <span className="optional">(optional)</span>
                </label>
                <input
                  type="number"
                  id="year"
                  name="year"
                  value={formData.year}
                  onChange={handleChange}
                  min="2020"
                  max="2030"
                  className="form-input"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="form-actions">
              <button
                type="button"
                onClick={() => router.back()}
                className="btn-secondary"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={loading || !formData.course_name.trim()}
              >
                {loading ? 'Creating...' : 'Create Course'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
