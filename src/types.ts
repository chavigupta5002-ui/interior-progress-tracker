export type Role = 'admin' | 'project_manager' | 'viewer'

export interface Profile {
  id: string
  display_name: string
  role: Role
  created_at: string
}

export type PropertyType = 'homestay' | 'hotel'

export interface Property {
  id: string
  name: string
  description: string | null
  property_type: PropertyType
  deadline: string | null
  created_by: string
  created_at: string
}

export interface Entry {
  id: string
  property_id: string
  photo_paths: string[]
  note: string
  show_in_report: boolean
  created_by: string
  uploader_name: string
  created_at: string
}

export interface PropertyAccess {
  property_id: string
  profile_id: string
  granted_by: string
  created_at: string
}

// Scope of Work tree: level 1 = Task (parent_id null), level 2 = Subtask
// (parent must be a level-1 row), level 3 = Sub-subtask (parent must be a
// level-2 row). The database enforces this hierarchy.
export type ScopeItemLevel = 1 | 2 | 3

export interface ScopeItem {
  id: string
  property_id: string
  parent_id: string | null
  level: ScopeItemLevel
  title: string
  position: number
  deadline: string | null
  checked_by: string | null
  checked_at: string | null
  created_by: string
  created_at: string
}
