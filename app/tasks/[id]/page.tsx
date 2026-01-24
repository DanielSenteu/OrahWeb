'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import './task-detail.css'

interface Task {
  id: string
  title: string
  notes: string | null
  estimated_minutes: number
  deliverable: string | null
  metric: string | null
  is_completed: boolean
  goal_id: string
  user_id: string
}

interface Checkpoint {
  id: string
  content: string
  is_completed: boolean
  position: number
}

export default function TaskDetailPage() {
  const router = useRouter()
  const params = useParams()
  const taskId = params.id as string
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [task, setTask] = useState<Task | null>(null)
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])

  useEffect(() => {
    loadTask()
  }, [taskId])

  const loadTask = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Get task details
      const { data: taskData } = await supabase
        .from('task_items')
        .select('*')
        .eq('id', taskId)
        .single()

      setTask(taskData)

      // Get checkpoints
      const { data: checkpointsData } = await supabase
        .from('task_checklist_items')
        .select('*')
        .eq('task_id', taskId)
        .order('position', { ascending: true })

      setCheckpoints(checkpointsData || [])
      setLoading(false)
    } catch (error) {
      console.error('Task load error:', error)
      setLoading(false)
    }
  }

  const toggleCheckpoint = async (checkpointId: string, currentStatus: boolean) => {
    try {
      // Update in database
      await supabase
        .from('task_checklist_items')
        .update({ is_completed: !currentStatus })
        .eq('id', checkpointId)

      // Update local state
      setCheckpoints(prev => 
        prev.map(cp => 
          cp.id === checkpointId 
            ? { ...cp, is_completed: !currentStatus }
            : cp
        )
      )

      // Track checkpoint completion
      if (!currentStatus) {
        const { trackUserEngagement } = await import('@/lib/utils/posthog-events')
        trackUserEngagement('checkpoint_completed', {
          task_id: taskId,
          checkpoint_id: checkpointId,
        })
      }
    } catch (error) {
      console.error('Checkpoint toggle error:', error)
    }
  }

  const startWork = () => {
    // Navigate to work session (we'll create this route)
    router.push(`/tasks/${taskId}/work`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-primary-purple border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center text-white">
        <p>Task not found</p>
      </div>
    )
  }

  const completedCount = checkpoints.filter(cp => cp.is_completed).length
  const totalCheckpoints = checkpoints.length

  return (
    <>
      {/* Background */}
      <div className="noise-bg"></div>

      {/* Main Container */}
      <div className="container">
        {/* Back Button */}
        <Link href="/dashboard" className="back-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back
        </Link>

        {/* Task Card */}
        <div className="task-card">
          {/* Task Header */}
          <div className="task-header">
            <h1 className="task-title">{task.title}</h1>
            {task.notes && (
              <p className="task-description">{task.notes}</p>
            )}
          </div>

          {/* Info Grid */}
          <div className="info-grid">
            <div className="info-item">
              <div className="info-label">Estimated Time</div>
              <div className="info-value highlight">{task.estimated_minutes} min</div>
            </div>

            {task.deliverable && (
              <div className="info-item">
                <div className="info-label">Deliverable</div>
                <div className="info-value-text">{task.deliverable}</div>
              </div>
            )}

            {task.metric && (
              <div className="info-item">
                <div className="info-label">Success Metric</div>
                <div className="info-value-text">{task.metric}</div>
              </div>
            )}
          </div>

          {/* Checkpoints Section */}
          {checkpoints.length > 0 && (
            <div className="section">
              <div className="section-header">
                <h2 className="section-title">Checkpoints</h2>
                <span 
                  className="progress-badge"
                  style={{
                    background: completedCount === totalCheckpoints ? 'rgba(16, 185, 129, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                    borderColor: completedCount === totalCheckpoints ? 'rgba(16, 185, 129, 0.3)' : 'rgba(168, 85, 247, 0.3)',
                    color: completedCount === totalCheckpoints ? 'var(--primary-green)' : 'var(--primary-purple)'
                  }}
                >
                  {completedCount}/{totalCheckpoints} completed
                </span>
              </div>

              <div className="checkpoints-list">
                {checkpoints.map((checkpoint) => (
                  <div
                    key={checkpoint.id}
                    className={`checkpoint-item ${checkpoint.is_completed ? 'completed' : ''}`}
                    onClick={() => toggleCheckpoint(checkpoint.id, checkpoint.is_completed)}
                  >
                    <div className="checkpoint-checkbox">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </div>
                    <div className="checkpoint-text">
                      {checkpoint.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Work Button */}
        <div className="work-button-container">
          <button className="btn-work" onClick={startWork}>
            <span>Work on Task</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10"/>
              <polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>
    </>
  )
}
