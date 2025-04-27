// src/types/index.ts

export interface SongSection {
  id: string;
  name: string;
  startSeconds: number;
  endSeconds: number;
}

export interface SuggestedChunkData {
    startSeconds: number;
    endSeconds: number;
}

export interface FavoriteSong {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  addedDate: string; // ISO date string
  sections: SongSection[];
  originalSuggestions?: SuggestedChunkData[];
  durationSeconds?: number; // *** ENSURE THIS EXISTS ***
}

// Represents a playlist object with unknown properties
export type Playlist = Record<string, unknown>;
