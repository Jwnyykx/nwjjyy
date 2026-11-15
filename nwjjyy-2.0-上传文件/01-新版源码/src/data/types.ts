export type UUID = string
export type Publication = 'draft' | 'published'
export type Role = 'admin' | 'writer'
export type MediaKind = 'image' | 'audio'

export type Member = { id: UUID; display_name: string; role: Role; active: boolean; created_at: string }
export type Category = { id: UUID; name: string; archived: boolean }
type Dates = { created_at: string; updated_at: string }
type Publishable = Dates & {
  id: UUID
  author_id: UUID
  event_date: string
  status: Publication
  published_at: string | null
  deleted_at: string | null
  revision: number
}
export type Story = Publishable & {
  title: string
  summary: string
  body: string
  location: string
  weather: string
  category_id: UUID
  cover_media_id: UUID | null
  is_pinned: boolean
  is_hidden: boolean
}
export type StoryCard = Omit<Story, 'body'>
export type Diary = Publishable & { body: string; mood: string; show_on_home: boolean }
export type Media = Dates & {
  id: UUID
  story_id: UUID | null
  diary_id: UUID | null
  created_by: UUID
  category_id: UUID | null
  event_date: string
  media_type: MediaKind
  content_type: string
  file_size: number
  preview_size: number
  caption: string
  sort_order: number
  state: 'staged' | 'ready'
  deleted_at: string | null
  storage_prefix: string
}
export type Perspective = { story_id: UUID; author_id: UUID; body: string; created_at: string; updated_at: string }
export type StoryRelation = { story_id: UUID; related_story_id: UUID; created_at: string }
export type PromiseNote = Dates & {
  id: UUID
  author_id: UUID
  title: string
  description: string
  target_date: string | null
  completed_on: string | null
  story_id: UUID | null
  deleted_at: string | null
}
export type Anniversary = Dates & {
  id: UUID
  title: string
  event_date: string
  show_on_home: boolean
  show_countdown: boolean
}
export type Appearance = 'linen' | 'lavender' | 'paper'
export type Settings = {
  id: 1; home_intro: string; home_subtitle: string; time_zone: string;
  cover_media_id: UUID | null; nfc_story_id: UUID | null; updated_at: string;
  appearance: Appearance; show_bunny: boolean; allow_motion: boolean; enable_shuffle: boolean;
  show_post_notices: boolean; next_meeting: string | null;
}
export type PhotoNote = { media_id: UUID; place: string; photographer: string; memory: string; message: string }
export type Footprint = { id: UUID; author_id: UUID; city: string; title: string; note: string; arrival: string; departure: string | null; story_id: UUID | null }
export type Chapter = Dates & { id: UUID; title: string; description: string; sort_order: number; cover_story_id: UUID | null }
export type ChapterEntry = { chapter_id: UUID; story_id: UUID; sort_order: number }
export type ChapterSummary = Chapter & { story_count: number; cover_media_id: UUID | null }
export type Collection = { id: UUID; title: string; description: string; cover_id: UUID | null; created_at: string }
export type CollectionItem = { collection_id: UUID; media_id: UUID; sort_order: number }
export type TripEntry = { footprint_id: UUID; story_id: UUID }
export type AnnualBook = { year: number; title: string; reflection: string; cover_id: UUID | null; focus_story_id: UUID | null; updated_at: string }
export type StoryRevision = {
  story_id: UUID; revision: number; editor_id: UUID | null; saved_at: string;
  snapshot: Pick<Story, 'title' | 'summary' | 'body' | 'event_date' | 'category_id' | 'location' | 'weather'>;
}
export type SearchResult = { kind: 'story' | 'diary' | 'photo' | 'chapter' | 'trip'; item_id: UUID; title: string; excerpt: string; recorded_on: string | null }

export type StoryFields = Pick<Story, 'title' | 'event_date' | 'summary' | 'body' | 'category_id' | 'location' | 'weather' | 'status' | 'is_pinned' | 'is_hidden' | 'cover_media_id'>
export type DiaryFields = Pick<Diary, 'body' | 'event_date' | 'mood' | 'status' | 'show_on_home'>
export type MediaOrder = Pick<Media, 'id' | 'caption' | 'sort_order'>
export type NewMedia = Pick<Media, 'id' | 'story_id' | 'diary_id' | 'category_id' | 'event_date' | 'media_type' | 'content_type' | 'file_size' | 'preview_size' | 'caption'>
export type BookTables = {
  members: Member
  categories: Category
  stories: Story
  diaries: Diary
  media: Media
  promises: PromiseNote
  anniversaries: Anniversary
  perspectives: Perspective
  storybook_settings: Settings
  photo_notes: PhotoNote
  footprints: Footprint
  story_relations: StoryRelation
  chapters: Chapter
  chapter_entries: ChapterEntry
  photo_collections: Collection
  photo_collection_items: CollectionItem
  trip_entries: TripEntry
  annual_books: AnnualBook
  story_revisions: StoryRevision
}

type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] }
export type Database = {
  public: {
    Tables: { [Name in keyof BookTables]: Table<BookTables[Name] & (Name extends 'stories' ? { search_text: string } : unknown)> }
    Views: Record<never, never>
    Functions: {
      save_story: { Args: { target: UUID; expected: number; fields: StoryFields; items: MediaOrder[] }; Returns: Story }
      save_diary: { Args: { target: UUID; expected: number; fields: DiaryFields; items: MediaOrder[] }; Returns: Diary }
      save_album: { Args: { targets: UUID[]; replaced?: UUID }; Returns: undefined }
      story_years: { Args: never; Returns: number[] }
      album_years: { Args: never; Returns: number[] }
      album_photos: {
        Args: { from_date: string | null; to_date: string | null; category_filter: UUID | null; featured_only: boolean; start_at: number; limit_to: number }
        Returns: Media[]
      }
      chapter_directory: { Args: never; Returns: ChapterSummary[] }
      chapter_stories: { Args: { target: UUID; start_at: number; limit_to: number }; Returns: Story[] }
      save_collection: { Args: { target: UUID; fields: Pick<Collection, 'title' | 'description' | 'cover_id'>; photos: UUID[] }; Returns: UUID }
      collection_photos: { Args: { target: UUID }; Returns: Media[] }
      book_photo: { Args: { target: UUID }; Returns: Media[] }
      collection_covers: { Args: { targets: UUID[] }; Returns: { collection_id: UUID; photo: Media }[] }
      save_trip: { Args: { target: UUID; fields: Pick<Footprint, 'title' | 'city' | 'note' | 'arrival' | 'departure'>; linked: UUID[] }; Returns: UUID }
      restore_story_text: { Args: { target: UUID; previous: number; expected: number }; Returns: number }
      search_book: { Args: { term: string; from_date: string | null; to_date: string | null; category_filter: UUID | null; start_at: number }; Returns: SearchResult[] }
      sound_index: { Args: { from_category: UUID | null; start_at: number; limit_to: number }; Returns: Media[] }
    }
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}
