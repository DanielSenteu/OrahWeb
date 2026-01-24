# PostHog Analytics Setup

## ✅ Installation Complete

PostHog has been installed and configured for your ORAH web application.

## Files Created/Modified

1. **`instrumentation-client.ts`** - PostHog initialization (runs on client-side)
2. **`lib/posthog.ts`** - PostHog provider component and utilities
3. **`next.config.ts`** - Updated to enable instrumentation hook
4. **`app/layout.tsx`** - Will be updated to include PostHog provider

## Environment Variables

Add these to your **`.env.local`** file and **Vercel Environment Variables**:

```env
NEXT_PUBLIC_POSTHOG_KEY=phc_UCzvS3poUAuAslyjjCPOF6Fg2f4Qhot2RYu1hzCgTDp
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

### How to Add in Vercel:

1. Go to Vercel Dashboard → Your Project
2. Click **Settings** → **Environment Variables**
3. Add both variables:
   - `NEXT_PUBLIC_POSTHOG_KEY`
   - `NEXT_PUBLIC_POSTHOG_HOST`
4. Select all environments (Production, Preview, Development)
5. Click **Save**
6. **Redeploy** your application

## What's Tracked Automatically

PostHog automatically captures:
- ✅ Page views
- ✅ Page leaves
- ✅ User sessions
- ✅ User identification (when logged in)

## Manual Event Tracking

You can track custom events anywhere in your app:

```typescript
import { posthog } from '@/lib/posthog'

// Track a custom event
posthog.capture('lecture_recorded', {
  duration: 3600, // seconds
  source: 'audio',
})

// Identify a user (automatically done on login)
posthog.identify(userId, {
  email: user.email,
  name: user.name,
})
```

## Key Events to Track

Consider tracking these important events:

- **User Actions**:
  - `goal_created` - When user creates a new goal
  - `task_completed` - When user completes a task
  - `lecture_recorded` - When user records a lecture
  - `notes_generated` - When notes are successfully generated
  - `semester_plan_created` - When semester plan is created

- **Feature Usage**:
  - `assignment_helper_used` - When assignment helper is used
  - `exam_prep_used` - When exam prep is used
  - `lecture_notes_used` - When lecture notes feature is used
  - `assistant_chat` - When user chats with Orah assistant

- **Errors**:
  - `lecture_processing_failed` - When lecture processing fails
  - `plan_generation_failed` - When plan generation fails

## Testing

1. After adding environment variables and redeploying
2. Visit your site and navigate around
3. Check PostHog dashboard - you should see events coming in
4. Events should appear within a few seconds

## Next Steps

1. ✅ Add environment variables to Vercel
2. ✅ Redeploy application
3. ✅ Test by visiting pages and checking PostHog dashboard
4. ✅ Add custom event tracking for key user actions (optional)
