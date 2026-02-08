# Syllabus Upload Setup

## ✅ What's Been Built

### 1. **Syllabus Upload Page** (`/courses/[id]/syllabus`)
- Beautiful drag-and-drop interface
- Supports up to 3 PDF files
- Each PDF max 10MB
- Extracts text from all PDFs
- Combines text into single syllabus
- Stores PDFs in Supabase Storage
- Updates course with syllabus data

### 2. **Updated Course Creation Flow**
- After creating a course → redirects to syllabus upload
- User can skip if they don't have syllabus yet
- After upload → redirects to course dashboard

## 📋 Setup Required

### 1. **Create Storage Bucket**

Go to Supabase Dashboard → Storage → Create Bucket:

- **Bucket Name:** `course-documents`
- **Public:** No (private)
- **File Size Limit:** 10MB (or higher if needed)
- **Allowed MIME Types:** `application/pdf`

### 2. **Set Up RLS Policies**

Run this SQL in Supabase SQL Editor:

```sql
-- Allow users to upload to their own course folders
CREATE POLICY "Users can upload to their course documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'course-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to read their own course documents
CREATE POLICY "Users can read their course documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'course-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own course documents
CREATE POLICY "Users can delete their course documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'course-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
```

### 3. **Verify PDF Extraction API**

Make sure `/api/pdf/extract` is working. It uses the `unpdf` package.

If you get errors, check:
- `unpdf` is installed: `npm install unpdf`
- The API route exists: `app/api/pdf/extract/route.ts`

## 🎯 How It Works

1. **User creates course** → Redirected to `/courses/[id]/syllabus`
2. **User uploads PDFs** (up to 3):
   - Drag & drop or click to upload
   - Files validated (PDF only, max 10MB)
   - Files shown in list with remove option
3. **User clicks "Upload & Process"**:
   - Each PDF converted to base64
   - Text extracted using `/api/pdf/extract`
   - PDFs uploaded to Storage: `{user_id}/{course_id}/syllabus/{timestamp}_{filename}`
   - All texts combined into single string
   - Course updated with:
     - `syllabus_text` - Combined extracted text
     - `syllabus_file_url` - First PDF URL (primary)
     - `syllabus_data` - JSON with all PDF URLs and metadata
4. **Redirect to course dashboard**

## 📊 Data Structure

After upload, `courses` table will have:

```json
{
  "syllabus_text": "Combined text from all PDFs...",
  "syllabus_file_url": "user_id/course_id/syllabus/timestamp_file1.pdf",
  "syllabus_data": {
    "pdf_count": 3,
    "pdf_urls": [
      "user_id/course_id/syllabus/timestamp_file1.pdf",
      "user_id/course_id/syllabus/timestamp_file2.pdf",
      "user_id/course_id/syllabus/timestamp_file3.pdf"
    ],
    "extracted_at": "2026-02-07T..."
  }
}
```

## 🎨 UI Features

- **Drag & Drop** - Easy file upload
- **File Preview** - See all selected files
- **Remove Files** - Remove before upload
- **Progress Feedback** - Toast notifications for each step
- **Skip Option** - Can skip if no syllabus yet
- **Responsive** - Works on mobile and desktop

## 🚀 Ready to Test!

1. Create Storage bucket (`course-documents`)
2. Set up RLS policies
3. Create a course
4. Upload syllabus PDFs
5. See the extracted text in course data
