'use client'

import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils/cn'

interface CardProps {
  children: ReactNode
  className?: string
  hover?: boolean
  gradient?: boolean
}

export function Card({ children, className, hover = false, gradient = false }: CardProps) {
  const Component = hover ? motion.div : 'div'
  
  return (
    <Component
      className={cn(
        'glass-card p-8 shadow-lg',
        gradient && 'bg-gradient-to-br from-orah-surface to-orah-card',
        className
      )}
      {...(hover && {
        whileHover: { scale: 1.03, y: -8 },
        transition: { duration: 0.3, ease: 'easeOut' }
      })}
    >
      {children}
    </Component>
  )
}

