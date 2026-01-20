'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import './loading.css'

export default function PlanLoadingPage() {
  const router = useRouter()
  const [status, setStatus] = useState('Creating your goal...')

  useEffect(() => {
    let cancelled = false
    let pollCount = 0
    const creationTime = typeof window !== 'undefined' ? sessionStorage.getItem('newGoalCreationTimestamp') : null
    const pendingDocumentId = typeof window !== 'undefined' ? sessionStorage.getItem('pendingGoalDocumentId') : null
    
    // Parse timestamp once at the start (subtract 2 seconds to be more lenient)
    const timestampDate = creationTime ? new Date(parseInt(creationTime) - 2000) : null

    console.log('🔍 Loading page: Waiting for new goal created after:', timestampDate?.toISOString())

    const checkPlanReady = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || cancelled) return

        // Look for NEW goals created after our timestamp
        const { data: newGoals } = await supabase
          .from('user_goals')
          .select('id, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)

        if (newGoals && newGoals.length > 0 && !cancelled) {
          const latestGoal = newGoals[0]
          const goalCreatedAt = new Date(latestGoal.created_at)
          
          console.log('🔍 Latest goal created:', goalCreatedAt.toISOString())
          console.log('🔍 Timestamp date:', timestampDate?.toISOString())
          console.log('🔍 Is new goal?', timestampDate ? goalCreatedAt >= timestampDate : true)
          
          // Check if this goal was created after our timestamp (or if no timestamp, just check for tasks)
          const isNewGoal = timestampDate ? goalCreatedAt >= timestampDate : true
          
          if (isNewGoal) {
            setStatus('Generating your tasks...')

            // Check if tasks exist for this goal
            const { data: tasks, count } = await supabase
              .from('task_items')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .eq('goal_id', latestGoal.id)

            console.log('🔍 Found tasks for new goal:', count)

            if (count && count > 0 && !cancelled) {
              setStatus('Setting as active goal...')
              
              // Set this goal as the active goal
              await supabase
                .from('user_preferences')
                .upsert(
                  {
                    user_id: user.id,
                    active_goal_id: latestGoal.id,
                  },
                  { onConflict: 'user_id' }
                )

              if (pendingDocumentId) {
                await supabase
                  .from('goal_documents')
                  .update({ goal_id: latestGoal.id })
                  .eq('id', pendingDocumentId)
                  .eq('user_id', user.id)
              }

              setStatus('Plan ready! Loading dashboard...')
              
              console.log('✅ New goal ready! Redirecting to dashboard with goal:', latestGoal.id)
              
              // Clean up session storage
              if (typeof window !== 'undefined') {
                sessionStorage.removeItem('newGoalCreationTimestamp')
                sessionStorage.removeItem('pendingGoalDocumentId')
                sessionStorage.removeItem('pendingGoalDocumentType')
              }
              
              setTimeout(() => {
                if (!cancelled) {
                  // Use hard navigation to ensure clean state
                  window.location.href = '/dashboard'
                }
              }, 1000)
              return
            }
          }
        }

        // Update status message based on poll count
        pollCount++
        if (pollCount > 10) {
          setStatus('Building your personalized plan...')
        }
        if (pollCount > 20) {
          setStatus('Almost there...')
        }

        // Poll again in 2 seconds if not ready
        if (!cancelled) {
          setTimeout(() => checkPlanReady(), 2000)
        }
      } catch (error) {
        console.error('Poll error:', error)
        if (!cancelled) {
          setTimeout(() => checkPlanReady(), 2000)
        }
      }
    }

    // Start polling after 2 seconds (give edge function time to start)
    const initialTimer = setTimeout(() => {
      if (!cancelled) {
        checkPlanReady()
      }
    }, 2000)

    return () => {
      cancelled = true
      clearTimeout(initialTimer)
    }
  }, [router])

  return (
    <>
      {/* Background */}
      <div className="loading-bg" />

      {/* Loading Container */}
      <div className="loading-container">
        <div className="loading-content">
          {/* Spinner */}
          <div className="spinner-wrapper">
            <div className="spinner-glow" />
            <div className="spinner-ring spinner-ring-1" />
            <div className="spinner-ring spinner-ring-2" />
            <div className="spinner-ring spinner-ring-3" />
          </div>

          {/* Title */}
          <h1 className="loading-title">Creating your dashboard</h1>

          {/* Status */}
          <div className="loading-status">
            {status}
            <div className="progress-dots">
              <div className="progress-dot" />
              <div className="progress-dot" />
              <div className="progress-dot" />
            </div>
          </div>

          {/* Hint */}
          <div className="loading-hint">This may take 30-60 seconds</div>
        </div>
      </div>
    </>
  )
}

