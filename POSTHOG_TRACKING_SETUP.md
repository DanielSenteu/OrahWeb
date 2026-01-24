# PostHog Tracking Setup - Complete ✅

PostHog is now fully configured to track user engagement and retention across all pages of ORAH.

## What's Tracked

### 1. **User Authentication Events**
- `user_signed_up` - When a new user creates an account (with method: email/google)
- `user_logged_in` - When a user logs in (with method: email/google)
- User identification happens automatically when users log in

### 2. **Goal Creation Events**
- `goal_created` - Tracked when users create goals with metadata:
  - `goal_type`: 'semester' | 'assignment' | 'exam' | 'custom'
  - Additional metadata varies by type (e.g., `has_file`, `hours_per_day`, `chapters`, etc.)

### 3. **Task Completion Events**
- `task_completed` - When a user completes a task (with task_id, checkpoints info, time worked)
- `checkpoint_completed` - When a user completes a checkpoint within a task

### 4. **Feature Usage Events**
- `feature_used` - Track feature usage across the app
- `lecture_note_created` - When lecture notes are generated (with source type, sections count, etc.)

### 5. **Page Views**
- Automatic pageview tracking via PostHog's built-in `$pageview` event
- Custom page view tracking for key pages:
  - Dashboard
  - Goals
  - Lecture Notes
  - Landing Page

### 6. **User Engagement**
- `user_engagement` - General engagement tracking for various actions

## PostHog Configuration

### Features Enabled:
- ✅ **Autocapture**: Automatically captures clicks, form submissions, etc.
- ✅ **Session Recording**: Enabled with privacy settings (masks all inputs and text)
- ✅ **Pageview Tracking**: Automatic on all pages
- ✅ **User Identification**: Automatically identifies users when they log in
- ✅ **Person Profiles**: Only for identified users (privacy-focused)

## Database Connection

PostHog is connected to your Supabase database for advanced analytics and user insights.

## What You Can Track in PostHog Dashboard

1. **User Retention**: See how many users return daily/weekly
2. **Feature Adoption**: Which features are most used (semester planner, assignment helper, etc.)
3. **Conversion Funnels**: Track user journey from signup → goal creation → task completion
4. **User Engagement**: See which pages users visit most and how long they stay
5. **Goal Creation Trends**: Track which goal types are most popular
6. **Task Completion Rates**: Monitor how many tasks users complete

## Key Metrics to Monitor

- **Daily Active Users (DAU)**: Users who visit the dashboard daily
- **Weekly Active Users (WAU)**: Users active in the past week
- **Goal Creation Rate**: % of users who create goals after signup
- **Task Completion Rate**: % of tasks that get completed
- **Feature Usage**: Which academic tools are most popular
- **Retention Cohorts**: How many users return after 1 day, 7 days, 30 days

## Files Modified

1. `lib/posthog.tsx` - Enhanced with user identification and auth state tracking
2. `lib/utils/posthog-events.ts` - New utility file for consistent event tracking
3. `app/(auth)/login/page.tsx` - Added login event tracking
4. `app/(auth)/signup/page.tsx` - Added signup event tracking
5. `app/assistant/page.tsx` - Added goal creation tracking
6. `app/semester-tracking/page.tsx` - Added semester goal tracking
7. `app/exam-prep/page.tsx` - Added exam goal tracking
8. `app/assignment-helper/page.tsx` - Added assignment goal tracking
9. `app/tasks/[id]/page.tsx` - Added checkpoint completion tracking
10. `app/tasks/[id]/work/page.tsx` - Added task completion tracking
11. `app/lecture-notes/page.tsx` - Added lecture note creation tracking and page view
12. `app/dashboard/page.tsx` - Added page view tracking
13. `app/goals/page.tsx` - Added page view tracking

## Next Steps

1. **Visit your PostHog dashboard** to see events coming in
2. **Create custom insights** for key metrics (DAU, WAU, goal creation rate, etc.)
3. **Set up retention cohorts** to track user retention over time
4. **Create funnels** to understand user conversion paths
5. **Set up alerts** for important metrics (e.g., drop in daily active users)

## Testing

To verify tracking is working:
1. Visit `http://localhost:3000` (or your production URL)
2. Check browser console for `✅ PostHog initialized`
3. Perform actions (signup, create goal, complete task)
4. Check PostHog dashboard - events should appear within 5-10 seconds

All tracking is production-ready and will work on `orahai.app` once deployed! 🚀
