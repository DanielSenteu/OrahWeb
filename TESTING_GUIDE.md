# ORAH Academic Platform - Testing Guide

## 🧪 How to Test the New Academic Features

### Prerequisites
1. Make sure `npm run dev` is running
2. Ensure all environment variables are set in `.env.local`
3. **IMPORTANT**: Update your Supabase edge function following `EDGE_FUNCTION_UPDATE_GUIDE.md`

---

## Test 1: Academic Hub

### Steps:
1. Navigate to http://localhost:3001
2. Click "Get Started Free"
3. Sign up or log in
4. Go through onboarding animations
5. You should land on the Academic Hub

### Expected Result:
- See 4 feature cards:
  - 📚 Semester Tracking
  - 📝 Assignment Helper
  - 🎯 Exam Prep
  - 🎓 Lecture Notes
- Each card has a gradient icon, description, and "Get Started →"
- Clean, modern UI with animations

---

## Test 2: Semester Tracking

### Steps:
1. From Academic Hub, click "Semester Tracking"
2. **Option A - Upload Syllabus Image:**
   - Take a photo of a syllabus or find one online
   - Drag and drop or click to upload
   - Wait for Vision API to extract text
3. **Option B - Paste Text:**
   - Copy syllabus text
   - Paste in the text area
   - Click "Continue with Text"
4. Answer Orah's questions:
   - Best study times
   - Hours per day
   - Specific concerns
5. Click "Create My Semester Plan"
6. Wait for loading screen
7. Get redirected to dashboard

### Expected Result:
- Syllabus is correctly extracted
- Orah asks relevant questions about study preferences
- Plan is created with tasks spread across semester
- Dashboard shows daily tasks
- Important dates are marked

### Sample Syllabus Text (if you don't have one):
```
PSYCH 101 - Introduction to Psychology
Spring 2025

Week 1-2: Introduction & History
Week 3-4: Research Methods
Week 5: Midterm Exam (Feb 15)
Week 6-7: Cognitive Psychology
Week 8-9: Developmental Psychology
Week 10: Midterm 2 (March 20)
Week 11-12: Social Psychology
Week 13-14: Abnormal Psychology
Week 15: Review
Final Exam: April 25

Assignments:
- Research Paper: Due March 1
- Case Study Analysis: Due April 10
```

---

## Test 3: Assignment Helper

### Steps:
1. From Academic Hub, click "Assignment Helper"
2. **Upload or paste assignment:**
   - Use a real assignment or sample text below
3. Enter due date (e.g., 2 weeks from today)
4. Optionally enter days to work on it
5. Answer Orah's questions about concerns
6. Click "Create My Assignment Plan"
7. Check dashboard

### Expected Result:
- Assignment is parsed correctly
- Due date is respected
- Tasks are broken into phases:
  - Research
  - Outline
  - Draft
  - Revision
  - Final
- Each phase has clear deliverables

### Sample Assignment Text:
```
English 102 - Research Paper

Write a 10-page research paper analyzing the impact of social media on mental health in teenagers.

Requirements:
- Minimum 10 scholarly sources
- APA format
- Include abstract and works cited
- Address both positive and negative impacts
- Propose evidence-based solutions

Grading:
- Thesis & argument: 30%
- Research quality: 30%
- Writing & organization: 25%
- Citations & formatting: 15%
```

---

## Test 4: Exam Prep

### Steps:
1. From Academic Hub, click "Exam Prep"
2. **Upload or enter exam topics:**
   - Use sample topics below
3. Enter exam date (e.g., 2 weeks from today)
4. Select understanding level:
   - Beginner
   - Intermediate
   - Advanced
5. Answer Orah's questions
6. Click "Create My Study Plan"
7. Check dashboard

### Expected Result:
- Topics are organized clearly
- Study plan uses spaced repetition
- Early days: concept learning
- Middle days: practice problems
- Final days: review and mock exams
- Light review before exam

### Sample Exam Topics:
```
Biology 201 - Midterm Exam

Topics Covered:
1. Cell Structure and Function
   - Organelles and their roles
   - Membrane transport
2. Cellular Respiration
   - Glycolysis
   - Krebs cycle
   - Electron transport chain
3. Photosynthesis
   - Light reactions
   - Calvin cycle
4. Cell Division
   - Mitosis
   - Meiosis
5. Genetics
   - Mendelian genetics
   - DNA structure and replication
   - Protein synthesis

Exam Format:
- 50 multiple choice (50%)
- 5 short answer (30%)
- 2 essay questions (20%)
```

---

## Test 5: Lecture Notes

### Steps:
1. From Academic Hub, click "Lecture Notes"
2. Enter course name (optional): "Biology 101"
3. Paste lecture transcript (use sample below)
4. Click "Generate Notes"
5. Review generated notes

### Expected Result:
- Notes have clear sections
- Key concepts are highlighted
- Definitions are extracted
- Key takeaways are listed
- Can copy to clipboard
- Can download as TXT

