export type Role = 'project_manager' | 'viewer'

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
  photo_path: string
  note: string
  created_by: string
  uploader_name: string
  created_at: string
}
