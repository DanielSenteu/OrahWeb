'use client'

import { useState, useRef, useCallback } from 'react'
import { fileToBase64, getFileType } from '@/lib/utils/fileToBase64'

interface FileUploadProps {
  onFileSelect: (base64: string, fileName: string, mimeType: string) => void
  accept?: string
  maxSizeMB?: number
  disabled?: boolean
}

export function FileUpload({
  onFileSelect,
  accept = 'image/png,image/jpeg,image/jpg,image/webp,application/pdf',
  maxSizeMB = 10,
  disabled = false,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)
      setProcessing(true)

      try {
        // Check file size
        const maxBytes = maxSizeMB * 1024 * 1024
        if (file.size > maxBytes) {
          throw new Error(`File size must be under ${maxSizeMB}MB`)
        }

        // Check file type
        const fileType = getFileType(file)
        if (fileType === 'unsupported') {
          throw new Error('Unsupported file type. Please upload an image (PNG, JPG, WEBP) or PDF.')
        }

        // Convert to base64
        const base64 = await fileToBase64(file)
        onFileSelect(base64, file.name, file.type)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to process file')
      } finally {
        setProcessing(false)
      }
    },
    [maxSizeMB, onFileSelect]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)

      if (disabled) return

      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) {
        handleFile(files[0])
      }
    },
    [disabled, handleFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleClick = useCallback(() => {
    if (!disabled) {
      fileInputRef.current?.click()
    }
  }, [disabled])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        handleFile(files[0])
      }
    },
    [handleFile]
  )

  return (
    <div className="w-full">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        className={`
          relative border-2 border-dashed rounded-2xl p-8
          transition-all duration-200 cursor-pointer
          ${
            isDragging
              ? 'border-orah-blue bg-orah-blue/10'
              : 'border-orah-surface-light bg-orah-surface/30'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-orah-blue hover:bg-orah-blue/5'}
          ${processing ? 'pointer-events-none' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />

        <div className="flex flex-col items-center justify-center text-center">
          {processing ? (
            <>
              <div className="w-12 h-12 border-4 border-orah-blue border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-orah-text">Processing file...</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-orah-blue/20 flex items-center justify-center mb-4">
                <span className="text-3xl">📁</span>
              </div>
              <p className="text-lg font-semibold mb-2">
                {isDragging ? 'Drop your file here' : 'Click to upload or drag and drop'}
              </p>
              <p className="text-sm text-orah-text-secondary">
                Images (PNG, JPG, WEBP) or PDF • Max {maxSizeMB}MB
              </p>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
    </div>
  )
}

