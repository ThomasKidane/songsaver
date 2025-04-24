// src/app/favorites/page.tsx
'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useLocalStorage } from '@/hooks/useLocalStorage';
// Ensure all needed types are imported
import { FavoriteSong, SongSection, SuggestedChunkData } from '@/types';
import styles from '../page.module.css'; // Common styles (assuming you have some)
import favoriteStyles from './favorites.module.css'; // Specific styles
import YouTubePlayer, { YouTubePlayerRef } from '@/components/YouTubePlayer'; // Import player
import { YouTubePlayer as YouTubePlayerType } from 'react-youtube'; // Import player type

// *** IMPORT THE TIMELINE COMPONENT ***
import TimelineVisualizer from '@/components/TimelineVisualizer';

// Helper for IDs
const generateId = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : '_' + Math.random().toString(36).substr(2, 9);

// Helper to format seconds into MM:SS for display
const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return "0:00"; // Handle edge cases
    const roundSeconds = Math.floor(seconds);
    const minutes = Math.floor(roundSeconds / 60);
    const secs = roundSeconds % 60;
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
};

// Enum for Player States
enum PlayerState { UNSTARTED = -1, ENDED = 0, PLAYING = 1, PAUSED = 2, BUFFERING = 3, CUED = 5, }

// Interface for what's playing
interface CurrentlyPlaying { videoId: string; section?: SongSection | SuggestedChunkData | null; }

