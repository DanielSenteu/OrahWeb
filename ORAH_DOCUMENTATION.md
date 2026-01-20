# ORAH - AI-Powered Academic Success Platform

## Overview

**ORAH** is an AI-powered task management and productivity platform specifically designed to help students achieve academic success. It transforms your academic workload—syllabi, assignments, exams, and lectures—into structured, actionable daily tasks with AI-guided scheduling and personalized work sessions.

## Core Philosophy

ORAH is built on the principle that **big goals are achieved through small, consistent daily actions**. By breaking down your entire semester into manageable daily tasks and providing AI support during work sessions, ORAH helps you stay on track without feeling overwhelmed.

---

## Key Features

### 🎯 AI-Powered Goal Planning
- Upload syllabi, assignments, or exam topics
- Orah (AI assistant) asks intelligent follow-up questions to understand your schedule, preferences, and deadlines
- Automatically generates day-by-day task breakdowns
- Creates realistic timelines based on your availability

### 📚 Four Academic Success Tools

#### 1. **Semester Tracking**
- Upload entire course syllabus (image or PDF)
- AI extracts all important dates, assignments, exams, and deadlines
- Generates comprehensive semester-long daily task plan
- Marks critical dates and distributes work evenly

#### 2. **Assignment Helper**
- Upload assignment details (image or PDF)
- Specify due date and available work days
- AI creates strategic task breakdown to complete on time
- Ensures steady progress without last-minute cramming

#### 3. **Exam Prep**
- Upload exam topics and study materials
- Specify exam date and current understanding level
- AI generates personalized study plan with daily review sessions
- Optimizes retention with spaced repetition principles

#### 4. **Lecture Notes**
- Paste lecture transcripts
- AI generates structured, comprehensive notes
- Organizes key concepts, definitions, and examples
- Makes review efficient and effective

### ⏱️ Advanced Work Session System
- **Smart Timer**: Countdown from estimated task duration
- **Persistent State**: Timer survives page refresh, browser close, and navigation
- **Break Management**: 
  - Automatic break eligibility after 25 minutes of continuous work
  - 15-minute break timer with audio/visual alert when break ends
  - Break resets continuous work counter
- **Progress Tracking**:
  - Time remaining in current session
  - Total time worked on task (across all sessions)
  - Continuous work time (for break eligibility)
- **Interactive Checkpoints**: Mark subtasks complete as you work
- **Early Completion**: Option to end task early with confirmation
- **Auto-Completion**: Task marked complete when timer hits zero

### 💬 Orah AI Work Assistant
- **Contextual Chat**: AI knows your goal, task, checkpoints, time worked, and completed tasks
- **Persistent Conversations**: Chat history saved per task
- **Real-Time Help**: Get unstuck, break down complex problems, and stay motivated
- **Swipeable Interface**: Easily switch between timer and chat views

### 📅 Multi-View Schedule System
- **Week View**: See tasks organized by day with time slots and task counts
- **Day View**: Detailed timeline (7 AM - 6 PM) with tasks positioned by time
- **Month View**: Calendar overview with task indicators on each day
- **Today Highlighting**: Current day clearly marked with green accent
- **Quick Navigation**: Arrow controls to move between time periods

### 📊 Dashboard & Task Management
- View all tasks for active goal
- See task completion status
- Quick access to work on any task
- Visual progress indicators
- Filter and organize by day, week, or month

### 🎨 Modern, Beautiful UI
- Dark theme optimized for long study sessions
- Smooth animations and transitions (Framer Motion)
- Rainbow gradient branding
- Green accent colors for success states
- Card-based layouts for clean organization
- Responsive design for desktop and mobile

---

## Complete Page Structure & URLs

### **Authentication Pages**

#### `/` - Landing Page
- **Purpose**: Marketing homepage with ORAH branding
- **Features**:
  - Hero section with animated rainbow ORAH logo
  - Value proposition and feature highlights
  - "Get Started for Free" CTA button
  - Feature cards with smooth animations
  - Professional, modern design
- **Actions**: Navigate to login/signup

#### `/login` - Login Page
- **Purpose**: User authentication
- **Features**:
  - Email/password login
  - Google OAuth login
  - Link to signup page
  - Error handling and validation
- **Actions**: Authenticate and redirect to onboarding or dashboard

#### `/signup` - Sign Up Page
- **Purpose**: New user registration
- **Features**:
  - Email/password registration
  - Google OAuth signup
  - Link to login page
  - Email validation
- **Actions**: Create account and redirect to onboarding

