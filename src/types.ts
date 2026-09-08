export type Role = 'admin' | 'project_manager' | 'viewer'

export interface Profile {
  id: string
  display_name: string
  role: Role
  created_at: string
}

export interface Property {
  id: string
  name: string
  description: string | null
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

export interface ScopeHeader {
  id: string
  property_id: string
  title: string
  position: number
  created_by: string
  created_at: string
}

export interface ScopePoint {
  id: string
  header_id: string
  property_id: string
  title: string
  position: number
  checked_by: string | null
  checked_at: string | null
  created_by: string
  created_at: string
}
