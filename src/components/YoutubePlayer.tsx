// src/components/YouTubePlayer.tsx
import React, { useEffect, forwardRef, useImperativeHandle, useRef, useState } from 'react';
import YouTube, { YouTubeProps, YouTubePlayer as YouTubePlayerType } from 'react-youtube';
import { SongSection, SuggestedChunkData } from '@/types'; // Import both types
// Assuming you have this CSS module for the placeholder
import favoriteStyles from '../app/favorites/favorites.module.css';

interface YouTubePlayerComponentProps {
  videoId: string | null;
  // Allow section to be null, a saved SongSection, or a SuggestedChunkData for preview
  section?: SongSection | SuggestedChunkData | null;
  onPlayerReady: (event: { target: YouTubePlayerType }) => void;
  onStateChange: (event: { data: number; target: YouTubePlayerType }) => void;
  onError?: (event: { data: number; target: YouTubePlayerType }) => void;
  onTimeUpdate?: (time: number) => void; // Callback for time updates
}

export interface YouTubePlayerRef {
  getPlayer: () => YouTubePlayerType | null;
}

enum PlayerState {
  UNSTARTED = -1, ENDED = 0, PLAYING = 1, PAUSED = 2, BUFFERING = 3, CUED = 5,
}

const YouTubePlayer = forwardRef<YouTubePlayerRef, YouTubePlayerComponentProps>(
  ({ videoId, section = null, onPlayerReady, onStateChange, onError, onTimeUpdate }, ref) => {
    const internalPlayerRef = useRef<YouTubePlayerType | null>(null);
    const timeUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
    // Track the *previous* section prop to detect actual changes
    const previousSectionRef = useRef<SongSection | SuggestedChunkData | null | undefined>(undefined);

    useImperativeHandle(ref, () => ({ getPlayer: () => internalPlayerRef.current }));

    // --- Time Update Logic ---
    const startTimeUpdates = (player: YouTubePlayerType) => {
        clearInterval(timeUpdateIntervalRef.current!);
        timeUpdateIntervalRef.current = setInterval(() => {
            if (player && typeof player.getCurrentTime === 'function') {
                try {
                    const currentTime = player.getCurrentTime();
                    if (onTimeUpdate) { onTimeUpdate(currentTime); }
                } catch { clearInterval(timeUpdateIntervalRef.current!); }
            } else { clearInterval(timeUpdateIntervalRef.current!); }
        }, 500);
    };
    const stopTimeUpdates = () => { clearInterval(timeUpdateIntervalRef.current!); timeUpdateIntervalRef.current = null; };
    useEffect(() => { return () => { stopTimeUpdates(); }; }, []); // Cleanup interval

    // --- Player Event Handlers ---
    const handleReady: YouTubeProps['onReady'] = (event) => {
        console.log(">>> YouTubePlayer: Player Ready");
        internalPlayerRef.current = event.target;
        onPlayerReady(event);
        // If a videoId was present on mount, load it (with section if applicable)
        if (videoId) {
            loadSegmentOrVideo(videoId, section);
        }
    };
    const handleStateChange: YouTubeProps['onStateChange'] = (event) => {
        onStateChange(event);
        if (event.data === PlayerState.PLAYING) { startTimeUpdates(event.target); }
        else { stopTimeUpdates(); if ((event.data === PlayerState.PAUSED || event.data === PlayerState.ENDED) && onTimeUpdate) { try { onTimeUpdate(event.target.getCurrentTime()); } catch {} } }
    };

    // --- Load Segment/Video Function ---
    const loadSegmentOrVideo = (vid: string, seg: SongSection | SuggestedChunkData | null) => {
        const player = internalPlayerRef.current;
        // Ensure player is ready and has the necessary method
        if (!player || typeof player.loadVideoById !== 'function' || typeof player.getPlayerState !== 'function') {
            console.warn(">>> YouTubePlayer: Player not ready or loadVideoById unavailable during loadSegmentOrVideo call.");
            return;
        }
         // Check if the player is in a state where loading is safe (avoid interrupting certain states if needed)
        const currentState = player.getPlayerState();
        if (currentState === PlayerState.UNSTARTED || currentState === PlayerState.CUED || currentState === PlayerState.ENDED || currentState === PlayerState.PAUSED || currentState === PlayerState.PLAYING /* Allow interrupting play */) {
            const start = seg ? Math.floor(seg.startSeconds) : 0;
            const end = seg?.endSeconds ? Math.ceil(seg.endSeconds) : undefined;
            console.log(`>>> YouTubePlayer: Calling loadVideoById - videoId=${vid}, start=${start}, end=${end}`);
            try {
                player.loadVideoById({ videoId: vid, startSeconds: start, endSeconds: end });
            } catch (e) { console.error(">>> YouTubePlayer: Error calling loadVideoById:", e); }
        } else {
             console.warn(`>>> YouTubePlayer: Skipping loadVideoById due to player state: ${currentState}`);
        }
    }

    // --- REVISED Effect to load new video/section ---
    useEffect(() => {
      console.log(">>> YouTubePlayer Effect: videoId =", videoId, "New section =", section);
      const player = internalPlayerRef.current;
      const currentVideoIdInPlayer = player?.getVideoData?.()?.video_id;
      const previousSection = previousSectionRef.current; // Get previous section

      // Update previous section ref *after* comparisons for the next render cycle
      // Using a simple JSON representation for comparison, might need refinement for complex objects
      const currentSectionKey = section ? `${section.startSeconds}-${section.endSeconds}` : 'null';
      const previousSectionKey = previousSection ? `${previousSection.startSeconds}-${previousSection.endSeconds}` : 'null';
      const sectionChanged = currentSectionKey !== previousSectionKey;

      console.log(`>>> YouTubePlayer Effect: PrevSectionKey=${previousSectionKey}, CurrSectionKey=${currentSectionKey}, SectionChanged=${sectionChanged}`);


      // Store current section for next effect run BEFORE potentially returning
      previousSectionRef.current = section;

      // Only proceed if player is ready
      if (!player || typeof player.getPlayerState !== 'function') {
        console.log(">>> YouTubePlayer Effect: Player not ready, skipping.");
        return;
      }

      // Case 1: New Video ID requested
      if (videoId && videoId !== currentVideoIdInPlayer) {
        console.log(`>>> YouTubePlayer Effect: Loading NEW video ID ${videoId}. Section: ${section ? 'Yes' : 'No'}`);
        loadSegmentOrVideo(videoId, section);
      }
      // Case 2: Same Video ID, but Section has meaningfully changed
      else if (videoId && videoId === currentVideoIdInPlayer && sectionChanged) {
          console.log(`>>> YouTubePlayer Effect: SAME video ID ${videoId}, section CHANGED. Loading section.`);
          loadSegmentOrVideo(videoId, section); // Load the new section (or null for full video)
      }
      // Case 3: Props changed but no actual video/section load needed (e.g., only parent state change)
      else {
           console.log(`>>> YouTubePlayer Effect: No load needed (Same Video: ${videoId === currentVideoIdInPlayer}, Section Changed: ${sectionChanged})`);
      }

    }, [videoId, section]); // Re-run when videoId or section prop changes


    // --- Player Options ---
    const opts: YouTubeProps['opts'] = {
      height: '390',
      width: '100%', // Responsive width
      playerVars: {
        autoplay: 1,
        controls: 1,
        // Consider adding origin if deploying: origin: window.location.origin
      },
    };

    // Render placeholder if no videoId
    if (!videoId) {
      // Use the placeholder style from favorites.module.css
      return <div className={favoriteStyles.playerPlaceholder}>Select a song or section to play.</div>;
    }

    // Render YouTube component
    // Use a key that changes when the videoId changes to ensure full re-mount for new videos
    return (
      <YouTube
        key={videoId} // Key based on videoId forces remount for new video
        videoId={videoId}
        opts={opts}
        onReady={handleReady}
        onStateChange={handleStateChange}
        onError={onError}
        className="youtube-player-iframe" // Class for potential styling
      />
    );
  }
);

YouTubePlayer.displayName = 'YouTubePlayer';
export default YouTubePlayer;
