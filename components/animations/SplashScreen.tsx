'use client'

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

export default function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [isAnimating, setIsAnimating] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAnimating(false)
      setTimeout(onComplete, 500) // Wait for fade out
    }, 3000)

    return () => clearTimeout(timer)
  }, [onComplete])

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: isAnimating ? 1 : 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-orah-bg-dark"
    >
      {/* Gradient Blob Background */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ 
            scale: [0.8, 1.2, 1],
            opacity: [0, 0.8, 0.6]
          }}
          transition={{ 
            duration: 2,
            times: [0, 0.5, 1],
            ease: "easeInOut"
          }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(0, 198, 255, 0.4) 0%, rgba(91, 158, 255, 0.3) 40%, rgba(168, 85, 247, 0.4) 70%, transparent 100%)',
            filter: 'blur(60px)',
          }}
        />
      </div>

      {/* ORAH Logo Text */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ 
          scale: [0.5, 1.1, 1],
          opacity: [0, 1, 1]
        }}
        transition={{
          duration: 1.5,
          times: [0, 0.6, 1],
          ease: "easeOut"
        }}
        className="relative z-10"
      >
        <motion.h1
          className="text-8xl font-black tracking-tight"
          style={{
            background: 'linear-gradient(135deg, #00C6FF 0%, #5B9EFF 50%, #A855F7 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
          animate={{
            backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'linear',
          }}
        >
          ORAH
        </motion.h1>

        {/* Glow Effect */}
        <motion.div
          className="absolute inset-0 -z-10"
          animate={{
            opacity: [0.5, 1, 0.5],
            scale: [0.95, 1.05, 0.95],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          style={{
            background: 'linear-gradient(135deg, #00C6FF, #5B9EFF, #A855F7)',
            filter: 'blur(40px)',
          }}
        />
      </motion.div>

      {/* Loading Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="absolute bottom-20"
      >
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-orah-blue"
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.2,
              }}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

