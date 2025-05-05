// src/components/VisualTimeline.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SongSection } from '@/types'; // Adjust path if needed
import styles from './VisualTimeline.module.css';

interface VisualTimelineProps {
  sections: SongSection[];
  totalDuration: number;
  onSectionClick?: (section: SongSection) => void;
  onSectionUpdate?: (sectionId: string, newStart: number, newEnd: number) => void;
  onSectionCreate?: (start: number, end: number) => void;
}

// Helper to format time
const formatTimelineTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
};

// Interface for drag state
interface DragInfo {
  type: 'resize' | 'create';
  sectionId?: string; // Only for 'resize'
  handle?: 'start' | 'end'; // Only for 'resize'
  initialX: number;
  initialStart: number;
  initialEnd: number;
  timelineWidth: number;
  // Live times during drag for visual feedback
  currentStart: number;
  currentEnd: number;
}

const MIN_SECTION_DURATION = 0.2; // Minimum duration in seconds

const VisualTimeline: React.FC<VisualTimelineProps> = ({
  sections,
  totalDuration,
  onSectionClick,
  onSectionUpdate,
  onSectionCreate // Receive create callback
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragInfo | null>(null);
  // State for the temporary creation box visual
  const [creationBox, setCreationBox] = useState<{ start: number; end: number } | null>(null);
  // *** Ref to prevent double pointer up execution ***
  const isProcessingPointerUp = useRef(false);

  // --- Convert pixel X coordinate to time ---
  const xToTime = useCallback((clientX: number): number => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const time = (relativeX / rect.width) * totalDuration;
    return Math.max(0, Math.min(totalDuration, time)); // Clamp time
  }, [totalDuration]);

  // --- Pointer Move Handler ---
  const handlePointerMove = useCallback((e: PointerEvent) => {
    setDragState(prevDragState => {
        if (!prevDragState || !timelineRef.current) return prevDragState;
        e.preventDefault();

        const currentTime = xToTime(e.clientX);
        let newStart = prevDragState.currentStart;
        let newEnd = prevDragState.currentEnd;

        if (prevDragState.type === 'resize') {
            if (prevDragState.handle === 'start') {
                newStart = Math.max(0, Math.min(prevDragState.currentEnd - MIN_SECTION_DURATION, currentTime));
            } else { // handle === 'end'
                newEnd = Math.max(prevDragState.currentStart + MIN_SECTION_DURATION, Math.min(totalDuration, currentTime));
            }
        } else if (prevDragState.type === 'create') {
             newStart = Math.min(prevDragState.initialStart, currentTime);
             newEnd = Math.max(prevDragState.initialStart, currentTime);
             if (newEnd - newStart < MIN_SECTION_DURATION) {
                 if (currentTime > prevDragState.initialStart) newEnd = newStart + MIN_SECTION_DURATION;
                 else newStart = newEnd - MIN_SECTION_DURATION;
             }
             // Update temporary creation box visual state directly
             setCreationBox({ start: newStart, end: newEnd });
        }
        // Update drag state's current times for render
        return { ...prevDragState, currentStart: newStart, currentEnd: newEnd };
    });
  }, [totalDuration, xToTime]);

  // --- UPDATED Pointer Up Handler (with flag) ---
  const handlePointerUp = useCallback(() => {
    // *** Prevent double execution ***
    if (isProcessingPointerUp.current) {
        console.log("Pointer Up: Already processing, skipping.");
        return;
    }
    isProcessingPointerUp.current = true; // Set flag immediately
    console.log("Pointer Up: Starting processing...");

    // Use functional update to get latest state
    setDragState(currentDragState => {
        if (!currentDragState) {
            console.log("Pointer Up: No drag state found.");
            isProcessingPointerUp.current = false; // Reset flag
            return null;
        }

        // Cleanup listeners FIRST
        document.body.classList.remove(styles.draggingResize, styles.draggingCreate);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
        console.log("Pointer Up: Listeners removed.");

        const finalStart = currentDragState.currentStart;
        const finalEnd = currentDragState.currentEnd;

        // Call appropriate callback (only once now)
        if (currentDragState.type === 'resize') {
            const startChanged = Math.abs(finalStart - currentDragState.initialStart) > 0.01;
            const endChanged = Math.abs(finalEnd - currentDragState.initialEnd) > 0.01;
            if (startChanged || endChanged) {
                console.log(`Pointer Up (Resize): Calling onSectionUpdate ${finalStart.toFixed(3)}-${finalEnd.toFixed(3)}`);
                onSectionUpdate?.(currentDragState.sectionId!, finalStart, finalEnd);
            } else { console.log("Pointer Up (Resize): No significant change."); }

        } else if (currentDragState.type === 'create') {
             if (finalEnd - finalStart >= MIN_SECTION_DURATION) {
                 console.log(`Pointer Up (Create): Calling onSectionCreate ${finalStart.toFixed(3)}-${finalEnd.toFixed(3)}`);
                 onSectionCreate?.(finalStart, finalEnd); // <<< Called only once
             } else { console.log("Pointer Up (Create): Duration too short."); }
             setCreationBox(null); // Clear visual box
        }

        console.log("Pointer Up: Callback finished. Resetting flag.");
        // Reset processing flag AFTER logic is done
        isProcessingPointerUp.current = false;
        return null; // Reset drag state
    });
  }, [onSectionUpdate, onSectionCreate, handlePointerMove]); // Dependencies

  // --- Pointer Down Handlers ---
  // On Handle (for resizing)
  const handleHandlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    section: SongSection,
    handle: 'start' | 'end'
  ) => {
    // Prevent starting a 'create' drag if pointer down is on a handle
    e.stopPropagation();
    e.preventDefault();
    if (!timelineRef.current) return;
    document.body.classList.add(styles.draggingResize);

    const timelineRect = timelineRef.current.getBoundingClientRect();
    if (timelineRect.width <= 0) return;

    setDragState({
      type: 'resize',
      sectionId: section.id,
      handle: handle,
      initialX: e.clientX,
      initialStart: section.startSeconds,
      initialEnd: section.endSeconds,
      timelineWidth: timelineRect.width,
      currentStart: section.startSeconds,
      currentEnd: section.endSeconds,
    });

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  // On Track (for creation)
  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only trigger if clicking directly on the track, not a child element like a marker or handle
    if (e.target !== timelineRef.current) {
        // console.log("Track Pointer Down skipped - target was not track element."); // Optional log
        return;
    }

    e.preventDefault();
    if (!timelineRef.current) return;
    document.body.classList.add(styles.draggingCreate);

    const timelineRect = timelineRef.current.getBoundingClientRect();
    if (timelineRect.width <= 0) return;

    const startTime = xToTime(e.clientX);
    console.log(`Pointer Down on Track at time: ${startTime.toFixed(3)}`);

    setDragState({
        type: 'create',
        initialX: e.clientX,
        initialStart: startTime,
        initialEnd: startTime,
        timelineWidth: timelineRect.width,
        currentStart: startTime,
        currentEnd: startTime,
    });
    setCreationBox({ start: startTime, end: startTime });

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

   // --- Effect for Unmount Cleanup ---
   useEffect(() => {
       return () => {
           document.body.classList.remove(styles.draggingResize, styles.draggingCreate);
           window.removeEventListener('pointermove', handlePointerMove);
           window.removeEventListener('pointerup', handlePointerUp);
           window.removeEventListener('pointercancel', handlePointerUp);
           isProcessingPointerUp.current = false; // Reset ref on unmount
       };
   }, [handlePointerMove, handlePointerUp]);


  // --- Rendering Logic ---
  if (!totalDuration || totalDuration <= 0) return null;
  const validSections = Array.isArray(sections) ? sections : [];
  const toPercent = (value: number) => Math.max(0, Math.min(100, (value / totalDuration) * 100));

  return (
    <div className={styles.timelineWrapper} aria-label="Song Sections Timeline">
      {/* Pass pointer down handler for creation */}
      <div ref={timelineRef} className={styles.timelineTrack} onPointerDown={handleTrackPointerDown}>
        {/* Existing Section Markers */}
        {validSections.map((section) => {
          const isDraggingThisResize = dragState?.type === 'resize' && dragState.sectionId === section.id;
          const displayStart = isDraggingThisResize ? dragState.currentStart : section.startSeconds;
          const displayEnd = isDraggingThisResize ? dragState.currentEnd : section.endSeconds;

          const leftPercent = toPercent(displayStart);
          const endPercent = toPercent(displayEnd);
          const widthPercent = Math.max(0.2, endPercent - leftPercent); // Min visual width

          if (isNaN(leftPercent) || isNaN(widthPercent) || widthPercent <= 0 || leftPercent >= 100 || displayEnd <= displayStart) return null;

          const containerStyle = { left: `${leftPercent}%`, width: `${Math.min(widthPercent, 100 - leftPercent)}%`, zIndex: isDraggingThisResize ? 10 : 1 };
          const title = `${section.name} (${formatTimelineTime(section.startSeconds)} - ${formatTimelineTime(section.endSeconds)})`;
          const liveTitle = isDraggingThisResize ? `${section.name} (Dragging: ${formatTimelineTime(displayStart)} - ${formatTimelineTime(displayEnd)})` : title;

          return (
            <div key={section.id} className={styles.markerContainer} style={containerStyle} title={liveTitle}>
                <div className={`${styles.handle} ${styles.handleStart}`} onPointerDown={(e) => handleHandlePointerDown(e, section, 'start')} role="slider" aria-label={`Adjust start of ${section.name}`} aria-valuenow={displayStart} />
                <button type="button" className={styles.sectionMarkerBody} onClick={() => { if (!dragState) onSectionClick?.(section); }} aria-label={`Play section: ${section.name}`}>
                    <span className={styles.markerLabel}>{section.name}</span>
                </button>
                <div className={`${styles.handle} ${styles.handleEnd}`} onPointerDown={(e) => handleHandlePointerDown(e, section, 'end')} role="slider" aria-label={`Adjust end of ${section.name}`} aria-valuenow={displayEnd} />
            </div>
          );
        })}

        {/* Temporary Creation Box */}
        {dragState?.type === 'create' && creationBox && creationBox.end > creationBox.start && (
            <div
                className={styles.creationBox}
                style={{
                    left: `${toPercent(creationBox.start)}%`,
                    width: `${toPercent(creationBox.end) - toPercent(creationBox.start)}%`
                }}
                aria-hidden="true"
            />
        )}
      </div>
      {/* Time Labels */}
      <div className={styles.timeLabels}>
         <span>0:00</span>
         <span>{formatTimelineTime(totalDuration)}</span>
      </div>
    </div>
  );
};

export default VisualTimeline;

