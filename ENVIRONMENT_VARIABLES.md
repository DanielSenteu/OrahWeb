# Environment Variables Setup

## Required for Lecture Notes Audio Processing

Add this to your **Vercel Environment Variables**:

```
NEXT_PUBLIC_EDGE_FUNCTION_LECTURE_NOTES_AUDIO=https://ffudidfxurrjcjredfjg.supabase.co/functions/v1/smooth-task
```

## How to Add in Vercel

1. Go to Vercel Dashboard → Your Project
2. Click **Settings** → **Environment Variables**
3. Click **Add New**
4. Add:
   - **Key**: `NEXT_PUBLIC_EDGE_FUNCTION_LECTURE_NOTES_AUDIO`
   - **Value**: `https://ffudidfxurrjcjredfjg.supabase.co/functions/v1/smooth-task`
   - **Environment**: Select all (Production, Preview, Development)
5. Click **Save**
6. **Redeploy** your application

## Fallback

The code includes a fallback URL, so it will work even without the environment variable set. However, it's best practice to set it in Vercel for:
- Easy updates if the URL changes
- Different URLs for different environments
- Better configuration management

## Verification

After setting the environment variable and redeploying:
1. Test with a short recording (< 5 min) - should work
2. Test with a long recording (30+ min) - should work without timeout
3. Check browser console for any errors