export default function FavoritesPage() {
  // Core State
  const [isClient, setIsClient] = useState(false);
  const [favorites, setFavorites] = useLocalStorage<FavoriteSong[]>('favoriteSongs', []);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [isLoadingAdd, setIsLoadingAdd] = useState<boolean>(false);
  const [errorAdd, setErrorAdd] = useState<string | null>(null);

  // Playback State
  const [currentlyPlaying, setCurrentlyPlaying] = useState<CurrentlyPlaying | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const playerComponentRef = useRef<YouTubePlayerRef>(null);

  // Manual Section Marking State
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState<number>(0);
  const [isMarking, setIsMarking] = useState<boolean>(false);
  const [startMark, setStartMark] = useState<number | null>(null);
  const [endMark, setEndMark] = useState<number | null>(null);
  const [markedSectionName, setMarkedSectionName] = useState<string>("");

  // State for the inline manual add form
  const [showManualAddForm, setShowManualAddForm] = useState<string | null>(null);
  const [manualSectionName, setManualSectionName] = useState('');
  const [manualSectionStart, setManualSectionStart] = useState('');
  const [manualSectionEnd, setManualSectionEnd] = useState('');

  // --- Effect for hydration fix ---
  useEffect(() => { setIsClient(true); }, []);

  // --- Favorite Management ---
  const extractVideoId = (url: string): string | null => { const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/; const match = url.match(regex); return match ? match[1] : null; };

  // Updated Add Favorite function to store duration
  const addFavorite = async (e: React.FormEvent) => {
     e.preventDefault(); setErrorAdd(null); if (!videoUrl.trim()) return;
     const videoId = extractVideoId(videoUrl); if (!videoId) { setErrorAdd("Invalid URL."); return; } if (favorites.some(fav => fav.videoId === videoId)) { setErrorAdd('Already added!'); return; }
     setIsLoadingAdd(true);
     try {
       const response = await fetch(`/api/getYoutubeData?videoId=${videoId}`);
       const data = await response.json();
       if (!response.ok) { throw new Error(data.error || `Fetch failed (${response.status})`); }
       if (!data.title) { throw new Error("API could not determine video title."); }

       // Create the new favorite object, including duration
       const newFavorite: FavoriteSong = {
         videoId,
         title: data.title,
         thumbnailUrl: data.thumbnailUrl || '',
         addedDate: new Date().toISOString(),
         sections: [], // Start with no saved sections
         originalSuggestions: data.suggestedChunks || [],
         // Store duration only if it's a positive number, otherwise undefined
         durationSeconds: data.durationSeconds && data.durationSeconds > 0 ? data.durationSeconds : undefined // *** STORE DURATION ***
       };

       setFavorites(prev => [...prev, newFavorite]); setVideoUrl(''); console.log("Added favorite:", newFavorite);
       if (data.operationalApiWarning) { setErrorAdd(`Note: ${data.operationalApiWarning}`); }
     } catch (err: unknown) { console.error("Err adding favorite:", err); setErrorAdd(err instanceof Error ? err.message : "Unknown error."); }
     finally { setIsLoadingAdd(false); }
  };

  // Remove a favorite song entirely
  const removeFavorite = (videoId: string) => { setFavorites(prev => prev.filter(song => song.videoId !== videoId)); if (currentlyPlaying?.videoId === videoId) { setCurrentlyPlaying(null); } };

  // --- Section Management ---

  // Promote an original suggestion to a saved section
  const promoteSuggestionToSection = (videoId: string, suggestion: SuggestedChunkData, index: number) => {
     const newSection: SongSection = { id: generateId(), name: `Peak ${index + 1}`, startSeconds: suggestion.startSeconds, endSeconds: suggestion.endSeconds };
     setFavorites(prev => prev.map(song => {
         if (song.videoId === videoId) {
             const currentSections = song.sections || [];
             const alreadyExists = currentSections.some(sec => sec.startSeconds === newSection.startSeconds && sec.endSeconds === newSection.endSeconds);
             if (alreadyExists) { console.warn(`Suggestion already saved`); return song; }
             return { ...song, sections: [...currentSections, newSection].sort((a, b) => a.startSeconds - b.startSeconds) };
         } return song;
     }));
  };

  // Add section via inline form (manual)
  const handleAddManualSection = (videoId: string) => {
    if (!manualSectionName.trim() || !manualSectionStart || !manualSectionEnd) { alert("Fill all fields."); return; } const start = parseFloat(manualSectionStart); const end = parseFloat(manualSectionEnd); if (isNaN(start) || isNaN(end) || start < 0 || end <= start) { alert("Invalid times."); return; }
    const newSection: SongSection = { id: generateId(), name: manualSectionName.trim(), startSeconds: start, endSeconds: end };
    setFavorites(prev => prev.map(song => song.videoId === videoId ? { ...song, sections: [...(song.sections || []), newSection].sort((a, b) => a.startSeconds - b.startSeconds) } : song));
    setManualSectionName(''); setManualSectionStart(''); setManualSectionEnd(''); setShowManualAddForm(null);
  };

  // Remove a SAVED section
  const removeSavedSection = (videoId: string, sectionId: string) => {
    setFavorites(prev => prev.map(song => song.videoId === videoId ? { ...song, sections: (song.sections || []).filter(sec => sec.id !== sectionId) } : song));
    if (currentlyPlaying?.videoId === videoId && currentlyPlaying?.section && 'id' in currentlyPlaying.section && currentlyPlaying.section.id === sectionId) { setCurrentlyPlaying(null); }
  };

  // --- Manual Section Marking via Player ---
  const handleMarkStart = () => { if (playerState !== PlayerState.PLAYING && playerState !== PlayerState.PAUSED) return; setStartMark(currentPlaybackTime); setEndMark(null); setIsMarking(true); setMarkedSectionName(""); };
  const handleMarkEnd = () => { if (!isMarking || startMark === null || currentPlaybackTime <= startMark) { alert("Start not set/end before start."); return; } setEndMark(currentPlaybackTime); setIsMarking(false); };
  const handleSaveMarkedSection = () => { if (startMark === null || endMark === null || endMark <= startMark || !currentlyPlaying?.videoId) { alert("Invalid times/no song."); return; } if (!markedSectionName.trim()) { alert("Enter name."); return; } const newSection: SongSection = { id: generateId(), name: markedSectionName.trim(), startSeconds: startMark, endSeconds: endMark }; setFavorites(prev => prev.map(song => song.videoId === currentlyPlaying.videoId ? { ...song, sections: [...(song.sections || []), newSection].sort((a, b) => a.startSeconds - b.startSeconds) } : song)); cancelMarking(); };
  const cancelMarking = () => { setStartMark(null); setEndMark(null); setIsMarking(false); setMarkedSectionName(""); };

  // --- Playback Control ---
  const playSongOrSection = (videoId: string, section: SongSection | SuggestedChunkData | null = null) => {
    console.log("Setting play:", { videoId, section });
    setCurrentlyPlaying({ videoId, section });
    if (section === null || (section && 'id' in section)) { cancelMarking(); }
  };

  // --- Player Event Handlers ---
  const handlePlayerReady = useCallback((event: { target: YouTubePlayerType }) => {}, []);
  const handlePlayerStateChange = useCallback((event: { data: number; target: YouTubePlayerType }) => { setPlayerState(event.data); if(event.data === PlayerState.ENDED || event.data === PlayerState.UNSTARTED) { cancelMarking(); } }, []);
  const handlePlayerError = useCallback((event: { data: number; target: YouTubePlayerType }) => { console.error("Player Error:", event.data); let message = `Player Error: Code ${event.data}.`; if (event.data === 101 || event.data === 150) message = "Embedding disabled for this video."; setErrorAdd(message); setCurrentlyPlaying(null); cancelMarking(); }, []);
  const handleTimeUpdate = useCallback((time: number) => { setCurrentPlaybackTime(time); }, []);

  // --- Main Render ---
  return (
    // Use your preferred page wrapper / container class from theme setup
    <div className={favoriteStyles.pageWrapper || favoriteStyles.container}>
      {/* Optional: Add Navbar here if not in layout */}
      {/* <Navbar /> */}
      <div className={favoriteStyles.container}> {/* Inner container for content */}
          <Link href="/" className={styles.navButton} style={{ marginBottom: '1.5rem', display: 'inline-block' }}> &larr; Back Home </Link>
          <h1 className={favoriteStyles.title}>My Favorite Songs</h1>

          {/* Add Song Form */}
          <form onSubmit={addFavorite} className={favoriteStyles.addForm}>
              <input type="url" placeholder="Enter YouTube Video URL" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} required className={favoriteStyles.inputField} disabled={isLoadingAdd}/>
              {/* Use themed button styles */}
              <button type="submit" className={favoriteStyles.analyzeButton || styles.analyzeButton} disabled={isLoadingAdd}>
                  {isLoadingAdd ? 'Analyzing...' : 'Add & Suggest'}
              </button>
          </form>
          {errorAdd && <p className={favoriteStyles.errorMessage}>{errorAdd}</p>}

          {/* Player & Marking Area */}
          <div className={favoriteStyles.playerArea}>
               <div className={favoriteStyles.playerContainer}> {currentlyPlaying?.videoId ? ( <YouTubePlayer ref={playerComponentRef} videoId={currentlyPlaying.videoId} section={currentlyPlaying.section} onPlayerReady={handlePlayerReady} onStateChange={handlePlayerStateChange} onError={handlePlayerError} onTimeUpdate={handleTimeUpdate} /> ) : ( <div className={favoriteStyles.playerPlaceholder}>Select a song or section to play</div> )} </div>
               {currentlyPlaying?.videoId && ( <div className={favoriteStyles.markingControls}> <div className={favoriteStyles.playbackTime}> Time: {formatTime(currentPlaybackTime)} </div> <div className={favoriteStyles.markButtons}> <button onClick={handleMarkStart} disabled={isMarking || (playerState !== PlayerState.PLAYING && playerState !== PlayerState.PAUSED)} className={favoriteStyles.actionButton}> 📌 Mark Start {startMark !== null ? `(${formatTime(startMark)})` : ''} </button> <button onClick={handleMarkEnd} disabled={!isMarking || startMark === null || (playerState !== PlayerState.PLAYING && playerState !== PlayerState.PAUSED)} className={favoriteStyles.actionButton}> 🏁 Mark End {endMark !== null ? `(${formatTime(endMark)})` : ''} </button> </div> {startMark !== null && endMark !== null && ( <div className={favoriteStyles.saveSectionArea}> <input type="text" placeholder="Name this section" value={markedSectionName} onChange={(e) => setMarkedSectionName(e.target.value)} className={favoriteStyles.inputField} /> <button onClick={handleSaveMarkedSection} disabled={!markedSectionName.trim()} className={`${favoriteStyles.actionButton} ${favoriteStyles.sectionSaveButton}`}> 💾 Save Marked </button> <button onClick={cancelMarking} className={favoriteStyles.actionButton} title="Cancel Marking">✖️ Cancel</button> </div> )} {isMarking && startMark !== null && endMark === null && ( <div className={favoriteStyles.markingIndicator}> Marking from {formatTime(startMark)}... Click 'Mark End'. <button onClick={cancelMarking} className={favoriteStyles.actionButtonSmall} title="Cancel Marking">Cancel</button> </div> )} </div> )}
          </div>

          {/* Favorites List Area */}
          <div className={favoriteStyles.listArea}>
               {!isClient ? ( <p>Loading favorites...</p> ) : (
                 favorites.length === 0 ? ( <p>No favorites added yet.</p> ) : (
                   <ul className={favoriteStyles.songList}>
                     {favorites.map(song => (
                       <li key={song.videoId} className={favoriteStyles.songItemContainer}>
                         {/* Song Info Row */}
                         <div className={favoriteStyles.songItem}>
                           <img src={song.thumbnailUrl} alt={song.title} className={favoriteStyles.thumbnail} />
                           <div className={favoriteStyles.songDetails}>
                               <span className={favoriteStyles.songTitle}>{song.title}</span>
                               {/* Display Total Duration if available */}
                               {song.durationSeconds && <span className={favoriteStyles.songDuration}>({formatTime(song.durationSeconds)})</span>}
                           </div>
                           <div className={favoriteStyles.songActions}>
                             <button onClick={() => playSongOrSection(song.videoId, null)} className={favoriteStyles.actionButton} title="Play Full Song">▶️ Play</button>
                             <button onClick={() => setShowManualAddForm(showManualAddForm === song.videoId ? null : song.videoId)} className={favoriteStyles.actionButton} title="Add Custom Section">➕ Add Custom</button>
                             <button onClick={() => removeFavorite(song.videoId)} className={favoriteStyles.removeButton} title="Remove Favorite">❌</button>
                           </div>
                         </div>

                         {/* Inline Manual Add Section Form */}
                         {showManualAddForm === song.videoId && ( <form className={favoriteStyles.sectionForm} onSubmit={(e) => { e.preventDefault(); handleAddManualSection(song.videoId); }}> <input type="text" placeholder="Custom Section Name" value={manualSectionName} onChange={e => setManualSectionName(e.target.value)} required className={favoriteStyles.inputField} /> <input type="number" placeholder="Start (sec)" value={manualSectionStart} onChange={e => setManualSectionStart(e.target.value)} required min="0" step="0.1" className={favoriteStyles.inputField}/> <input type="number" placeholder="End (sec)" value={manualSectionEnd} onChange={e => setManualSectionEnd(e.target.value)} required min="0" step="0.1" className={favoriteStyles.inputField}/> <button type="submit" className={`${favoriteStyles.actionButton} ${favoriteStyles.sectionSaveButton}`}> Save Custom </button> </form> )}

                         {/* *** ADD TIMELINE VISUALIZER *** */}
                         {/* Conditionally render only if duration is known and positive */}
                         {song.durationSeconds && song.durationSeconds > 0 ? (
                           <TimelineVisualizer
                             // Ensure sections is always an array
                             sections={Array.isArray(song.sections) ? song.sections : []}
                             totalDuration={song.durationSeconds}
                             onSectionClick={(section) => playSongOrSection(song.videoId, section)}
                           />
                         ) : (
                           // Show placeholder if duration unknown - use specific class
                           <div className={favoriteStyles.noTimeline}>Timeline unavailable</div>
                         )}
                         {/* *** END TIMELINE *** */}

                         {/* List of SAVED Sections */}
                         {Array.isArray(song.sections) && song.sections.length > 0 && (
                             <div className={favoriteStyles.sectionListContainer}>
                                 <h4 className={favoriteStyles.sectionListHeader}>Your Saved Sections:</h4>
                                 <ul className={favoriteStyles.sectionList}>
                                   {song.sections.map(section => ( <li key={section.id} className={favoriteStyles.sectionItem}> <span className={favoriteStyles.sectionName}>{section.name} ({formatTime(section.startSeconds)} - {formatTime(section.endSeconds)})</span> <div className={favoriteStyles.sectionActions}> <button onClick={() => playSongOrSection(song.videoId, section)} className={favoriteStyles.actionButtonSmall} title="Play Saved Section">▶️</button> <button onClick={() => removeSavedSection(song.videoId, section.id)} className={favoriteStyles.removeButtonSmall} title="Remove Saved Section">🗑️</button> </div> </li> ))}
                                 </ul>
                             </div>
                         )}
                         {/* List of ORIGINAL SUGGESTIONS (Keep if desired) */}
                         {Array.isArray(song.originalSuggestions) && song.originalSuggestions.length > 0 && (
                             <div className={`${favoriteStyles.sectionListContainer} ${favoriteStyles.suggestionsContainer}`}>
                                 <h4 className={favoriteStyles.sectionListHeader}>Suggested Peaks ({song.originalSuggestions.length}):</h4>
                                 <ul className={favoriteStyles.sectionList}>
                                   {song.originalSuggestions.map((suggestion, index) => {
                                       const isSaved = Array.isArray(song.sections) && song.sections.some((sec) => sec.startSeconds === suggestion.startSeconds && sec.endSeconds === suggestion.endSeconds);
                                       return (
                                         <li key={`orig-${index}-${suggestion.startSeconds}`} className={`${favoriteStyles.sectionItem} ${isSaved ? favoriteStyles.suggestionSaved : ''}`}>
                                             <span className={favoriteStyles.sectionName}> Suggestion {index + 1} ({formatTime(suggestion.startSeconds)} - {formatTime(suggestion.endSeconds)}) </span>
                                             <div className={favoriteStyles.sectionActions}>
                                                 <button onClick={() => playSongOrSection(song.videoId, suggestion)} className={favoriteStyles.actionButtonSmall} title="Preview Suggestion">▶️</button>
                                                 {isSaved ? (
                                                     <button onClick={() => { const savedSection = Array.isArray(song.sections) ? song.sections.find(sec => sec.startSeconds === suggestion.startSeconds && sec.endSeconds === suggestion.endSeconds) : undefined; if(savedSection) removeSavedSection(song.videoId, savedSection.id); } } className={favoriteStyles.toggleSaveButtonActive} title="Remove from Saved">⭐</button>
                                                 ) : (
                                                     <button onClick={() => promoteSuggestionToSection(song.videoId, suggestion, index)} className={favoriteStyles.toggleSaveButtonInactive} title="Add to Saved">☆</button>
                                                 )}
                                             </div>
                                         </li>
                                       );
                                   })}
                                 </ul>
                             </div>
                         )}
                       </li>
                     ))}
                   </ul>
                 )
               )}
           </div>
       </div> {/* End Inner container */}
    </div> // End Page Wrapper / Main Container
  );
}