#### `/auth/callback` - OAuth Callback Handler
- **Purpose**: Handle OAuth redirects from Google
- **Features**:
  - Captures OAuth session
  - Sets authentication cookies
  - Redirects to appropriate page
- **Actions**: Completes OAuth flow

---

### **Onboarding Pages**

#### `/onboarding/what-if-you-wait` - Motivation Screen
- **Purpose**: First onboarding screen with motivational message
- **Features**:
  - Animated entrance
  - "What if you wait?" messaging
  - "Lock in with ORAH" CTA button
- **Actions**: Continue to next onboarding step

#### `/onboarding/thank-yourself` - Commitment Screen
- **Purpose**: Second onboarding screen reinforcing commitment
- **Features**:
  - "Your future self will thank you" messaging
  - Smooth transitions
  - Continue button
- **Actions**: Proceed to agent selection

#### `/onboarding/choose-agent` - Agent Selection
- **Purpose**: Choose interaction mode with ORAH
- **Features**:
  - **Text Agent** (Available): Chat-based interaction
  - **Voice Agent** (Coming Soon): Voice-based interaction
  - Selection cards with hover effects
- **Actions**: Redirect to Academic Hub

---

### **Core Application Pages**

#### `/academic-hub` - Academic Feature Selector
- **Purpose**: Main menu for choosing academic tool
- **Features**:
  - 4 large feature cards:
    1. **Semester Tracking** 🗓️
    2. **Assignment Helper** 📝
    3. **Exam Prep** 📚
    4. **Lecture Notes** 📖
  - Animated card hover effects
  - Icon-based visual design
  - Direct navigation to each tool
- **Actions**: Select academic tool to use

#### `/semester-tracking` - Semester Planning Tool
- **Purpose**: Upload syllabus and create semester-long plan
- **Features**:
  - File upload (images and PDFs)
  - Text paste option for manual entry
  - AI text extraction from uploaded files
  - Review screen showing extracted content
  - Conversational flow with Orah AI
  - Generates comprehensive semester plan
- **Actions**: 
  - Upload syllabus → Review → Chat with Orah → Create plan → Redirect to loading

#### `/assignment-helper` - Assignment Planning Tool
- **Purpose**: Upload assignment and create completion plan
- **Features**:
  - File upload (images and PDFs)
  - Text paste option
  - Specify due date and available work days
  - AI conversation to understand requirements
  - Generates strategic task breakdown
- **Actions**: 
  - Upload assignment → Review → Chat with Orah → Create plan → Redirect to loading

#### `/exam-prep` - Exam Study Planner
- **Purpose**: Upload exam topics and create study plan
- **Features**:
  - File upload (images and PDFs)
  - Text paste option
  - Specify exam date and understanding level
  - AI conversation for personalized planning
  - Generates optimized study schedule
- **Actions**: 
  - Upload topics → Review → Chat with Orah → Create plan → Redirect to loading

#### `/lecture-notes` - Lecture Note Generator
- **Purpose**: Convert lecture transcripts to structured notes
- **Features**:
  - Text paste for transcript
  - AI processes and structures content
  - Generates organized, comprehensive notes
  - Clean, readable formatting
- **Actions**: 
  - Paste transcript → Generate notes → View/download

#### `/assistant` - General Orah Chat
- **Purpose**: Direct conversation with Orah AI
- **Features**:
  - Full chat interface with Orah
  - Goal discovery conversation
  - Lighter, more exploratory tone
  - "Create my plan" button appears when Orah is ready
  - Chat history saved
- **Actions**: 
  - Chat about goals → Click "Create Plan" → Redirect to loading

#### `/plan-loading` - Plan Generation Loading Screen
- **Purpose**: Show progress while AI creates plan
- **Features**:
  - Loading animation
  - "Creating your dashboard..." message
  - Polls Supabase for newest goal creation
  - Waits for tasks to be generated
  - Sets new goal as active
- **Actions**: 
  - Automatically redirects to dashboard when plan is ready

#### `/dashboard` - Main Dashboard
- **Purpose**: View all tasks for active goal
- **Features**:
  - Welcome message with user's name
  - Active goal display
  - Today's tasks section
  - Task cards with:
    - Title
    - Estimated time
    - Day number
    - Completion status (checkbox)
    - "Work on Task" button
  - Tasks organized by date
  - Quick stats (completed/total)
  - Bottom navigation bar
- **Actions**: 
  - Toggle task completion
  - Click "Work on Task" → Navigate to task detail page
  - Navigate to other sections via bottom nav

