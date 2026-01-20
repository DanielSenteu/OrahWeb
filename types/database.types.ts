// Database types based on ORAH schema
export interface Database {
  public: {
    Tables: {
      user_goals: {
        Row: {
          id: string
          user_id: string
          summary: string | null
          current_summary: string | null
          total_days: number
          daily_minutes_budget: number
          domain: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          summary?: string | null
          current_summary?: string | null
          total_days: number
          daily_minutes_budget: number
          domain?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          summary?: string | null
          current_summary?: string | null
          total_days?: number
          daily_minutes_budget?: number
          domain?: string | null
          created_at?: string
        }
      }
      task_items: {
        Row: {
          id: string
          user_id: string
          goal_id: string
          title: string
          notes: string | null
          estimated_minutes: number
          scheduled_date_key: string
          scheduled_time: string | null
          deliverable: string | null
          metric: string | null
          difficulty: number | null
          weekly_objective: string | null
          tags_csv: string | null
          status: string
          is_completed: boolean
          day_number: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          goal_id: string
          title: string
          notes?: string | null
          estimated_minutes: number
          scheduled_date_key: string
          scheduled_time?: string | null
          deliverable?: string | null
          metric?: string | null
          difficulty?: number | null
          weekly_objective?: string | null
          tags_csv?: string | null
          status?: string
          is_completed?: boolean
          day_number: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          goal_id?: string
          title?: string
          notes?: string | null
          estimated_minutes?: number
          scheduled_date_key?: string
          scheduled_time?: string | null
          deliverable?: string | null
          metric?: string | null
          difficulty?: number | null
          weekly_objective?: string | null
          tags_csv?: string | null
          status?: string
          is_completed?: boolean
          day_number?: number
          created_at?: string
        }
      }
      task_checklist_items: {
        Row: {
          id: string
          task_id: string
          user_id: string
          content: string
          is_completed: boolean
          position: number
          created_at: string
        }
        Insert: {
          id?: string
          task_id: string
          user_id: string
          content: string
          is_completed?: boolean
          position: number
          created_at?: string
        }
        Update: {
          id?: string
          task_id?: string
          user_id?: string
          content?: string
          is_completed?: boolean
          position?: number
          created_at?: string
        }
      }
      user_preferences: {
        Row: {
          user_id: string
          active_goal_id: string | null
        }
        Insert: {
          user_id: string
          active_goal_id?: string | null
        }
        Update: {
          user_id?: string
          active_goal_id?: string | null
        }
      }
    }
  }
}

export type Goal = Database['public']['Tables']['user_goals']['Row']
export type Task = Database['public']['Tables']['task_items']['Row']
export type ChecklistItem = Database['public']['Tables']['task_checklist_items']['Row']
export type UserPreferences = Database['public']['Tables']['user_preferences']['Row']

