'use client'

import { ButtonHTMLAttributes, forwardRef } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils/cn'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-semibold rounded-full transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-md'
    
    const variants = {
      primary: 'bg-gradient-to-r from-orah-blue to-orah-purple text-white hover:shadow-xl hover:shadow-orah-blue/50 hover:-translate-y-0.5 active:translate-y-0',
      secondary: 'bg-orah-surface text-orah-text border-2 border-orah-surface-light hover:bg-orah-surface-light hover:border-orah-blue/30 hover:-translate-y-0.5 active:translate-y-0',
      success: 'bg-orah-green text-white hover:shadow-xl hover:shadow-orah-green/50 hover:-translate-y-0.5 active:translate-y-0',
      danger: 'bg-orah-red text-white hover:shadow-xl hover:shadow-orah-red/50 hover:-translate-y-0.5 active:translate-y-0',
      ghost: 'bg-transparent text-orah-text-secondary hover:bg-orah-surface-light shadow-none',
    }

    const sizes = {
      sm: 'px-5 py-2.5 text-sm',
      md: 'px-7 py-3.5 text-base',
      lg: 'px-10 py-4 text-lg',
    }

    return (
      <motion.button
        ref={ref}
        whileTap={{ scale: 0.95 }}
        whileHover={{ scale: 1.02 }}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>Loading...</span>
          </div>
        ) : (
          children
        )}
      </motion.button>
    )
  }
)

Button.displayName = 'Button'

export { Button }

