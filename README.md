# Orah — AI-Powered Academic Study Platform

> Full-stack web application that centralizes course management, AI-generated
> lecture notes, exam preparation, and a per-course Claude AI assistant into
> a single academic productivity hub.

---

## Overview

Orah helps university students stay on top of their coursework by combining
deadline tracking, lecture transcription, and AI-driven study planning in one
place. Every feature is built around the course — assignments, exams, notes,
and an AI assistant all live inside the course they belong to.

---

## Key Features

**AI-Powered Lecture Notes**
- Records lectures directly in the browser using the MediaRecorder API
- Uploads audio to Supabase Storage (handles files up to 1 GB)
- Transcribes via AssemblyAI — engineered to handle 3-hour recordings by
  persisting the transcription job ID to the database, surviving Supabase
  Edge Function execution limits and re-triggering from where it left off
- Generates structured notes from the transcript using GPT-4

**Per-Course Claude AI Assistant**
- Embedded chat interface inside each course powered by Claude claude-sonnet-4-5
- Implements an agentic tool-use loop — Claude autonomously calls tools to
  look up real student data before responding
- Tools: `list_upcoming_deadlines`, `list_assignments`, `list_exams`, `get_lecture_notes`
- All tool calls are executed server-side with the user's Supabase auth token

**Deadline-Driven Timeline**
- Aggregates all assignments and exams into a chronological timeline grouped
  by urgency: Overdue · Today · Tomorrow · This Week · Next Week · Later
- Urgency-aware UI with color-coded indicators and days-remaining chips

**Exam Preparation**
- AI-generated study plans broken down by day based on exam date and topics
- Flashcard quiz generation from uploaded course materials
- Topic-specific notes extracted from lecture transcripts

**Semester Planning**
- Personalized study schedules generated from syllabus content
- Day-by-day task navigator with completion progress tracking

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Auth & Database | Supabase (PostgreSQL, Row Level Security) |
| File Storage | Supabase Storage |
| Background Jobs | Supabase Edge Functions (Deno) |
| AI — Notes & Plans | OpenAI GPT-4 |
| AI — Course Assistant | Anthropic Claude claude-sonnet-4-5 |
| Audio Transcription | AssemblyAI |
| Styling | CSS Modules, custom design system |

---

## Architecture Highlights

**Resilient long-running transcription pipeline**
Supabase Edge Functions are killed after ~150 seconds, but transcribing a
3-hour lecture takes 15–30 minutes. The worker immediately persists the
AssemblyAI job ID to the database on submission. If the function is killed,
the client re-triggers the worker every 160 seconds. The worker detects the
saved ID, skips re-submission, and resumes polling — guaranteeing completion
regardless of how many times the function restarts.

**Agentic AI with real course data**
The course AI assistant doesn't hallucinate. Before answering questions about
deadlines or assignments, Claude executes tool calls that query the student's
actual Supabase data server-side, then synthesizes a response with accurate,
personalized information.

**Course-centric information architecture**
The entire app is structured around courses. Each course has a persistent
sidebar with live badge counts, a deadline timeline, and an embedded AI
assistant — eliminating context switching across separate sections.

---

## Local Development

```bash
npm install
cp .env.example .env.local
# Add: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#      OPENAI_API_KEY, ANTHROPIC_API_KEY, ASSEMBLYAI_API_KEY
npm run dev
```
