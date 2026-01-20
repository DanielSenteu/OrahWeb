'use client'

import { InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, type = 'text', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-orah-text-secondary mb-2">
            {label}
          </label>
        )}
        <input
          type={type}
          ref={ref}
          className={cn(
            'w-full px-4 py-3 bg-orah-surface border border-orah-surface-light rounded-xl',
            'text-orah-text placeholder:text-orah-text-muted',
            'focus:outline-none focus:ring-2 focus:ring-orah-blue focus:border-transparent',
            'transition-all duration-200',
            error && 'border-orah-red focus:ring-orah-red',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-orah-red">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export { Input }

