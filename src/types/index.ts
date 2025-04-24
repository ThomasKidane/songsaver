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

// Represents a favorite song stored in localStorage
export interface FavoriteSong {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  addedDate: string; // ISO date string
  sections: SongSection[]; // User-saved/selected/marked sections (active)
  originalSuggestions?: SuggestedChunkData[]; // Original API suggestions
  durationSeconds?: number; // *** Ensure this line exists ***
}

// Playlist interface
export interface Playlist {
  id: string; // Unique ID for the playlist
  name: string;
  songVideoIds: string[]; // Array of videoIds from FavoriteSong[]
  createdDate: string; // ISO date string
}
