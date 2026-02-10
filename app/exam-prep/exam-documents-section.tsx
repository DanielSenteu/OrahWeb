'use client'

import { useState, useRef } from 'react'
import toast from 'react-hot-toast'
import './exam-documents-upload.css'

interface ExamDocument {
  file: File
  extractedText?: string
  status: 'pending' | 'extracting' | 'ready' | 'error'
}

interface ExamDocumentsSectionProps {
  documents: ExamDocument[]
  onDocumentsChange: (documents: ExamDocument[]) => void
  maxFiles?: number
}

export default function ExamDocumentsSection({
  documents,
  onDocumentsChange,
  maxFiles = 10,
}: ExamDocumentsSectionProps) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const MAX_FILE_SIZE_MB = 10

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    addFiles(selectedFiles)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    addFiles(droppedFiles)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const addFiles = async (newFiles: File[]) => {
    const validFiles: ExamDocument[] = []
    const errors: string[] = []

    newFiles.forEach(file => {
      // Check file type (PDF, images, or text)
      const isValidType = 
        file.type === 'application/pdf' ||
        file.type.startsWith('image/') ||
        file.type === 'text/plain'

      if (!isValidType) {
        errors.push(`${file.name} is not a supported file type (PDF, image, or text)`)
        return
      }

      // Check file size
      const fileSizeMB = file.size / (1024 * 1024)
      if (fileSizeMB > MAX_FILE_SIZE_MB) {
        errors.push(`${file.name} is too large (max ${MAX_FILE_SIZE_MB}MB)`)
        return
      }

      // Check if we already have this file
      if (documents.some(d => d.file.name === file.name && d.file.size === file.size)) {
        errors.push(`${file.name} is already added`)
        return
      }

      // Check total file count
      if (documents.length + validFiles.length >= maxFiles) {
        errors.push(`Maximum ${maxFiles} files allowed`)
        return
      }

      validFiles.push({
        file,
        status: 'pending',
      })
    })

    if (errors.length > 0) {
      errors.forEach(error => toast.error(error))
    }

    if (validFiles.length > 0) {
      const updatedDocuments = [...documents, ...validFiles]
      onDocumentsChange(updatedDocuments)
      toast.success(`Added ${validFiles.length} file${validFiles.length > 1 ? 's' : ''}`)

      // Extract text from new files
      for (let i = 0; i < validFiles.length; i++) {
        const docIndex = documents.length + i
        await extractTextFromFile(updatedDocuments, docIndex)
      }
    }
  }

  const extractTextFromFile = async (docs: ExamDocument[], index: number) => {
    const doc = docs[index]
    if (!doc || doc.status !== 'pending') return

    // Update status to extracting
    const updated = [...docs]
    updated[index] = { ...updated[index], status: 'extracting' }
    onDocumentsChange(updated)

    try {
      const reader = new FileReader()
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(doc.file)
      })

      const base64 = await base64Promise
      const base64Data = base64.split(',')[1]

      let extractedText = ''

      if (doc.file.type.startsWith('image/')) {
        const res = await fetch('/api/vision/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Data }),
        })
        if (res.ok) {
          const data = await res.json()
          extractedText = data.text || ''
        }
      } else if (doc.file.type === 'application/pdf') {
        const res = await fetch('/api/pdf/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdf: base64Data }),
        })
        if (res.ok) {
          const data = await res.json()
          extractedText = data.text || ''
        }
      } else if (doc.file.type === 'text/plain') {
        extractedText = await doc.file.text()
      }

      // Update with extracted text
      const finalUpdated = [...docs]
      finalUpdated[index] = {
        ...finalUpdated[index],
        extractedText,
        status: extractedText ? 'ready' : 'error',
      }
      onDocumentsChange(finalUpdated)

      if (!extractedText) {
        toast.error(`Failed to extract text from ${doc.file.name}`)
      }
    } catch (error) {
      console.error('Error extracting text:', error)
      const errorUpdated = [...docs]
      errorUpdated[index] = { ...errorUpdated[index], status: 'error' }
      onDocumentsChange(errorUpdated)
      toast.error(`Error processing ${doc.file.name}`)
    }
  }

  const removeFile = (index: number) => {
    const updated = documents.filter((_, i) => i !== index)
    onDocumentsChange(updated)
    toast.success('File removed')
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="exam-documents-section">
      <div className="exam-documents-header">
        <div>
          <h3 className="exam-documents-title">Upload Study Notes</h3>
          <p className="exam-documents-count">
            {documents.length} / {maxFiles} files
          </p>
        </div>
      </div>

      {documents.length < maxFiles && (
        <div
          className={`exam-dropzone ${isDragging ? 'dragging' : ''} ${documents.length >= maxFiles ? 'disabled' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="dropzone-icon">📄</div>
          <div className="dropzone-text">
            <strong>Click to upload</strong> or drag and drop
          </div>
          <div className="dropzone-hint">
            PDF, images, or text files (max {MAX_FILE_SIZE_MB}MB each)
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,image/*,.txt"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            disabled={documents.length >= maxFiles}
          />
        </div>
      )}

      {documents.length > 0 && (
        <div className="exam-files-list">
          {documents.map((doc, index) => (
            <div key={index} className="exam-file-item">
              <div className="exam-file-info">
                <div className="exam-file-icon">
                  {doc.file.type === 'application/pdf' ? '📄' : 
                   doc.file.type.startsWith('image/') ? '🖼️' : '📝'}
                </div>
                <div className="exam-file-details">
                  <div className="exam-file-name">{doc.file.name}</div>
                  <div className="exam-file-size">{formatFileSize(doc.file.size)}</div>
                </div>
                <div className={`exam-file-status ${doc.status}`}>
                  {doc.status === 'pending' && 'Pending'}
                  {doc.status === 'extracting' && 'Extracting...'}
                  {doc.status === 'ready' && '✓ Ready'}
                  {doc.status === 'error' && '✗ Error'}
                </div>
              </div>
              <button
                className="exam-file-remove"
                onClick={() => removeFile(index)}
                disabled={doc.status === 'extracting'}
                title="Remove file"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
