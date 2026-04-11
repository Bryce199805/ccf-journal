export interface CASPartition {
  bigZone: string
  bigCategory: string
  smallZone: string
  smallCategory: string
  isTop: boolean
  isReview?: boolean
}

export interface JIFRanking {
  subject: string
  quartile: string
  rank: string
  subset?: string
}

export interface CiteScoreRanking {
  subject: string
  rank: string
  percentile: string
  zone?: string
  category?: string
}

export interface EntryListItem {
  id: number
  type: 'journal' | 'conference'
  ccf_domain: string
  ccf_level: string
  ccf_abbr: string
  ccf_full: string
  ccf_publisher: string
  ccf_url: string
  letpub_url: string | null
  issn: string | null
  impact_factor: number | null
  cite_score: number | null
  h_index: number | null
  cas2025: string | null
  xinrui: string | null
  wos_zone: string | null
  sci_type: string | null
  article_count: number | null
  letpub_score: number | null
  is_favorite: boolean
  tags: string[]
  note: string
}

export interface Entry extends EntryListItem {
  eissn: string | null
  publisher: string | null
  country: string | null
  language: string | null
  periodicity: string | null
  research_area: string | null
  is_oa: string | null
  gold_oa_ratio: string | null
  official_url: string | null
  submission_url: string | null
  realtime_if: number | null
  five_year_if: number | null
  jci_value: number | null
  sjr: number | null
  snip: number | null
  self_citation_rate: string | null
  review_speed: string | null
  acceptance_rate: string | null
  cas2023: string | null
  jif: string | null
  jci_json: string | null
  citescore_rankings: string | null
  journalid: number | null
  name: string | null
}

export interface PaginatedResponse {
  data: EntryListItem[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export interface StatsResponse {
  total_journals: number
  total_conferences: number
  by_domain: Record<string, number>
  by_level: Record<string, number>
  by_cas_zone: Record<string, number>
}

export interface EntryDetailResponse {
  entry: Entry
  is_favorite: boolean
}

export interface FavoriteRequest {
  device_id: string
  entry_id: number
  tags?: string[]
}

export interface FavoritesResponse {
  entry_ids: number[]
}

export interface FilterState {
  type: 'journal' | 'conference'
  domains: string[]
  levels: string[]
  casZones: string[]
  query: string
  sort: string
  order: 'asc' | 'desc'
  page: number
  perPage: number
  favOnly: boolean
  topOnly: boolean
  tag: string
  layout: 'card' | 'table'
}

export interface User {
  id: number
  username: string
  created_at: string
}

export interface AuthResponse {
  token: string
  user: User
}

export interface RegisterRequest {
  username: string
  password: string
}

export interface LoginRequest {
  username: string
  password: string
}

export interface Note {
  entry_id: number
  ccf_abbr: string
  ccf_full: string
  ccf_level: string
  content: string
  updated_at: string
}

export interface NoteRequest {
  device_id: string
  entry_id: number
  content: string
}

export interface NotesResponse {
  notes: Note[]
}

export interface Tag {
  id?: number
  name: string
  color: string
}

export interface TagsResponse {
  tags: Tag[]
}

export interface CreateTagRequest {
  name: string
  color: string
}
