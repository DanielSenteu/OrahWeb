# Supabase Storage Setup for Lecture Recordings

## Step 1: Create Storage Bucket

1. Go to your Supabase Dashboard → **Storage**
2. Click **"New bucket"**
3. Configure:
   - **Name**: `lecture-recordings`
   - **Public bucket**: ❌ **UNCHECKED** (private - users can only access their own files)
   - **File size limit**: Leave default or set to 500MB (for long recordings)
   - **Allowed MIME types**: `audio/webm,audio/mp3,audio/mpeg,audio/wav,audio/ogg`

## Step 2: Set Up RLS Policies

Go to **Storage** → **Policies** → `lecture-recordings` bucket

**Important:** The Supabase dashboard policy editor expects just the policy definition expression, NOT the full `CREATE POLICY` statement.

### Policy 1: Users can upload their own files

1. Click **"New policy"** → **"Create a policy from scratch"**
2. **Policy name:** `Users can upload their own recordings`
3. **Allowed operation:** Check **INSERT** (SELECT will auto-check)
4. **Target roles:** Select **authenticated**
5. **Policy definition:** Paste this expression (ONLY the expression, not CREATE POLICY):
```sql
bucket_id = 'lecture-recordings' AND
(split_part(name, '/', 1)) = auth.uid()::text
```
6. Click **"Review"** → **"Save policy"**

**Alternative if above doesn't work:** Use this simpler version:
```sql
bucket_id = 'lecture-recordings' AND
name LIKE (auth.uid()::text || '/%')
```

### Policy 2: Users can read their own files

1. Click **"New policy"** → **"Create a policy from scratch"**
2. **Policy name:** `Users can read their own recordings`
3. **Allowed operation:** Check **SELECT**
4. **Target roles:** Select **authenticated**
5. **Policy definition:** Paste this expression:
```sql
bucket_id = 'lecture-recordings' AND
(split_part(name, '/', 1)) = auth.uid()::text
```
6. Click **"Review"** → **"Save policy"**

**Alternative if above doesn't work:**
```sql
bucket_id = 'lecture-recordings' AND
name LIKE (auth.uid()::text || '/%')
```

### Policy 3: Users can delete their own files

1. Click **"New policy"** → **"Create a policy from scratch"**
2. **Policy name:** `Users can delete their own recordings`
3. **Allowed operation:** Check **DELETE** (SELECT will auto-check)
4. **Target roles:** Select **authenticated**
5. **Policy definition:** Paste this expression:
```sql
bucket_id = 'lecture-recordings' AND
(split_part(name, '/', 1)) = auth.uid()::text
```
6. Click **"Review"** → **"Save policy"**

**Alternative if above doesn't work:**
```sql
bucket_id = 'lecture-recordings' AND
name LIKE (auth.uid()::text || '/%')
```

### Policy 4: Service role can access all files (for Edge Function)

**Note:** This policy needs to be created via SQL Editor (service_role might not be available in dashboard UI).

1. Go to **SQL Editor** in Supabase Dashboard
2. Run this SQL:
```sql
CREATE POLICY "Service role can access all recordings"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'lecture-recordings');
```

## Step 3: Verify Setup

After creating the bucket and policies:
1. ✅ Bucket `lecture-recordings` exists
2. ✅ RLS policies are active
3. ✅ File size limit is appropriate (500MB recommended)
4. ✅ MIME types include audio formats

## File Structure

Files will be stored as:
```
lecture-recordings/
  {user_id}/
    {note_id}.webm
    {note_id}.mp3
```

This ensures:
- ✅ Each user's files are isolated
- ✅ Easy to find files by note ID
- ✅ Easy to clean up when notes are deleted

## Notes

- **No timeout issues**: Storage uploads happen in the background, no API timeout limits
- **Large file support**: Storage handles files up to 5GB (or your configured limit)
- **Efficient**: Direct binary upload, no base64 encoding overhead
- **Persistent**: Files are saved even if processing fails
