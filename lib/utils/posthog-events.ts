// PostHog event tracking utilities
// This file provides helper functions for consistent event tracking across the app

import { posthog } from '@/lib/posthog'

// Check if PostHog is available
const isPostHogAvailable = () => {
  if (typeof window === 'undefined') return false
  // PostHog queues events even if not fully loaded, so we can always try
  return typeof posthog !== 'undefined'
}

// Wait for PostHog to be available (with timeout)
const waitForPostHog = async (maxWait = 2000): Promise<boolean> => {
  if (isPostHogAvailable()) return true
  
  const startTime = Date.now()
  while (Date.now() - startTime < maxWait) {
    await new Promise(resolve => setTimeout(resolve, 100))
    if (isPostHogAvailable()) return true
  }
  return false
}

// Goal creation events
export const trackGoalCreated = async (goalType: 'semester' | 'assignment' | 'exam' | 'custom', metadata?: Record<string, any>) => {
  try {
    // Always try to send - PostHog will queue if not ready
    if (typeof window !== 'undefined' && typeof posthog !== 'undefined') {
      const eventData = {
        goal_type: goalType,
        ...metadata,
      }
      
      console.log('📊 Tracking goal_created:', eventData)
      posthog.capture('goal_created', eventData)
      
      // Wait a bit to ensure it's sent
      await new Promise(resolve => setTimeout(resolve, 100))
    } else {
      console.warn('⚠️ PostHog not available, event not tracked:', 'goal_created')
    }
  } catch (error) {
    console.error('❌ Error tracking goal_created:', error)
  }
}

// Task completion events
export const trackTaskCompleted = async (taskId: string, metadata?: Record<string, any>) => {
  try {
    // Always try to send - PostHog will queue if not ready
    if (typeof window !== 'undefined' && typeof posthog !== 'undefined') {
      const eventData = {
        task_id: taskId,
        ...metadata,
      }
      
      console.log('📊 Tracking task_completed:', eventData)
      posthog.capture('task_completed', eventData)
      
      // Wait a bit to ensure it's sent
      await new Promise(resolve => setTimeout(resolve, 100))
    } else {
      console.warn('⚠️ PostHog not available, event not tracked:', 'task_completed')
    }
  } catch (error) {
    console.error('❌ Error tracking task_completed:', error)
  }
}

// Feature usage events
export const trackFeatureUsed = (featureName: string, metadata?: Record<string, any>) => {
  if (!isPostHogAvailable()) return
  
  posthog.capture('feature_used', {
    feature_name: featureName,
    ...metadata,
  })
}

// Page view with custom properties
export const trackPageView = (pageName: string, metadata?: Record<string, any>) => {
  if (!isPostHogAvailable()) return
  
  posthog.capture('$pageview', {
    page_name: pageName,
    ...metadata,
  })
}

// Lecture note events
export const trackLectureNoteCreated = async (metadata?: Record<string, any>) => {
  try {
    // Always try to send - PostHog will queue if not ready
    if (typeof window !== 'undefined' && typeof posthog !== 'undefined') {
      console.log('📊 Tracking lecture_note_created:', metadata)
      posthog.capture('lecture_note_created', metadata || {})
      
      // Wait a bit to ensure it's sent
      await new Promise(resolve => setTimeout(resolve, 100))
    } else {
      console.warn('⚠️ PostHog not available, event not tracked:', 'lecture_note_created')
    }
  } catch (error) {
    console.error('❌ Error tracking lecture_note_created:', error)
  }
}

// User engagement events
export const trackUserEngagement = async (action: string, metadata?: Record<string, any>) => {
  try {
    // Always try to send - PostHog will queue if not ready
    if (typeof window !== 'undefined' && typeof posthog !== 'undefined') {
      const eventData = {
        action,
        ...metadata,
      }
      
      console.log('📊 Tracking user_engagement:', eventData)
      posthog.capture('user_engagement', eventData)
      
      // Wait a bit to ensure it's sent
      await new Promise(resolve => setTimeout(resolve, 100))
    } else {
      console.warn('⚠️ PostHog not available, event not tracked:', 'user_engagement')
    }
  } catch (error) {
    console.error('❌ Error tracking user_engagement:', error)
  }
}
