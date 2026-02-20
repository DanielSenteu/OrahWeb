'use client'

import { Toaster } from 'react-hot-toast'

export default function ToastProvider() {
  return (
    <Toaster
      position="bottom-center"
      toastOptions={{
        duration: 4000,
        style: {
          background: '#1f2937',
          color: '#f9fafb',
          borderRadius: '10px',
          fontSize: '0.875rem',
        },
        success: {
          iconTheme: { primary: '#059669', secondary: '#f9fafb' },
        },
        error: {
          iconTheme: { primary: '#dc2626', secondary: '#f9fafb' },
        },
      }}
    />
  )
}
