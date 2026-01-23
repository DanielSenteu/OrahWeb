import type { Metadata } from "next";
import { Inter, Syne } from "next/font/google";
import "./globals.css";
import StructuredData from "@/components/seo/StructuredData";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://orahai.app'),
  title: {
    default: "ORAH - AI-Powered Academic Planning & Productivity Tool | Beat Procrastination",
    template: "%s | ORAH"
  },
  description: "ORAH is the ultimate AI-powered academic planning tool that transforms your syllabi, assignments, and exams into structured daily tasks. Beat procrastination, stay organized, and achieve academic success with intelligent semester planning, assignment breakdowns, exam prep schedules, and lecture note generation. Free productivity tool for students.",
  keywords: [
    // Core Brand
    "ORAH", "Orah", "ORAH AI", "Orah app", "ORAH academic", "Orah productivity",
    
    // Academic Planning
    "academic planning", "semester planner", "course planner", "study planner", "academic calendar", "semester schedule", "academic organizer", "student planner", "college planner", "university planner",
    
    // Assignment Management
    "assignment helper", "assignment planner", "homework planner", "project planner", "essay planner", "paper planner", "assignment breakdown", "task breakdown", "assignment organizer",
    
    // Exam Preparation
    "exam prep", "exam preparation", "study schedule", "exam planner", "test prep", "final exam prep", "midterm prep", "spaced repetition", "study plan", "exam study guide",
    
    // Lecture Notes
    "lecture notes", "note taking", "study notes", "class notes", "lecture transcription", "note organizer", "academic notes", "study materials",
    
    // Productivity & Organization
    "productivity tool", "task management", "time management", "study organization", "academic organization", "student productivity", "academic productivity", "study tool", "productivity app", "organization tool",
    
    // Procrastination & Motivation
    "beat procrastination", "stop procrastinating", "procrastination help", "overcome procrastination", "productivity motivation", "study motivation", "academic motivation", "goal achievement", "habit building",
    
    // AI & Technology
    "AI planner", "AI study tool", "AI productivity", "artificial intelligence planner", "smart planner", "intelligent scheduling", "AI academic assistant", "AI study assistant",
    
    // Student Life
    "student tool", "college student", "university student", "student success", "academic success", "study success", "student organization", "student productivity app",
    
    // Competitors & Alternatives
    "Notion alternative", "Todoist alternative", "Asana alternative", "Trello alternative", "Google Calendar alternative", "MyStudyLife alternative", "iStudiez alternative", "StudyBlue alternative", "Quizlet alternative", "Anki alternative",
    
    // Specific Features
    "syllabus parser", "syllabus planner", "deadline tracker", "grade tracker", "GPA planner", "course schedule", "class schedule", "study schedule maker", "daily task planner", "weekly planner",
    
    // Learning Methods
    "spaced repetition", "active recall", "study techniques", "learning strategies", "study methods", "effective studying", "study tips", "academic tips",
    
    // Time Management
    "time blocking", "pomodoro", "study timer", "focus timer", "time tracking", "schedule optimization", "workload balance",
    
    // Free Tools
    "free planner", "free study tool", "free productivity app", "free academic tool", "free student app"
  ],
  authors: [{ name: "ORAH" }],
  creator: "ORAH",
  publisher: "ORAH",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://orahai.app",
    siteName: "ORAH",
    title: "ORAH - AI-Powered Academic Planning & Productivity Tool",
    description: "Transform your academic life with ORAH. AI-powered semester planning, assignment breakdowns, exam prep schedules, and lecture notes. Beat procrastination and achieve academic success.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ORAH - AI-Powered Academic Planning Tool",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ORAH - AI-Powered Academic Planning & Productivity Tool",
    description: "Transform your academic life with AI-powered planning. Beat procrastination, stay organized, and achieve success.",
    images: ["/twitter-image.png"],
    creator: "@orahai",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    // Add your verification codes when available
    // google: "your-google-verification-code",
    // yandex: "your-yandex-verification-code",
    // yahoo: "your-yahoo-verification-code",
  },
  alternates: {
    canonical: "https://orahai.app",
  },
  category: "Education",
  icons: {
    icon: [
      { url: '/icon.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: [
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${syne.variable} antialiased`}
        style={{ fontFamily: 'var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif' }}
      >
        <StructuredData />
        {children}
      </body>
    </html>
  );
}