#### `/schedule` - Calendar View
- **Purpose**: Visualize tasks across time periods
- **Features**:
  - **Three View Modes**:
    - **Day View**: Hourly timeline (7 AM - 6 PM)
    - **Week View**: 7-day overview with task lists per day
    - **Month View**: Full calendar grid with task indicators
  - Date navigation (previous/next arrows)
  - "Today" highlighting with green accent
  - Task count badges
  - Click tasks to view details
  - "Done" button to return to dashboard
  - Bottom navigation bar
- **Design Elements**:
  - Green-bordered tabs for view switching
  - Card-based task display
  - Blue vertical lines for task time indicators
  - Dots on calendar dates with tasks
  - Dark theme with clean spacing
- **Actions**: 
  - Switch view modes
  - Navigate between dates
  - Click task → Navigate to task detail page

#### `/goals` - Goals Manager (Home)
- **Purpose**: View all goals, switch active goal, create new goals
- **Features**:
  - List of all user goals (newest first)
  - Active goal highlighted with green badge
  - Goal cards show:
    - Title and summary
    - Duration (total days)
    - Daily time budget
    - Domain/category
    - Creation date
  - "Work on Goal" button on each goal
  - "+ Add New Goal" button
  - Bottom navigation bar
- **Actions**: 
  - Click "Work on Goal" → Set as active and go to dashboard
  - Click "Add New Goal" → Navigate to assistant
  - View all past and current goals

#### `/tasks/[id]` - Task Detail & Work Session
- **Purpose**: Work on a specific task with timer and AI support
- **Features**:

  **Initial View (Task Overview)**:
  - Task title and description
  - Estimated time
  - Deliverable and success metrics
  - Read-only checkpoints (show completion status)
  - "Work on Task" button

  **Work Session View**:
  - **Large Timer Display**:
    - Countdown from estimated minutes
    - Shows time remaining
    - Shows total time worked
    - Shows continuous work time (for break eligibility)
  
  - **Timer Controls**:
    - Start/Resume button
    - Pause button
    - "Take a Break" button (enabled after 25 mins continuous work)
    - "End Early" button (confirms task completion)
  
  - **Break Mode**:
    - 15-minute break countdown
    - "Break Time 🌴" indicator
    - Different visual styling
    - Audio/visual alert when break ends
    - "Break Over - Resume Work" button
  
  - **Interactive Checkpoints**:
    - Click to toggle complete/incomplete
    - Visual progress bar
    - Completion counter
  
  - **"Work with Orah" Button**:
    - Opens AI chat in slide-up modal
    - Back button to return to timer
    - Timer continues running in background

  **Orah Work Chat View**:
  - Full-screen chat interface
  - Persistent conversation history per task
  - AI has context of:
    - Overall goal
    - Current task details
    - All checkpoints
    - Time remaining and worked
    - Previously completed tasks
  - Smooth slide-up animation
  - Back to timer button
  - Auto-scroll to latest message

- **Persistence**:
  - Timer state saved to localStorage
  - Survives page refresh, browser close, navigation
  - Chat history saved per task
  - Resumes timer if it was running

- **Completion**:
  - Auto-complete when timer hits zero
  - Manual complete via "End Early" (with confirmation)
  - Clears timer and chat from localStorage
  - Marks task as completed in database
  - Redirects to dashboard

- **Actions**: 
  - Start/pause/resume timer
  - Take breaks
  - Toggle checkpoints
  - Chat with Orah for help
  - Complete task early or let timer finish

---

### **API Routes**

#### `/api/create-plan` - Plan Generation Proxy
- **Purpose**: Proxy requests to Supabase Edge Function
- **Method**: POST
- **Auth**: Requires valid session token
- **Payload**: 
  - `messages`: Conversation history with Orah
  - `academicType`: Type of plan (semester, assignment, exam)
  - `syllabusContent`, `assignmentContent`, `examContent`: Extracted text
  - `metadata`: Additional context
- **Response**: 
  - Creates goal and tasks in database
  - Sets active goal
  - Returns success status

#### `/api/vision/extract` - Image Text Extraction
- **Purpose**: Extract text from images using OpenAI Vision API
- **Method**: POST
- **Payload**: 
  - `base64Image`: Image data
  - `prompt`: Extraction instructions
  - `mimeType`: Image type (PNG, JPG, WEBP)
- **Response**: 
  - `extractedText`: Text content from image

