// PostHog event tracking utilities
// This file provides helper functions for consistent event tracking across the app

import { posthog } from '@/lib/posthog'

// Check if PostHog is loaded before tracking
const isPostHogReady = () => {
  return typeof window !== 'undefined' && posthog.__loaded
}

// Wait for PostHog to be ready (with timeout)
const waitForPostHog = async (maxWait = 2000): Promise<boolean> => {
  if (isPostHogReady()) return true
  
  const startTime = Date.now()
  while (Date.now() - startTime < maxWait) {
    await new Promise(resolve => setTimeout(resolve, 100))
    if (isPostHogReady()) return true
  }
  return false
}

// Goal creation events
export const trackGoalCreated = async (goalType: 'semester' | 'assignment' | 'exam' | 'custom', metadata?: Record<string, any>) => {
  const ready = await waitForPostHog()
  if (!ready) {
    console.warn('PostHog not ready, event not tracked:', 'goal_created')
    return
  }
  
  posthog.capture('goal_created', {
    goal_type: goalType,
    ...metadata,
  })
  
  // Flush to ensure event is sent immediately
  posthog.flush()
}

// Task completion events
export const trackTaskCompleted = async (taskId: string, metadata?: Record<string, any>) => {
  const ready = await waitForPostHog()
  if (!ready) {
    console.warn('PostHog not ready, event not tracked:', 'task_completed')
    return
  }
  
  posthog.capture('task_completed', {
    task_id: taskId,
    ...metadata,
  })
  
  // Flush to ensure event is sent immediately
  posthog.flush()
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
export const trackLectureNoteCreated = async (metadata?: Record<string, any>) => {
  const ready = await waitForPostHog()
  if (!ready) {
    console.warn('PostHog not ready, event not tracked:', 'lecture_note_created')
    return
  }
  
  posthog.capture('lecture_note_created', metadata)
  
  // Flush to ensure event is sent immediately
  posthog.flush()
}

// User engagement events
export const trackUserEngagement = async (action: string, metadata?: Record<string, any>) => {
  const ready = await waitForPostHog()
  if (!ready) {
    console.warn('PostHog not ready, event not tracked:', 'user_engagement')
    return
  }
  
  posthog.capture('user_engagement', {
    action,
    ...metadata,
  })
  
  // Flush to ensure event is sent immediately
  posthog.flush()
}
