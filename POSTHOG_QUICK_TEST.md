# PostHog Quick Test Guide

## ✅ Dev Server Status
The development server should be running. Check: http://localhost:3000

## 🔧 Environment Variables

Make sure your `.env.local` file has:

```env
NEXT_PUBLIC_POSTHOG_KEY=phc_UCzvS3poUAuAslyjjCPOF6Fg2f4Qhot2RYu1hzCgTDp
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

## 🧪 Testing Steps

1. **Open your browser** and go to: `http://localhost:3000`

2. **Open Browser Console** (F12 or Right-click → Inspect → Console)

3. **Look for**:
   - `✅ PostHog initialized` message in console
   - Network requests to `us.i.posthog.com` (check Network tab)

4. **Check PostHog Dashboard**:
   - Go to your PostHog project
   - Click "Activity" or "Events" 
   - You should see:
     - `posthog_initialized` event
     - `landing_page_viewed` event
     - `$pageview` event (automatic)

## 📊 Expected Events

When you visit `http://localhost:3000`, these events should fire:
- ✅ `posthog_initialized` - When PostHog loads
- ✅ `landing_page_viewed` - When landing page loads
- ✅ `$pageview` - Automatic pageview tracking

## 🐛 Troubleshooting

**If events don't appear:**
1. Check browser console for errors
2. Verify `.env.local` has the PostHog variables
3. Restart dev server: Stop (Ctrl+C) and run `npm run dev` again
4. Check Network tab for failed requests to PostHog

**If you see "PostHog not initialized":**
- Environment variables might not be loaded
- Restart the dev server after adding env vars

## ✅ Success Indicators

- Console shows: `✅ PostHog initialized`
- PostHog dashboard shows events within 5-10 seconds
- Network tab shows successful POST to `us.i.posthog.com/capture/`