#### `/api/pdf/extract` - PDF Text Extraction
- **Purpose**: Extract text from PDF files
- **Method**: POST
- **Uses**: `unpdf` library for server-side extraction
- **Payload**: 
  - `base64Pdf`: PDF data
- **Response**: 
  - `extractedText`: Text content from PDF

#### `/api/task-assistant` - Task Work Chat
- **Purpose**: AI chat assistance during task work
- **Method**: POST
- **Model**: GPT-4o-mini
- **Payload**: 
  - `messages`: Chat history
  - `context`: Comprehensive task context (goal, task, checkpoints, timer state, completed tasks)
- **Response**: 
  - `reply`: AI response from Orah

#### `/api/lecture-notes` - Lecture Note Generation
- **Purpose**: Generate structured notes from transcripts
- **Method**: POST
- **Status**: Placeholder for future implementation
- **Payload**: 
  - `transcript`: Lecture text
- **Response**: 
  - `notes`: Structured note content

---

## Navigation Structure

### Bottom Navigation Bar (Appears on most pages)
- **🏠 Home** → `/goals` - View all goals
- **📅 Schedule** → `/schedule` - Calendar view
- **💬 Orah** → `/assistant` - Chat with AI
- **📊 Dashboard** → `/dashboard` - Today's tasks

---

## Technical Stack

### Frontend
- **Framework**: Next.js 16 (App Router)
- **UI Library**: React 19
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Animations**: Framer Motion
- **State Management**: Zustand (lightweight)
- **Data Fetching**: @tanstack/react-query
- **Local Storage**: Timer state, chat history, session tracking

### Backend
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth (Email/Password + Google OAuth)
- **Edge Functions**: Supabase serverless functions
- **AI**: OpenAI API (GPT-4o for planning, GPT-4o-mini for chat)
- **Vision**: OpenAI Vision API for image/PDF processing
- **PDF Processing**: `unpdf` library for server-side extraction

### Key Libraries
- `openai`: AI completions and vision
- `unpdf`: PDF text extraction
- `framer-motion`: Animations
- `react-hot-toast`: Notifications

---

## Data Models

### Core Tables

#### `user_goals`
- Goal summary and details
- Total days and daily time budget
- Domain/category
- Creation timestamp

#### `task_items`
- Task title, description, notes
- Estimated minutes
- Scheduled date and time
- Completion status
- Deliverable and success metric
- Day number in plan

#### `task_checklist_items`
- Checkpoint content
- Position/order
- Completion status
- Linked to task

#### `user_preferences`
- Active goal ID
- User settings
- Preferences and configuration

---

## Supabase Edge Functions

### `create_goal_plan`
- **Purpose**: Generate personalized academic plans
- **Input**: 
  - Conversation history
  - Academic type (semester/assignment/exam)
  - Extracted content from files
  - User metadata
- **Process**:
  - Uses GPT-4o with specialized system prompts per academic type
  - Generates day-by-day task breakdown
  - Creates checkpoints for each task
  - Considers user's schedule and preferences
- **Output**: 
  - Creates goal in `user_goals`
  - Creates all tasks in `task_items`
  - Creates checkpoints in `task_checklist_items`
  - Returns success confirmation

### `create_lecture_notes` (Planned)
- **Purpose**: Generate structured notes from lecture transcripts
- **Status**: To be implemented

---

## User Flows

### 1. **New User Onboarding**
```
Landing Page → Sign Up → Login → 
Onboarding (What if you wait?) → 
Onboarding (Thank yourself) → 
Choose Agent → Academic Hub
```

### 2. **Create Semester Plan**
```
Academic Hub → Semester Tracking → 
Upload Syllabus (Image/PDF) → 
Review Extracted Content → 
Chat with Orah (Answer questions) → 
Plan Loading → Dashboard
```

### 3. **Work on Task**
```
Dashboard → Click "Work on Task" → 
Task Detail Page → Click "Work on Task" → 
Work Session (Timer starts) → 
Mark Checkpoints → 
(Optional) Chat with Orah → 
Complete when timer ends → Dashboard
```

### 4. **Take a Break**
```
Work Session (Work 25+ mins) → 
"Take a Break" (enabled) → 
Break Timer (15 mins) → 
Alert when break ends → 
"Break Over" → Resume Work
```

### 5. **View Schedule**
```
Dashboard → Click Schedule icon → 
Schedule Page → 
Switch between Day/Week/Month views → 
Click task → Task Detail Page
```

### 6. **Switch Goals**
```
Dashboard → Click Home icon → 
Goals Page → 
Click "Work on Goal" on different goal → 
Redirects to Dashboard with new active goal
```