### Sample Lecture Transcript:
```
Okay class, today we're going to talk about cellular respiration. This is one of the most important processes in biology because it's how our cells produce energy.

So cellular respiration happens in three main stages. The first stage is glycolysis, which occurs in the cytoplasm. During glycolysis, glucose, which is a six-carbon sugar, gets broken down into two molecules of pyruvate, which are three-carbon molecules. This process produces a small amount of ATP - about 2 ATP molecules.

The second stage is the Krebs cycle, also called the citric acid cycle. This happens in the mitochondrial matrix. The pyruvate from glycolysis enters the mitochondria and goes through this cycle, producing more ATP and also generating electron carriers called NADH and FADH2.

The third and final stage is the electron transport chain, which is where most of the ATP is actually produced. This happens on the inner membrane of the mitochondria. The NADH and FADH2 from earlier stages donate their electrons, and through a series of protein complexes, this creates a proton gradient that drives ATP synthesis. In total, one glucose molecule can produce around 30-32 ATP molecules through cellular respiration.

The overall equation is: C6H12O6 + 6O2 → 6CO2 + 6H2O + ATP

Remember, this process requires oxygen, which is why it's called aerobic respiration. Without oxygen, cells can only do glycolysis, which produces much less energy.

Any questions?
```

---

## Test 6: Dashboard Integration

### After Creating Any Plan:

1. **Check Dashboard:**
   - Navigate to `/dashboard`
   - Should see today's tasks
   - Each task shows time estimate and day number

2. **Click "Work on Task":**
   - Should open task detail page
   - See full description, deliverable, success metric
   - See checkpoints listed

3. **Click "Work on task with Orah":**
   - Opens chat interface
   - Can chat about the task
   - Can toggle checkpoints on/off
   - Chat is task-specific

4. **Check Schedule View:**
   - Navigate to `/schedule`
   - See tasks organized by date
   - Can click "Work on Task" from schedule too

---

## Test 7: Home Icon & Multiple Goals

1. **Click Home Icon (🏠):**
   - Should see list of all your goals
   - Active goal has green badge
   - Can click "Set Active" on other goals

2. **Add New Goal:**
   - Click "+ Add New Goal"
   - Goes to `/assistant` or academic hub
   - Create another semester/assignment/exam plan

3. **Switch Active Goal:**
   - Go back to home
   - Set a different goal as active
   - Dashboard should now show that goal's tasks

---

## Common Issues & Solutions

### Vision API Not Working
- **Error**: "Failed to extract text from image"
- **Solution**: Check OPENAI_API_KEY in `.env.local`
- **Solution**: Make sure image is under 10MB
- **Solution**: Use supported formats (PNG, JPG, WEBP)

### Edge Function Timeout
- **Error**: "Server error" when creating plan
- **Solution**: Edge function might be taking too long
- **Solution**: Check Supabase logs
- **Solution**: Make sure you updated edge function per guide

### No Tasks on Dashboard
- **Error**: Dashboard shows "No tasks for this day"
- **Solution**: Check if goal was created successfully
- **Solution**: Go to home icon, verify active goal
- **Solution**: Check Supabase `task_items` table

### Plan Not Redirecting
- **Error**: Stuck on loading screen
- **Solution**: Check browser console for errors
- **Solution**: Manually navigate to `/dashboard`
- **Solution**: Check if tasks were created in database

---

## Browser Console Checks

Open browser DevTools (F12) and check:

1. **Network Tab:**
   - `/api/vision/extract` - Should return 200 with extractedText
   - `/api/orah-assistant` - Should return 200 with reply
   - `/api/create-plan` - Should return 200 with goalId
   - Edge function call - Check CORS, auth headers

2. **Console Tab:**
   - Look for auth errors
   - Check session token logs
   - Look for Vision API errors
   - Check for task creation logs

---

## Success Criteria Checklist

- [ ] Can upload syllabus image and extract text
- [ ] Can create semester plan with proper dates
- [ ] Can upload assignment and get phase breakdown
- [ ] Can create exam study schedule with spaced repetition
- [ ] Can paste transcript and get structured notes
- [ ] Notes can be copied and downloaded
- [ ] Dashboard shows tasks for active goal
- [ ] Can work on tasks with AI chat
- [ ] Can toggle checkpoints
- [ ] Home icon shows all goals
- [ ] Can switch between active goals
- [ ] Can add multiple goals of different types
- [ ] Schedule view works correctly
- [ ] All navigation works smoothly

---

## Performance Testing

### Large Files:
- Try uploading a 20+ page syllabus (might need to increase limits)
- Test with long lecture transcripts (5000+ words)
- Check Vision API response times

### Multiple Goals:
- Create 5+ different goals
- Switch between them
- Verify performance doesn't degrade

### Edge Cases:
- Upload corrupted image
- Paste garbage text
- Enter invalid dates (past dates, far future)
- Skip optional fields

---

## 📊 Expected Timeline for Testing

- Academic Hub: **2 minutes**
- Semester Tracking: **5-7 minutes**
- Assignment Helper: **4-5 minutes**
- Exam Prep: **4-5 minutes**
- Lecture Notes: **3 minutes**
- Dashboard Integration: **5 minutes**
- Multiple Goals: **5 minutes**

**Total Testing Time: ~30-35 minutes**

---

## 🎉 When Everything Works

You should be able to:
1. Sign up and reach academic hub
2. Upload a syllabus and get a complete semester plan
3. Upload an assignment and get a phase-based breakdown
4. Enter exam topics and get an optimized study schedule
5. Paste a transcript and get beautiful structured notes
6. See all tasks on dashboard organized by day
7. Work on tasks with AI assistance
8. Check off checkpoints as you complete them
9. Switch between multiple goals
10. Access everything from a clean, intuitive interface

**ORAH is ready to make students academic weapons! 🎓💪**



