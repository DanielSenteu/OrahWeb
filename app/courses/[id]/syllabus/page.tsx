'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navigation from '@/components/layout/Navigation'
import toast from 'react-hot-toast'
import './syllabus-upload.css'

interface Course {
  id: string
  course_name: string
  professor_name: string | null
}

export default function SyllabusUploadPage() {
  const router = useRouter()
  const params = useParams()
  const courseId = params.id as string
  const supabase = createClient()
  
  const [course, setCourse] = useState<Course | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [loading, setLoading] = useState(true)

  const MAX_FILES = 3
  const MAX_FILE_SIZE_MB = 10

  useEffect(() => {
    if (courseId) {
      loadCourse()
    }
  }, [courseId])

  const loadCourse = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data, error } = await supabase
        .from('courses')
        .select('id, course_name, professor_name')
        .eq('id', courseId)
        .eq('user_id', user.id)
        .single()

      if (error) {
        console.error('Error loading course:', error)
        router.push('/courses')
        return
      }

      setCourse(data)
      setLoading(false)
    } catch (error) {
      console.error('Error loading course:', error)
      setLoading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    addFiles(selectedFiles)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const droppedFiles = Array.from(e.dataTransfer.files)
    addFiles(droppedFiles)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  const addFiles = (newFiles: File[]) => {
    const validFiles: File[] = []
    const errors: string[] = []

    newFiles.forEach(file => {
      // Check file type
      if (file.type !== 'application/pdf') {
        errors.push(`${file.name} is not a PDF file`)
        return
      }

      // Check file size
      const fileSizeMB = file.size / (1024 * 1024)
      if (fileSizeMB > MAX_FILE_SIZE_MB) {
        errors.push(`${file.name} is too large (max ${MAX_FILE_SIZE_MB}MB)`)
        return
      }

      // Check if we already have this file
      if (files.some(f => f.name === file.name && f.size === file.size)) {
        errors.push(`${file.name} is already added`)
        return
      }

      // Check total file count
      if (files.length + validFiles.length >= MAX_FILES) {
        errors.push(`Maximum ${MAX_FILES} PDFs allowed`)
        return
      }

      validFiles.push(file)
    })

    if (errors.length > 0) {
      errors.forEach(error => toast.error(error))
    }

    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles])
      toast.success(`Added ${validFiles.length} PDF${validFiles.length > 1 ? 's' : ''}`)
    }
  }

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
    toast.success('File removed')
  }

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const extractTextFromPDF = async (base64Pdf: string): Promise<string> => {
    const res = await fetch('/api/pdf/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdf: base64Pdf }),
    })

    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.error || 'Failed to extract text from PDF')
    }

    const data = await res.json()
    return data.text || ''
  }

  const handleSkip = () => {
    router.push(`/courses/${courseId}`)
  }

  const handleSubmit = async () => {
    if (files.length === 0) {
      toast.error('Please upload at least one PDF')
      return
    }

    setExtracting(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Extract text from all PDFs
      const extractedTexts: string[] = []
      const pdfUrls: string[] = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        toast.loading(`Extracting text from ${file.name} (${i + 1}/${files.length})...`, { id: `extract-${i}` })

        // Convert to base64
        const base64Pdf = await fileToBase64(file)

        // Extract text
        const text = await extractTextFromPDF(base64Pdf)
        extractedTexts.push(text)

        // Upload PDF to Storage
        // Structure: {user_id}/{course_id}/syllabus/{timestamp}_{filename}
        const fileName = `${user.id}/${courseId}/syllabus/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('course-documents')
          .upload(fileName, file, {
            contentType: 'application/pdf',
            upsert: false,
          })

        if (uploadError) {
          console.error('Upload error:', uploadError)
          throw new Error(`Failed to upload ${file.name}`)
        }

        pdfUrls.push(fileName)
        toast.success(`Extracted text from ${file.name}`, { id: `extract-${i}` })
      }

      // Combine all extracted texts
      const combinedText = extractedTexts.join('\n\n---\n\n')

      // Update course with syllabus data
      const { error: updateError } = await supabase
        .from('courses')
        .update({
          syllabus_text: combinedText,
          syllabus_file_url: pdfUrls[0], // Store first PDF URL as primary
          syllabus_data: {
            pdf_count: pdfUrls.length,
            pdf_urls: pdfUrls,
            extracted_at: new Date().toISOString(),
          },
        })
        .eq('id', courseId)
        .eq('user_id', user.id)

      if (updateError) {
        console.error('Error updating course:', updateError)
        throw new Error('Failed to save syllabus')
      }

      toast.success('Syllabus uploaded and processed successfully!')
      
      // Extract lectures, assignments, and exams from syllabus
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          await fetch('/api/courses/extract-syllabus-items', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              courseId,
              syllabusText: combinedText,
            }),
          })
        }
      } catch (extractError) {
        console.error('Error extracting syllabus items:', extractError)
        // Non-fatal, continue with redirect
      }
      
      // Redirect to semester plan setup
      router.push(`/courses/${courseId}/semester-plan`)
    } catch (error: any) {
      console.error('Error processing syllabus:', error)
      toast.error(error.message || 'Failed to process syllabus')
      setExtracting(false)
    }
  }

  if (loading) {
    return (
      <>
        <Navigation />
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          minHeight: '100vh',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          <div className="spinner" style={{ width: '40px', height: '40px' }}></div>
          <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
        </div>
      </>
    )
  }

  if (!course) {
    return (
      <>
        <Navigation />
        <div className="syllabus-upload-container">
          <div className="syllabus-error">
            <h2>Course not found</h2>
            <button onClick={() => router.push('/courses')} className="btn-primary">
              Back to Courses
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Navigation />
      <div className="syllabus-upload-container">
        <div className="syllabus-upload-card">
          <div className="syllabus-header">
            <h1 className="syllabus-title">Upload Syllabus</h1>
            <p className="syllabus-subtitle">
              Upload your syllabus for <strong>{course.course_name}</strong>
              {course.professor_name && ` with ${course.professor_name}`}
            </p>
            <p className="syllabus-hint">
              You can upload up to {MAX_FILES} PDF files. We'll extract all the important information like exam dates, assignment deadlines, and class schedules.
            </p>
          </div>

          {/* File Upload Area */}
          <div
            className="syllabus-dropzone"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <input
              type="file"
              id="syllabus-upload"
              accept="application/pdf"
              multiple
              onChange={handleFileSelect}
              disabled={uploading || extracting || files.length >= MAX_FILES}
              style={{ display: 'none' }}
            />
            <label htmlFor="syllabus-upload" className="dropzone-label">
              <div className="dropzone-icon">📄</div>
              <div className="dropzone-text">
                <strong>Click to upload</strong> or drag and drop
              </div>
              <div className="dropzone-hint">
                PDF files only (max {MAX_FILE_SIZE_MB}MB each, up to {MAX_FILES} files)
              </div>
            </label>
          </div>

          {/* Selected Files */}
          {files.length > 0 && (
            <div className="syllabus-files">
              <h3 className="syllabus-files-title">
                Selected Files ({files.length}/{MAX_FILES})
              </h3>
              <div className="files-list">
                {files.map((file, index) => (
                  <div key={index} className="file-item">
                    <div className="file-info">
                      <div className="file-icon">📄</div>
                      <div className="file-details">
                        <div className="file-name">{file.name}</div>
                        <div className="file-size">
                          {(file.size / (1024 * 1024)).toFixed(2)} MB
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFile(index)}
                      className="file-remove"
                      disabled={uploading || extracting}
                      aria-label="Remove file"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="syllabus-actions">
            <button
              onClick={handleSkip}
              className="btn-secondary"
              disabled={uploading || extracting}
            >
              Skip for Now
            </button>
            <button
              onClick={handleSubmit}
              className="btn-primary"
              disabled={uploading || extracting || files.length === 0}
            >
              {extracting ? 'Processing...' : files.length > 0 ? `Upload & Process (${files.length})` : 'Upload Syllabus'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