---

## Unique Features & Innovations

### 🧠 Contextual AI Understanding
- Orah doesn't just chat—it understands your entire academic context
- Knows your overall goals, current progress, and what you've completed
- Provides relevant, actionable advice based on where you are in your journey

### ⏱️ True Timer Persistence
- Most web timers reset on refresh—ORAH's survives everything
- Works even if you close the browser or navigate away
- Break timers persist too—your break is safe!

### 📚 Academic-Specific Intelligence
- Specialized AI prompts for different academic scenarios
- Understands semester planning vs. assignment completion vs. exam prep
- Generates realistic, achievable daily tasks

### 🎯 Checkpoint-Based Progress
- Every task broken into subtasks
- Clear progress indicators
- Satisfaction of checking things off
- Helps you see exactly where you are

### 💬 Persistent Task Conversations
- Each task has its own conversation history with Orah
- Return to previous work sessions and context is preserved
- Build on previous discussions

### 🎨 Beautiful, Distraction-Free UI
- Dark theme reduces eye strain during long study sessions
- Smooth animations keep experience delightful
- Card-based layouts focus attention
- Green accent for positive reinforcement

---

## File Upload & Processing

### Supported File Types
- **Images**: PNG, JPG, JPEG, WEBP (via OpenAI Vision API)
- **PDFs**: Any PDF document (via `unpdf` library)
- **Text**: Direct paste for manual entry

### Processing Flow
1. User selects file or pastes text
2. File converted to base64
3. Sent to appropriate API route:
   - Images → `/api/vision/extract` (OpenAI Vision)
   - PDFs → `/api/pdf/extract` (unpdf)
4. Text extracted and returned
5. User reviews extracted content
6. Proceeds to AI conversation

### Validation
- File size limits enforced
- MIME type validation
- Error handling for corrupt files
- User-friendly error messages

---

## Color Scheme & Branding

### Primary Colors
- **Background**: Dark theme (`orah-bg-dark`)
- **Surface**: Card backgrounds (`orah-surface`)
- **Blue**: Primary actions (`orah-blue`)
- **Green**: Success, active states (`orah-green`)
- **Text**: White primary, muted grays for secondary

### Rainbow Effect
- ORAH logo uses animated rainbow gradient
- Smooth color transitions
- Eye-catching brand identity

### Visual Language
- Card-based layouts
- Rounded corners (8-16px radius)
- Subtle shadows
- Smooth hover transitions
- Green borders for active/selected states

---

## Responsive Design

- **Mobile-First**: Optimized for phone usage
- **Desktop-Ready**: Scales beautifully to larger screens
- **Breakpoints**: Responsive grid systems
- **Touch-Friendly**: Large tap targets, swipe gestures

---

## Session Management & Security

### Authentication
- Supabase Auth for user management
- JWT-based session tokens
- Secure cookie handling
- OAuth integration with Google

### Protected Routes
- Middleware checks authentication
- Redirects to login if unauthenticated
- Preserves intended destination

### Data Privacy
- User data isolated per account
- Secure API routes
- Environment variables for sensitive keys
- No data shared between users

---

## Performance Optimizations

### Caching
- React Query for data fetching
- Smart cache invalidation
- Optimistic updates

### Code Splitting
- Dynamic imports for heavy components
- Route-based code splitting
- Lazy loading

### Persistence
- LocalStorage for client-side state
- Reduces unnecessary API calls
- Instant UI updates

---

## Future Enhancements (Roadmap)

### Voice Agent
- Voice-based interaction with Orah
- Hands-free work sessions
- Speech-to-text for notes

### Collaboration Features
- Share goals with study groups
- Collaborative task completion
- Group study sessions

### Analytics Dashboard
- Time tracking insights
- Productivity trends
- Study habit analysis

### Mobile Apps
- Native iOS app
- Native Android app
- Offline mode

### Additional Tools
- Flashcard generator from notes
- Quiz generator from lecture content
- Citation manager for research papers
- Grade calculator and tracker

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account
- OpenAI API key

### Environment Variables
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key
OPENAI_API_KEY=your_openai_key
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### Installation
```bash
npm install
npm run dev
```

### Database Setup
1. Create Supabase project
2. Run migration scripts for tables
3. Set up Row Level Security policies
4. Deploy Edge Functions

---

## Support & Documentation

For questions, feature requests, or bug reports, please refer to the project repository or contact the development team.

---

**ORAH** - Transform your academic goals into daily wins. 🎓✨


