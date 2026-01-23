# Fix Supabase OAuth URL Display

The Supabase project URL (`ffudidfxurrjcjredfjg.supabase.co`) is showing up in the Google OAuth flow. To fix this and show your custom domain (`orahai.app`), you need to configure Supabase settings.

## Steps to Fix in Supabase Dashboard:

### 1. Update Site URL (This is the key setting!)
1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **Authentication** → **URL Configuration** (or **Settings** → **Auth** → **URL Configuration**)
4. Find the **Site URL** field (NOT the Project URL - that's unchangeable)
5. Change it from `https://ffudidfxurrjcjredfjg.supabase.co` to `https://orahai.app`
6. Click **Save**

**Note:** The Project URL you see in API Settings is your project ID and cannot be changed. The Site URL is what controls what shows in OAuth flows and is in the Authentication section.

### 2. Update Redirect URLs
1. In the same **Authentication** → **URL Configuration** page
2. Find the **Redirect URLs** section (or **Redirect URLs** field)
3. Add these URLs (one per line):
   ```
   https://orahai.app/auth/callback
   https://orahai.app/**
   http://localhost:3000/auth/callback
   http://localhost:3000/**
   ```
4. Click **Save**

**Alternative location:** If you don't see Redirect URLs in Auth settings, check **Settings** → **API** → **Redirect URLs** section

### 3. Configure Google OAuth Provider
1. Go to **Authentication** → **Providers**
2. Click on **Google**
3. Make sure it's **Enabled**
4. In the **Authorized redirect URIs** section, ensure it includes:
   ```
   https://orahai.app/auth/callback
   ```
5. If you're using Google Cloud Console, also add this URL there:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Navigate to **APIs & Services** → **Credentials**
   - Find your OAuth 2.0 Client ID
   - Add `https://orahai.app/auth/callback` to **Authorized redirect URIs**
   - Save

### 4. Verify Environment Variables
Make sure your Vercel environment variables are set:
- `NEXT_PUBLIC_SUPABASE_URL` = `https://ffudidfxurrjcjredfjg.supabase.co` (keep this as your Supabase project URL)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (your anon key)

## What This Fixes:

✅ The OAuth flow will now show `orahai.app` instead of the Supabase project URL
✅ Users will see "Continue to orahai.app" instead of the long Supabase URL
✅ Better branding and user trust

## Testing:

1. After making these changes, test the Google login flow
2. You should see "Continue to orahai.app" in the Google OAuth screen
3. The redirect should work correctly after authentication

## Note:

The code has been updated to always use `https://orahai.app/auth/callback` in production, which helps ensure the correct domain is used even if Supabase settings aren't perfect.
