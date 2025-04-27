// src/app/favorites/page.tsx
'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { FavoriteSong, SongSection, SuggestedChunkData } from '@/types';
import styles from '../page.module.css'; // Common styles
import favoriteStyles from './favorites.module.css'; // Specific styles
import YouTubePlayer, { YouTubePlayerRef } from '@/components/YouTubePlayer'; // Import player
import { YouTubePlayer as YouTubePlayerType } from 'react-youtube'; // Import player type

// Import the INTERACTIVE Visual Timeline component (Use version from Response #63)
import VisualTimeline from '@/components/VisualTimeline';

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

export default function FavoritesPage() {
  // --- STATE VARIABLES ---
  const [isClient, setIsClient] = useState(false);
  const [favorites, setFavorites] = useLocalStorage<FavoriteSong[]>('favoriteSongs', []);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [isLoadingAdd, setIsLoadingAdd] = useState<boolean>(false);
  const [errorAdd, setErrorAdd] = useState<string | null>(null);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<CurrentlyPlaying | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const playerComponentRef = useRef<YouTubePlayerRef>(null);
  // No state needed for old marking/manual add UI

  useEffect(() => { setIsClient(true); }, []);

  // --- HANDLER FUNCTIONS ---
  const extractVideoId = (url: string): string | null => { const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/; const match = url.match(regex); return match ? match[1] : null; };

  // Add Favorite (Saves duration AND suggestions)
  const addFavorite = async (e: React.FormEvent) => {
     e.preventDefault(); setErrorAdd(null); if (!videoUrl.trim()) return;
     const videoId = extractVideoId(videoUrl); if (!videoId) { setErrorAdd("Invalid URL."); return; } if (favorites.some(fav => fav.videoId === videoId)) { setErrorAdd('Already added!'); return; }
     setIsLoadingAdd(true);
     try {
       const response = await fetch(`/api/getYoutubeData?videoId=${videoId}`);
       const data = await response.json();
       console.log("[AddFavorite] API Data Received:", data); // Log API data
       if (!response.ok) { throw new Error(data.error || `Fetch failed (${response.status})`); }
       if (!data.title) { throw new Error("API could not determine video title."); }

       const durationToSave = data.durationSeconds && data.durationSeconds > 0 ? data.durationSeconds : undefined;
       const suggestionsToSave = Array.isArray(data.suggestedChunks) ? data.suggestedChunks : [];
       console.log("[AddFavorite] Suggestions to save:", suggestionsToSave); // Log suggestions

       const newFavorite: FavoriteSong = {
         videoId, title: data.title, thumbnailUrl: data.thumbnailUrl || '',
         addedDate: new Date().toISOString(), sections: [],
         originalSuggestions: suggestionsToSave, // <<< SAVE SUGGESTIONS
         durationSeconds: durationToSave
       };
       setFavorites(prev => [...prev, newFavorite]); setVideoUrl('');
       if (data.operationalApiWarning) { setErrorAdd(`Note: ${data.operationalApiWarning}`); }
     } catch (err: unknown) { console.error("Err adding favorite:", err); setErrorAdd(err instanceof Error ? err.message : "Unknown error."); } finally { setIsLoadingAdd(false); }
  };

  // Remove Favorite
  const removeFavorite = (videoId: string) => {
    console.log("HANDLER: removeFavorite", videoId);
    setFavorites(prev => prev.filter(song => song.videoId !== videoId));
    if (currentlyPlaying?.videoId === videoId) { setCurrentlyPlaying(null); }
  };

  // Promote Suggestion (Uses default name)
  const promoteSuggestionToSection = (videoId: string, suggestion: SuggestedChunkData, index: number) => {
     console.log("HANDLER: promoteSuggestionToSection", videoId, index);
     const defaultName = `Section ${formatTime(suggestion.startSeconds)}`;
     const newSection: SongSection = { id: generateId(), name: defaultName, startSeconds: suggestion.startSeconds, endSeconds: suggestion.endSeconds };
     setFavorites(prev => prev.map(song => {
         if (song.videoId === videoId) {
             const currentSections = song.sections || [];
             if (currentSections.some(sec => sec.startSeconds === newSection.startSeconds && sec.endSeconds === newSection.endSeconds)) return song;
             return { ...song, sections: [...currentSections, newSection].sort((a, b) => a.startSeconds - b.startSeconds) };
         } return song;
     }));
  };

  // Remove Saved Section
  const removeSavedSection = (videoId: string, sectionId: string) => {
    console.log("HANDLER: removeSavedSection", videoId, sectionId);
    setFavorites(prev => prev.map(song => song.videoId === videoId ? { ...song, sections: (song.sections || []).filter(sec => sec.id !== sectionId) } : song));
    if (currentlyPlaying?.videoId === videoId && currentlyPlaying?.section && 'id' in currentlyPlaying.section && currentlyPlaying.section.id === sectionId) { setCurrentlyPlaying(null); }
  };

  // Playback Control
  const playSongOrSection = (videoId: string, section: SongSection | SuggestedChunkData | null = null) => {
    console.log("HANDLER: playSongOrSection", { videoId, sectionStart: section?.startSeconds });
    setCurrentlyPlaying({ videoId, section });
  };

  // Handler for Timeline Updates (Resizing)
  const handleTimelineUpdate = (videoId: string, sectionId: string, newStart: number, newEnd: number) => {
      console.log(`HANDLER: handleTimelineUpdate - Saving (videoId: ${videoId}, sectionId: ${sectionId}, newStart: ${newStart.toFixed(2)}, newEnd: ${newEnd.toFixed(2)})`);
      if (newStart < 0 || newEnd <= newStart || isNaN(newStart) || isNaN(newEnd)) { console.error("Invalid times from timeline update."); return; }

      setFavorites(prev => prev.map(song => {
          if (song.videoId === videoId) {
              const updatedSections = (song.sections || []).map(sec => {
                  if (sec.id === sectionId) { return { ...sec, startSeconds: parseFloat(newStart.toFixed(3)), endSeconds: parseFloat(newEnd.toFixed(3)) }; }
                  return sec;
              }).sort((a, b) => a.startSeconds - b.startSeconds);
              return { ...song, sections: updatedSections };
          } return song;
      }));
      // Update currently playing state if needed
      if (currentlyPlaying?.videoId === videoId && currentlyPlaying?.section && 'id' in currentlyPlaying.section && currentlyPlaying.section.id === sectionId) {
           setCurrentlyPlaying(prev => prev ? ({ ...prev, section: { ...prev.section as SongSection, startSeconds: parseFloat(newStart.toFixed(3)), endSeconds: parseFloat(newEnd.toFixed(3)) } }) : null);
      }
  };

  // Handler for Creating New Section from Timeline
   const handleTimelineCreate = (videoId: string, start: number, end: number) => {
        console.log(`HANDLER: handleTimelineCreate called (videoId: ${videoId}, start: ${start.toFixed(2)}, end: ${end.toFixed(2)})`);
        if (start < 0 || end <= start || isNaN(start) || isNaN(end)) { console.error("Invalid times from timeline create."); return; }

        const defaultName = `Section ${formatTime(start)}`;
        const newSection: SongSection = {
            id: generateId(), name: defaultName,
            startSeconds: parseFloat(start.toFixed(3)), endSeconds: parseFloat(end.toFixed(3))
        };

        // *** FIX: Defer state update slightly to prevent "update during render" error ***
        setTimeout(() => {
            setFavorites(prev => {
                console.log(`Updating state for ${videoId} to add new section`);
                // Ensure we are updating the correct song object
                const updatedFavorites = prev.map(song => {
                    if (song.videoId === videoId) {
                        // Create new sections array for immutability
                        const newSections = [...(song.sections || []), newSection].sort((a, b) => a.startSeconds - b.startSeconds);
                        return { ...song, sections: newSections };
                    }
                    return song;
                });
                console.log("New state with added section:", updatedFavorites);
                return updatedFavorites;
            });
            console.log("Created new section via timeline (after timeout):", newSection);
        }, 0); // Timeout 0ms executes after current render cycle
        // *** END FIX ***
    };

  // Player Event Handlers
  const handlePlayerReady = useCallback(() => { console.log("EVENT: PlayerReady"); }, []);
  const handlePlayerStateChange = useCallback((event: { data: number; }) => { console.log("EVENT: PlayerStateChange", event.data); setPlayerState(event.data); }, []);
  const handlePlayerError = useCallback((event: { data: number; }) => { console.error("EVENT: PlayerError", event.data); setErrorAdd(`Player Error Code ${event.data}.`); setCurrentlyPlaying(null); }, []);

  // --- Main Render ---
  return (
    <div className={favoriteStyles.container}>
      {/* ... (Link, Title, Form) ... */}
       <Link href="/" className={styles.navButton} style={{ marginBottom: '1.5rem', display: 'inline-block' }}> &larr; Back Home </Link>
        <h1 className={favoriteStyles.title}>My Favorite Songs</h1>
        <form onSubmit={addFavorite} className={favoriteStyles.addForm}>
             <input type="url" placeholder="Enter YouTube Video URL" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} required className={styles.inputField} disabled={isLoadingAdd}/>
             <button type="submit" className={favoriteStyles.analyzeButton} disabled={isLoadingAdd}> {isLoadingAdd ? 'Adding...' : 'Add Song & Get Suggestions'} </button>
        </form>
        {errorAdd && <p className={favoriteStyles.errorMessage}>{errorAdd}</p>}


      {/* Player Area (Simplified) */}
      <div className={favoriteStyles.playerArea}>
         <div className={favoriteStyles.playerContainer}> {currentlyPlaying?.videoId ? ( <YouTubePlayer ref={playerComponentRef} videoId={currentlyPlaying.videoId} section={currentlyPlaying.section} onPlayerReady={handlePlayerReady} onStateChange={handlePlayerStateChange} onError={handlePlayerError} /> ) : ( <div className={favoriteStyles.playerPlaceholder}>Select a song or section to play</div> )} </div>
         {/* Removed marking controls div */}
      </div>

      {/* Favorites List Area */}
      <div className={favoriteStyles.listArea}>
           {!isClient ? ( <p>Loading favorites...</p> ) : (
             favorites.length === 0 ? ( <p>No favorites added yet.</p> ) : (
               <ul className={favoriteStyles.songList}>
                 {favorites.map(song => {
                   // *** Log suggestion data for debugging ***
                   console.log(`Rendering Song: ${song.title}, Suggestions:`, song.originalSuggestions);
                   return (
                     <li key={song.videoId} className={favoriteStyles.songItemContainer}>
                       {/* Song Info Row */}
                       <div className={favoriteStyles.songItem}>
                           <img src={song.thumbnailUrl} alt={song.title} className={favoriteStyles.thumbnail} />
                           <div className={favoriteStyles.songDetails}>
                               <span className={favoriteStyles.songTitle}>{song.title}</span>
                               {song.durationSeconds && <span className={favoriteStyles.songDuration}>({formatTime(song.durationSeconds)})</span>}
                           </div>
                           <div className={favoriteStyles.songActions}>
                               <button onClick={() => playSongOrSection(song.videoId, null)} className={favoriteStyles.actionButton} title="Play Full Song">▶️ Play</button>
                               <button onClick={() => removeFavorite(song.videoId)} className={favoriteStyles.removeButton} title="Remove Favorite">❌</button>
                           </div>
                       </div>

                       {/* Visual Timeline - Pass BOTH handlers */}
                       {song.durationSeconds && song.durationSeconds > 0 ? (
                         <VisualTimeline
                           sections={song.sections || []}
                           totalDuration={song.durationSeconds}
                           onSectionClick={(section) => playSongOrSection(song.videoId, section)}
                           onSectionUpdate={(sectionId, newStart, newEnd) => handleTimelineUpdate(song.videoId, sectionId, newStart, newEnd)}
                           onSectionCreate={(start, end) => handleTimelineCreate(song.videoId, start, end)}
                         />
                       ) : (
                         <div className={favoriteStyles.noTimeline}>Timeline requires song duration</div>
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
                                     <button onClick={() => playSongOrSection(song.videoId, section)} className={favoriteStyles.actionButtonSmall} title="Play Saved Section">▶️</button>
                                     <button onClick={() => removeSavedSection(song.videoId, section.id)} className={favoriteStyles.removeButtonSmall} title="Remove Saved Section">🗑️</button>
                                   </div>
                                 </li>
                               ))}
                             </ul>
                          </div>
                       )}

                       {/* *** RESTORED & VERIFIED: Suggestions List *** */}
                       {Array.isArray(song.originalSuggestions) && song.originalSuggestions.length > 0 ? (
                         <div className={`${favoriteStyles.sectionListContainer} ${favoriteStyles.suggestionsContainer}`}>
                           <h4 className={favoriteStyles.sectionListHeader}>Suggested Peaks ({song.originalSuggestions.length}):</h4>
                           <ul className={favoriteStyles.sectionList}>
                             {song.originalSuggestions.map((suggestion, index) => {
                                 // Check if saved based on start/end times
                                 const isSaved = Array.isArray(song.sections) && song.sections.some(sec =>
                                     Math.abs(sec.startSeconds - suggestion.startSeconds) < 0.01 &&
                                     Math.abs(sec.endSeconds - suggestion.endSeconds) < 0.01
                                 );
                                 return (
                                   <li key={`orig-${index}-${suggestion.startSeconds}`} className={`${favoriteStyles.sectionItem} ${isSaved ? favoriteStyles.suggestionSaved : ''}`}>
                                     <span className={favoriteStyles.sectionName}> Suggestion {index + 1} ({formatTime(suggestion.startSeconds)} - {formatTime(suggestion.endSeconds)}) </span>
                                     <div className={favoriteStyles.sectionActions}>
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
                         // Optionally log if suggestions are expected but missing
                          song.originalSuggestions /* Check if it exists but is empty */ && song.originalSuggestions.length === 0 ? <p className={favoriteStyles.noSuggestions}>No suggestions available for this song.</p> : null
                       )}
                       {/* *** END SUGGESTIONS LIST *** */}
                     </li>
                   );
                 })}
               </ul>
             )
           )}
         </div>
    </div>
  );
}

