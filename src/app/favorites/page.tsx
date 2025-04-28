// src/app/favorites/page.tsx
'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useLocalStorage } from '@/hooks/useLocalStorage';
// Using SuggestedChunkData which matches the output of findSuggestedChunks from API (paste-5)
import { FavoriteSong, SongSection, SuggestedChunkData } from '@/types';
import styles from '../page.module.css';
import favoriteStyles from './favorites.module.css';
import YouTubePlayer, { YouTubePlayerRef } from '@/components/YouTubePlayer';
import { YouTubePlayer as YouTubePlayerType } from 'react-youtube';

// *** Import the INTERACTIVE Visual Timeline component (Use version from Response #77) ***
import VisualTimeline from '@/components/VisualTimeline';

// NOTE: generateSuggestionsFromHeatmap function is REMOVED from frontend

// Helper for IDs
const generateId = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : '_' + Math.random().toString(36).substr(2, 9);

// Helper to format seconds into MM:SS
const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const roundSeconds = Math.floor(seconds);
    const minutes = Math.floor(roundSeconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes < 10 ? '0' : ''}${minutes}:${secs < 10 ? '0' : ''}${secs}`;
};

// Enum for Player States
enum PlayerState { UNSTARTED = -1, ENDED = 0, PLAYING = 1, PAUSED = 2, BUFFERING = 3, CUED = 5, }

// Interface for what's playing
interface CurrentlyPlaying { videoId: string; section?: SongSection | SuggestedChunkData | null; }

// Tolerance for checking duplicate sections (in seconds)
const DUPLICATE_TIME_TOLERANCE = 0.1;

export default function FavoritesPage() {
  // --- STATE VARIABLES ---
  const [isClient, setIsClient] = useState(false);
  const [favorites, setFavorites] = useLocalStorage<FavoriteSong[]>('favoriteSongs', []);
  const [videoUrl, setVideoUrl] = useState<string>(''); // ** Add Song input **
  const [isLoadingAdd, setIsLoadingAdd] = useState<boolean>(false);
  const [errorAdd, setErrorAdd] = useState<string | null>(null); // Add Song errors
  const [currentlyPlaying, setCurrentlyPlaying] = useState<CurrentlyPlaying | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const playerComponentRef = useRef<YouTubePlayerRef>(null);
  // Old UI state removed

  useEffect(() => { setIsClient(true); }, []);

  // --- HANDLER FUNCTIONS ---
  const extractVideoId = (url: string): string | null => {
    // ... (Keep robust URLSearchParams version) ...
     try { const parsedUrl = new URL(url); let videoId: string | null = null; if (parsedUrl.hostname === 'youtu.be') { videoId = parsedUrl.pathname.split('/')[1]; } else if (parsedUrl.hostname.includes('youtube.com') && parsedUrl.searchParams.has('v')) { videoId = parsedUrl.searchParams.get('v'); } if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) { return videoId; } else { return null; } } catch { return null; }
  };

  // Add Favorite (Uses suggestions and duration directly from API - based on paste-5 logic)
  const addFavorite = async (e: React.FormEvent) => {
     e.preventDefault(); console.log(">>> HANDLER: addFavorite triggered");
     setErrorAdd(null); const urlToAdd = videoUrl.trim(); if (!urlToAdd) return;
     const videoId = extractVideoId(urlToAdd); if (!videoId) { setErrorAdd("Invalid or unsupported YouTube URL format."); return; }
     if (favorites.some(fav => fav.videoId === videoId)) { setErrorAdd('Already added!'); return; }
     setIsLoadingAdd(true);
     try {
       // API endpoint uses paste-5 logic + returns duration now
       const response = await fetch(`/api/getYoutubeData?videoId=${videoId}`);
       const data = await response.json();
       console.log("[AddFavorite] API Full Response Data:", JSON.stringify(data, null, 2));

       if (!response.ok) throw new Error(data.error || `Fetch failed (${response.status})`);
       if (!data.title) throw new Error("API could not determine video title.");

       // *** USE data.suggestedChunks and data.durationSeconds FROM API ***
       const suggestionsToSave: SuggestedChunkData[] = Array.isArray(data.suggestedChunks) ? data.suggestedChunks : [];
       const durationToSave = data.durationSeconds && data.durationSeconds > 0 ? data.durationSeconds : undefined;
       console.log("[AddFavorite] Suggestions from API (paste-5 logic):", suggestionsToSave);
       console.log("[AddFavorite] Duration from API:", durationToSave);

       if (!durationToSave) { console.warn("[AddFavorite] Duration missing from API response. Timeline will not function."); }

       const newFavorite: FavoriteSong = {
         videoId, title: data.title, thumbnailUrl: data.thumbnailUrl || '',
         addedDate: new Date().toISOString(), sections: [],
         originalSuggestions: suggestionsToSave, // <<< Use suggestions from API
         durationSeconds: durationToSave         // <<< Use duration from API
       };
       setFavorites(prev => [...prev, newFavorite]); setVideoUrl('');
       if (data.operationalApiWarning) setErrorAdd(`Note: ${data.operationalApiWarning}`);
     } catch (err: unknown) { console.error("Err adding favorite:", err); setErrorAdd(err instanceof Error ? err.message : "Unknown error adding song."); }
     finally { setIsLoadingAdd(false); }
  };

  // Remove Favorite (Verify binding)
  const removeFavorite = (videoId: string) => {
    console.log(">>> HANDLER: removeFavorite triggered for:", videoId);
    setFavorites(prev => prev.filter(song => song.videoId !== videoId));
    if (currentlyPlaying?.videoId === videoId) setCurrentlyPlaying(null);
  };

  // Promote Suggestion (Verify binding - uses automatic naming)
  const promoteSuggestionToSection = (videoId: string, suggestion: SuggestedChunkData, index: number) => {
     console.log(">>> HANDLER: promoteSuggestionToSection triggered for:", videoId, index);
     const defaultName = `Section ${formatTime(suggestion.startSeconds)}`; // Automatic naming
     const newSection: SongSection = { id: generateId(), name: defaultName, startSeconds: suggestion.startSeconds, endSeconds: suggestion.endSeconds };
     setFavorites(prev => prev.map(song => {
        if (song.videoId === videoId) {
            const currentSections = song.sections || [];
            if (currentSections.some(sec => Math.abs(sec.startSeconds - newSection.startSeconds) < 0.01 && Math.abs(sec.endSeconds - newSection.endSeconds) < 0.01)) return song;
            return { ...song, sections: [...currentSections, newSection].sort((a, b) => a.startSeconds - b.startSeconds) };
        } return song;
     }));
  };

  // Remove Saved Section (Verify binding)
  const removeSavedSection = (videoId: string, sectionId: string) => {
    console.log(">>> HANDLER: removeSavedSection triggered for:", videoId, sectionId);
    setFavorites(prev => prev.map(song => song.videoId === videoId ? { ...song, sections: (song.sections || []).filter(sec => sec.id !== sectionId) } : song));
    if (currentlyPlaying?.videoId === videoId && currentlyPlaying?.section && 'id' in currentlyPlaying.section && currentlyPlaying.section.id === sectionId) setCurrentlyPlaying(null);
  };

  // Playback Control (Verify binding)
  const playSongOrSection = (videoId: string, section: SongSection | SuggestedChunkData | null = null) => {
    console.log(">>> HANDLER: playSongOrSection triggered for:", videoId, section?.startSeconds);
    setCurrentlyPlaying({ videoId, section });
  };

  // Timeline Handlers (Keep setTimeout fix)
  const handleTimelineUpdate = (videoId: string, sectionId: string, newStart: number, newEnd: number) => {
      console.log(`>>> HANDLER: handleTimelineUpdate called`);
      if (newStart < 0 || newEnd <= newStart || isNaN(newStart) || isNaN(newEnd)) return;
      // *** Use setTimeout to defer state update ***
      setTimeout(() => {
          setFavorites(prev => prev.map(song => { /* ... update logic ... */ }));
          // Update currently playing if needed
          if (currentlyPlaying?.videoId === videoId && currentlyPlaying?.section && 'id' in currentlyPlaying.section && currentlyPlaying.section.id === sectionId) {
             setCurrentlyPlaying(prev => prev ? ({ ...prev, section: { ...prev.section as SongSection, startSeconds: parseFloat(newStart.toFixed(3)), endSeconds: parseFloat(newEnd.toFixed(3)) } }) : null);
          }
          console.log(`handleTimelineUpdate: State update applied for ${sectionId}`);
      }, 0);
  };

  // *** UPDATED Timeline Create Handler (with duplicate REMOVAL workaround) ***
   const handleTimelineCreate = (videoId: string, start: number, end: number) => {
       console.log(`>>> HANDLER: handleTimelineCreate called`);
       if (start < 0 || end <= start || isNaN(start) || isNaN(end)) {
            console.error("handleTimelineCreate: Invalid start/end times received.");
            return;
        }
       const defaultName = `Section ${formatTime(start)}`; // Automatic naming
       const newSection: SongSection = {
           id: generateId(), name: defaultName,
           startSeconds: parseFloat(start.toFixed(3)), endSeconds: parseFloat(end.toFixed(3))
       };

       // *** Use setTimeout to defer state update ***
       setTimeout(() => {
            setFavorites(prev => {
                console.log(`setTimeout: Updating state for ${videoId}. Adding potential section:`, newSection);
                const updatedFavorites = prev.map(song => {
                     if (song.videoId === videoId) {
                         const currentSections = song.sections || [];
                         // Add the new section first (potentially creating a temporary duplicate)
                         let sectionsWithNew = [...currentSections, newSection].sort((a, b) => a.startSeconds - b.startSeconds);

                         // *** WORKAROUND: Filter out duplicates based on time (keeping first instance) ***
                         const seenTimes = new Set<string>();
                         const uniqueSections = sectionsWithNew.filter(sec => {
                            const timeKey = `${sec.startSeconds.toFixed(2)}_${sec.endSeconds.toFixed(2)}`; // Key with tolerance
                            if (seenTimes.has(timeKey)) {
                                console.warn(`setTimeout: Duplicate detected and removed: ${timeKey}`);
                                return false; // Discard duplicate
                            }
                            seenTimes.add(timeKey);
                            return true; // Keep first instance
                         });
                         // *** END WORKAROUND ***

                         return { ...song, sections: uniqueSections };
                     }
                     return song;
                 });
                 console.log("setTimeout: New state PREVIEW (after potential duplicate removal):", updatedFavorites);
                 return updatedFavorites;
            });
       }, 0);
    };
   // *** END UPDATED Handler ***


  // Player Handlers
  const handlePlayerReady = useCallback(() => { console.log("EVENT: PlayerReady"); }, []);
  const handlePlayerStateChange = useCallback((event: { data: number; }) => { console.log("EVENT: PlayerStateChange", event.data); setPlayerState(event.data); }, []);
  const handlePlayerError = useCallback((event: { data: number; }) => { console.error("EVENT: PlayerError", event.data); setErrorAdd(`Player Error Code ${event.data}.`); setCurrentlyPlaying(null); }, []);

  // --- Main Render ---
  return (
    <div className={favoriteStyles.container}>
        <Link href="/" className={styles.navButton} style={{ marginBottom: '1.5rem', display: 'inline-block' }}> &larr; Back Home </Link>
        <h1 className={favoriteStyles.title}>My Favorite Songs</h1>

        {/* *** Add Song Form IS PRESENT *** */}
        <form onSubmit={addFavorite} className={favoriteStyles.addForm}>
            <input type="url" placeholder="Enter YouTube Video URL" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} required className={styles.inputField} disabled={isLoadingAdd}/>
            <button type="submit" className={favoriteStyles.analyzeButton} disabled={isLoadingAdd}> {isLoadingAdd ? 'Adding...' : 'Add Song & Get Suggestions'} </button>
        </form>
        {errorAdd && <p className={favoriteStyles.errorMessage}>{errorAdd}</p>}

        {/* Player Area (Simplified) */}
        <div className={favoriteStyles.playerArea}>
           <div className={favoriteStyles.playerContainer}> {currentlyPlaying?.videoId ? ( <YouTubePlayer ref={playerComponentRef} videoId={currentlyPlaying.videoId} section={currentlyPlaying.section} onPlayerReady={handlePlayerReady} onStateChange={handlePlayerStateChange} onError={handlePlayerError} /> ) : ( <div className={favoriteStyles.playerPlaceholder}>Select a song or section to play</div> )} </div>
        </div>

        {/* Favorites List Area */}
        <div className={favoriteStyles.listArea}>
             {!isClient ? ( <p>Loading...</p> ) : (
               favorites.length === 0 ? ( <p>No favorites added yet.</p> ) : (
                 <ul className={favoriteStyles.songList}>
                   {favorites.map(song => (
                     <li key={song.videoId} className={favoriteStyles.songItemContainer}>
                       {/* Song Info Row (No Add Custom Btn) */}
                       <div className={favoriteStyles.songItem}>
                           <img src={song.thumbnailUrl} alt={song.title} className={favoriteStyles.thumbnail} />
                           <div className={favoriteStyles.songDetails}>
                               <span className={favoriteStyles.songTitle}>{song.title}</span>
                               {/* Display duration from API */}
                               {song.durationSeconds && <span className={favoriteStyles.songDuration}>({formatTime(song.durationSeconds)})</span>}
                           </div>
                           <div className={favoriteStyles.songActions}>
                               {/* *** Verify Button Bindings *** */}
                               <button onClick={() => playSongOrSection(song.videoId, null)} className={favoriteStyles.actionButton} title="Play Full Song">▶️ Play</button>
                               <button onClick={() => removeFavorite(song.videoId)} className={favoriteStyles.removeButton} title="Remove Favorite">❌</button>
                           </div>
                       </div>

                       {/* Removed Inline Manual Add Section Form */}

                       {/* *** INTERACTIVE TIMELINE IS PRESENT *** */}
                       {song.durationSeconds && song.durationSeconds > 0 ? (
                         <VisualTimeline
                           sections={song.sections || []}
                           totalDuration={song.durationSeconds}
                           onSectionClick={(section) => playSongOrSection(song.videoId, section)}
                           // Pass implemented handlers
                           onSectionUpdate={(sectionId, newStart, newEnd) => handleTimelineUpdate(song.videoId, sectionId, newStart, newEnd)}
                           onSectionCreate={(start, end) => handleTimelineCreate(song.videoId, start, end)}
                         />
                       ) : (
                         <div className={favoriteStyles.noTimeline}>Timeline requires song duration (check API response).</div>
                       )}

                       {/* Saved Sections List */}
                       {Array.isArray(song.sections) && song.sections.length > 0 && (
                          <div className={favoriteStyles.sectionListContainer}>
                             <h4 className={favoriteStyles.sectionListHeader}>Saved Sections:</h4>
                             <ul className={favoriteStyles.sectionList}>
                                {song.sections.map(section => (
                                  <li key={section.id} className={favoriteStyles.sectionItem}>
                                    <span className={favoriteStyles.sectionName}>{section.name} ({formatTime(section.startSeconds)} - {formatTime(section.endSeconds)})</span>
                                    <div className={favoriteStyles.sectionActions}>
                                      {/* *** Verify Button Bindings *** */}
                                      <button onClick={() => playSongOrSection(song.videoId, section)} className={favoriteStyles.actionButtonSmall} title="Play Saved Section">▶️</button>
                                      <button onClick={() => removeSavedSection(song.videoId, section.id)} className={favoriteStyles.removeButtonSmall} title="Remove Saved Section">🗑️</button>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                          </div>
                       )}

                       {/* *** Suggestions List (Using data from API) *** */}
                       {Array.isArray(song.originalSuggestions) && song.originalSuggestions.length > 0 ? (
                         <div className={`${favoriteStyles.sectionListContainer} ${favoriteStyles.suggestionsContainer}`}>
                           <h4 className={favoriteStyles.sectionListHeader}>Suggested Peaks ({song.originalSuggestions.length}):</h4>
                           <ul className={favoriteStyles.sectionList}>
                             {song.originalSuggestions.map((suggestion, index) => {
                                 const isSaved = Array.isArray(song.sections) && song.sections.some(sec => Math.abs(sec.startSeconds - suggestion.startSeconds) < 0.01 && Math.abs(sec.endSeconds - suggestion.endSeconds) < 0.01);
                                 return (
                                   <li key={`orig-${index}-${suggestion.startSeconds}`} className={`${favoriteStyles.sectionItem} ${isSaved ? favoriteStyles.suggestionSaved : ''}`}>
                                     <span className={favoriteStyles.sectionName}> Suggestion {index + 1} ({formatTime(suggestion.startSeconds)} - {formatTime(suggestion.endSeconds)}) </span>
                                     <div className={favoriteStyles.sectionActions}>
                                       {/* *** Verify Button Bindings *** */}
                                       <button onClick={() => playSongOrSection(song.videoId, suggestion)} className={favoriteStyles.actionButtonSmall} title="Preview Suggestion">▶️</button>
                                       {isSaved ? (
                                         <button onClick={() => { const savedSection = Array.isArray(song.sections) ? song.sections.find(sec => Math.abs(sec.startSeconds - suggestion.startSeconds) < 0.01 && Math.abs(sec.endSeconds - suggestion.endSeconds) < 0.01) : undefined; if(savedSection) removeSavedSection(song.videoId, savedSection.id); } } className={favoriteStyles.toggleSaveButtonActive} title="Remove from Saved">⭐</button>
                                       ) : (
                                         <button onClick={() => promoteSuggestionToSection(song.videoId, suggestion, index)} className={favoriteStyles.toggleSaveButtonInactive} title="Add to Saved">☆</button>
                                       )}
                                     </div>
                                   </li>
                                 );
                             })}
                           </ul>
                         </div>
                       ) : (
                            <p className={favoriteStyles.noSuggestions}>No suggestions provided by API.</p>
                       )}
                       {/* *** END SUGGESTIONS LIST *** */}
                     </li>
                   ))}
                 </ul>
               )
             )}
           </div>
    </div>
  );
}
