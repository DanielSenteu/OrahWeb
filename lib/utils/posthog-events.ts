// PostHog event tracking utilities
// This file provides helper functions for consistent event tracking across the app

import { posthog } from '@/lib/posthog'

// Check if PostHog is loaded before tracking
const isPostHogReady = () => {
  return typeof window !== 'undefined' && posthog.__loaded
}

// Goal creation events
export const trackGoalCreated = (goalType: 'semester' | 'assignment' | 'exam' | 'custom', metadata?: Record<string, any>) => {
  if (!isPostHogReady()) return
  
  posthog.capture('goal_created', {
    goal_type: goalType,
    ...metadata,
  })
}

// Task completion events
export const trackTaskCompleted = (taskId: string, metadata?: Record<string, any>) => {
  if (!isPostHogReady()) return
  
  posthog.capture('task_completed', {
    task_id: taskId,
    ...metadata,
  })
}

// Feature usage events
export const trackFeatureUsed = (featureName: string, metadata?: Record<string, any>) => {
  if (!isPostHogReady()) return
  
  posthog.capture('feature_used', {
    feature_name: featureName,
    ...metadata,
  })
}

// Page view with custom properties
export const trackPageView = (pageName: string, metadata?: Record<string, any>) => {
  if (!isPostHogReady()) return
  
  posthog.capture('$pageview', {
    page_name: pageName,
    ...metadata,
  })
}

// Lecture note events
export const trackLectureNoteCreated = (metadata?: Record<string, any>) => {
  if (!isPostHogReady()) return
  
  posthog.capture('lecture_note_created', metadata)
}

// User engagement events
export const trackUserEngagement = (action: string, metadata?: Record<string, any>) => {
  if (!isPostHogReady()) return
  
  posthog.capture('user_engagement', {
    action,
    ...metadata,
  })
}
