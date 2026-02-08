# Testing Checklist - Syllabus Upload

## ✅ Pre-Test Checklist

Before testing, make sure:

1. **Storage Bucket Created** ✅
   - Bucket name: `course-documents`
   - Private (not public)
   - File size limit: 10MB+
   - MIME types: `application/pdf`

2. **RLS Policies Set Up** ⚠️ **IMPORTANT**
   - Go to SQL Editor
   - Run the policies from `SYLLABUS_UPLOAD_SETUP.md`
   - Or create them in Dashboard → Storage → Policies

3. **Database Schema** ✅
   - Run `COURSES_SCHEMA.sql` if you haven't already
   - Make sure `courses` table exists

4. **PDF Extraction API** ✅
   - Should already exist at `/api/pdf/extract`
   - Uses `unpdf` package

## 🧪 Testing Steps

### Test 1: Create Course
1. Go to `/courses`
2. Click "Add Course"
3. Fill in:
   - Course name: "Test Course"
   - Professor: "Dr. Test" (optional)
   - Semester/Year (optional)
4. Click "Create Course"
5. **Expected:** Redirects to `/courses/[id]/syllabus`

### Test 2: Upload Single PDF
1. On syllabus upload page
2. Click "Click to upload" or drag & drop a PDF
3. **Expected:**
   - File appears in "Selected Files" list
   - Shows file name and size
   - Can remove file if needed

### Test 3: Upload Multiple PDFs
1. Upload 2-3 PDF files
2. **Expected:**
   - All files show in list
   - Counter shows "Selected Files (2/3)" or "(3/3)"
   - Can remove individual files

### Test 4: Process Syllabus
1. With PDFs selected, click "Upload & Process"
2. **Expected:**
   - Toast notifications for each PDF extraction
   - "Extracting text from file1.pdf (1/3)..."
   - "Extracted text from file1.pdf"
   - Final: "Syllabus uploaded and processed successfully!"
   - Redirects to course dashboard

### Test 5: Skip Option
1. Go back and create another course
2. On syllabus upload page, click "Skip for Now"
3. **Expected:** Redirects to course dashboard (without syllabus)

### Test 6: Verify Data
1. Go to Supabase Dashboard → Table Editor → `courses`
2. Find your test course
3. Check:
   - `syllabus_text` has extracted text
   - `syllabus_file_url` has first PDF path
   - `syllabus_data` JSON has all PDF URLs

### Test 7: Storage Verification
1. Go to Supabase Dashboard → Storage → `course-documents`
2. **Expected:**
   - See folder structure: `{user_id}/{course_id}/syllabus/`
   - PDF files are there

## 🐛 Common Issues

### Issue: "Failed to upload PDF"
**Fix:** Check RLS policies are set up correctly

### Issue: "Failed to extract text from PDF"
**Fix:** 
- Check `/api/pdf/extract` route exists
- Check `unpdf` package is installed: `npm install unpdf`

### Issue: "Bucket not found"
**Fix:** Make sure bucket name is exactly `course-documents`

### Issue: Can't see files in Storage
**Fix:** Check RLS policies allow SELECT for authenticated users

## ✅ Success Criteria

- ✅ Can create course
- ✅ Can upload 1-3 PDFs
- ✅ Text extracted from all PDFs
- ✅ PDFs saved to Storage
- ✅ Course updated with syllabus data
- ✅ Can skip if no syllabus
- ✅ Redirects to dashboard after upload

## 🚀 Ready to Test!

Go ahead and test! If you hit any errors, check the console logs and let me know what you see.
