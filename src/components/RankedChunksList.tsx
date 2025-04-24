// src/components/RankedChunksList.tsx
import React from 'react';
import styles from '../app/page.module.css'; // Adjust path if needed

export interface Chunk {
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  intensity: number; // Assuming intensity is 0.0 to 1.0
}

interface RankedChunksListProps {
  chunks: Chunk[];
  onPlayChunk: (chunk: Chunk) => void;
}

// Define a threshold for "upbeat" based on replay intensity
const UPBEAT_THRESHOLD = 0.7; // Adjust as needed

export default function RankedChunksList({ chunks, onPlayChunk }: RankedChunksListProps) {
  if (!chunks || chunks.length === 0) {
    return <div style={{ color: '#666', marginTop: '1rem' }}>No popular chunks found or video not analyzed yet.</div>;
  }

  const formatTime = (seconds: number): string => {
    const roundSeconds = Math.round(seconds);
    const minutes = Math.floor(roundSeconds / 60);
    const secs = roundSeconds % 60;
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div>
      <h2>Most Replayed Chunks (Ranked):</h2>
      <ul>
        {chunks.map((chunk: Chunk, index: number) => {
          // Determine the icon based on intensity
          const beatIcon = chunk.intensity >= UPBEAT_THRESHOLD ? '🔥' : '🎵'; // Fire for upbeat, Note for normal

          return (
            <li key={index} className={styles.chunkListItem}>
              <span className={styles.chunkInfo}>
                 Rank {index + 1}: {formatTime(chunk.startSeconds)} - {formatTime(chunk.endSeconds)} ({chunk.durationSeconds.toFixed(1)}s)
              </span>
              <button
                onClick={() => onPlayChunk(chunk)}
                className={styles.playButton}
                title={chunk.intensity >= UPBEAT_THRESHOLD ? 'Play Upbeat Chunk' : 'Play Chunk'}
               >
                {beatIcon} {/* Display the icon */}
                Play Chunk
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
