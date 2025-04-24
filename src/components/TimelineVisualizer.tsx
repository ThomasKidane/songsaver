// src/components/TimelineVisualizer.tsx
import React from 'react';
import { SongSection } from '@/types'; // Adjust path if needed
import styles from './TimelineVisualizer.module.css';

interface TimelineVisualizerProps {
  sections: SongSection[];
  totalDuration: number; // Duration in seconds MUST be provided and > 0
  onSectionClick?: (section: SongSection) => void; // Optional click handler
}

// Helper to format time for tooltips
const formatTimelineTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds - Math.floor(seconds)) * 10);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}.${millis}`;
};

const TimelineVisualizer: React.FC<TimelineVisualizerProps> = ({
  sections,
  totalDuration,
  onSectionClick
}) => {
  // Important: Do not render if duration is invalid or missing
  if (!totalDuration || totalDuration <= 0) {
    return null; // Or return a placeholder if desired
  }

  // Ensure sections is an array
  const validSections = Array.isArray(sections) ? sections : [];

  // Helper to calculate percentage, clamped between 0 and 100
  const toPercent = (value: number) => Math.max(0, Math.min(100, (value / totalDuration) * 100));

  return (
    <div className={styles.timelineContainer} aria-label="Song Sections Timeline">
      <div className={styles.timelineTrack}>
        {/* Map over valid sections to create markers */}
        {validSections.map((section) => {
          const leftPercent = toPercent(section.startSeconds);
          const endPercent = toPercent(section.endSeconds);
          // Calculate width based on clamped start/end percentages
          const widthPercent = Math.max(0.5, endPercent - leftPercent); // Min 0.5% width

          // Skip rendering if calculation results in invalid width or position
          if (isNaN(leftPercent) || isNaN(widthPercent) || widthPercent <= 0 || leftPercent >= 100) {
            console.warn("Skipping invalid section in timeline:", section, {leftPercent, widthPercent});
            return null;
          }

          const style = {
            left: `${leftPercent}%`,
            // Clamp width to ensure it doesn't exceed the track boundaries from its start position
            width: `${Math.min(widthPercent, 100 - leftPercent)}%`,
          };

          const title = `${section.name} (${formatTimelineTime(section.startSeconds)} - ${formatTimelineTime(section.endSeconds)})`;

          return (
            <button // Use button for accessibility
              type="button"
              key={section.id}
              className={styles.sectionMarker}
              style={style}
              title={title} // Tooltip shows times/name
              onClick={() => onSectionClick?.(section)}
              aria-label={`Play section: ${title}`}
            >
              {/* Show label inside marker only if it's wide enough */}
              {widthPercent > 8 && <span className={styles.markerLabel}>{section.name}</span>}
            </button>
          );
        })}
      </div>
      {/* Optional: Add time labels below the track */}
      <div className={styles.timeLabels}>
         <span>0:00</span>
         <span>{formatTime(totalDuration)}</span>
      </div>
    </div>
  );
};

// Helper to format seconds into MM:SS (used in timeLabels)
const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const roundSeconds = Math.floor(seconds);
    const minutes = Math.floor(roundSeconds / 60);
    const secs = roundSeconds % 60;
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
};


export default TimelineVisualizer;
