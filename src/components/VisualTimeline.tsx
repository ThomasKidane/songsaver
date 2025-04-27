// src/components/VisualTimeline.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SongSection } from '@/types';
import styles from './VisualTimeline.module.css';

interface VisualTimelineProps {
  sections: SongSection[];
  totalDuration: number;
  onSectionClick?: (section: SongSection) => void;
  onSectionUpdate?: (sectionId: string, newStart: number, newEnd: number) => void;
  // New prop for creating sections via drag
  onSectionCreate?: (start: number, end: number) => void;
}

const formatTimelineTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
};

interface DragInfo {
  type: 'resize' | 'create';
  sectionId?: string; // Only for 'resize'
  handle?: 'start' | 'end'; // Only for 'resize'
  initialX: number;
  initialStart: number;
  initialEnd: number;
  timelineWidth: number;
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
  // State for the temporary creation box
  const [creationBox, setCreationBox] = useState<{ start: number; end: number } | null>(null);

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

        const currentTime = xToTime(e.clientX); // Get time at current pointer
        let newStart = prevDragState.currentStart;
        let newEnd = prevDragState.currentEnd;

        if (prevDragState.type === 'resize') {
            if (prevDragState.handle === 'start') {
                // Clamp start: >= 0, < currentEnd (minus buffer)
                newStart = Math.max(0, Math.min(prevDragState.currentEnd - MIN_SECTION_DURATION, currentTime));
            } else { // handle === 'end'
                // Clamp end: > currentStart (plus buffer), <= totalDuration
                newEnd = Math.max(prevDragState.currentStart + MIN_SECTION_DURATION, Math.min(totalDuration, currentTime));
            }
        } else if (prevDragState.type === 'create') {
             // Update start/end based on drag direction
             newStart = Math.min(prevDragState.initialStart, currentTime);
             newEnd = Math.max(prevDragState.initialStart, currentTime);
             // Enforce minimum duration while creating
             if (newEnd - newStart < MIN_SECTION_DURATION) {
                 if (currentTime > prevDragState.initialStart) newEnd = newStart + MIN_SECTION_DURATION;
                 else newStart = newEnd - MIN_SECTION_DURATION;
             }
             // Update temporary creation box visual state
             setCreationBox({ start: newStart, end: newEnd });
        }

        // Update drag state for immediate visual feedback
        return { ...prevDragState, currentStart: newStart, currentEnd: newEnd };
    });
  }, [totalDuration, xToTime]);

  // --- Pointer Up Handler ---
  const handlePointerUp = useCallback((e: PointerEvent) => {
    setDragState(currentDragState => {
        if (!currentDragState) return null;

        const finalStart = currentDragState.currentStart;
        const finalEnd = currentDragState.currentEnd;

        if (currentDragState.type === 'resize') {
            // Only call update if times actually changed
            const startChanged = Math.abs(finalStart - currentDragState.initialStart) > 0.01;
            const endChanged = Math.abs(finalEnd - currentDragState.initialEnd) > 0.01;
            if (startChanged || endChanged) {
                console.log(`Pointer Up (Resize): Calling onSectionUpdate ${finalStart.toFixed(3)}-${finalEnd.toFixed(3)}`);
                onSectionUpdate?.(currentDragState.sectionId!, finalStart, finalEnd);
            }
        } else if (currentDragState.type === 'create') {
             // Only call create if duration is valid
             if (finalEnd - finalStart >= MIN_SECTION_DURATION) {
                 console.log(`Pointer Up (Create): Calling onSectionCreate ${finalStart.toFixed(3)}-${finalEnd.toFixed(3)}`);
                 onSectionCreate?.(finalStart, finalEnd);
             }
             setCreationBox(null); // Clear temporary box
        }

        // Cleanup
        document.body.classList.remove(styles.draggingResize, styles.draggingCreate);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
        return null; // Reset drag state
    });
  }, [onSectionUpdate, onSectionCreate, handlePointerMove]);

  // --- Pointer Down Handlers ---
  // On Handle
  const handleHandlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    section: SongSection,
    handle: 'start' | 'end'
  ) => {
    e.preventDefault(); e.stopPropagation();
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
    // Only trigger if clicking directly on the track, not a marker/handle
    if (e.target !== timelineRef.current) return;

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
        initialEnd: startTime, // Start and end are same initially
        timelineWidth: timelineRect.width,
        currentStart: startTime,
        currentEnd: startTime,
    });
    setCreationBox({ start: startTime, end: startTime }); // Show initial box

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
       };
   }, [handlePointerMove, handlePointerUp]);


  // --- Rendering ---
  if (!totalDuration || totalDuration <= 0) return null;
  const validSections = Array.isArray(sections) ? sections : [];
  const toPercent = (value: number) => Math.max(0, Math.min(100, (value / totalDuration) * 100));

  return (
    <div className={styles.timelineWrapper} aria-label="Song Sections Timeline">
      {/* Pass pointer down handler for creation */}
      <div ref={timelineRef} className={styles.timelineTrack} onPointerDown={handleTrackPointerDown}>
        {/* Existing Section Markers */}
        {validSections.map((section) => {
          const isDraggingThis = dragState?.type === 'resize' && dragState.sectionId === section.id;
          const displayStart = isDraggingThis ? dragState.currentStart : section.startSeconds;
          const displayEnd = isDraggingThis ? dragState.currentEnd : section.endSeconds;

          const leftPercent = toPercent(displayStart);
          const endPercent = toPercent(displayEnd);
          const widthPercent = Math.max(0.2, endPercent - leftPercent);

          if (isNaN(leftPercent) || isNaN(widthPercent) || widthPercent <= 0 || leftPercent >= 100 || displayEnd <= displayStart) return null;

          const containerStyle = { left: `${leftPercent}%`, width: `${Math.min(widthPercent, 100 - leftPercent)}%`, zIndex: isDraggingThis ? 10 : 1 };
          const title = `${section.name} (${formatTimelineTime(section.startSeconds)} - ${formatTimelineTime(section.endSeconds)})`;
          const draggingTitle = `${section.name} (Dragging: ${formatTimelineTime(displayStart)} - ${formatTimelineTime(displayEnd)})`;

          return (
            <div key={section.id} className={styles.markerContainer} style={containerStyle} title={isDraggingThis ? draggingTitle : title}>
                <div className={`${styles.handle} ${styles.handleStart}`} onPointerDown={(e) => handleHandlePointerDown(e, section, 'start')} role="slider" aria-label={`Adjust start of ${section.name}`} />
                <button type="button" className={styles.sectionMarkerBody} onClick={() => { if (!dragState) onSectionClick?.(section); }} aria-label={`Play section: ${section.name}`}>
                    <span className={styles.markerLabel}>{section.name}</span>
                </button>
                <div className={`${styles.handle} ${styles.handleEnd}`} onPointerDown={(e) => handleHandlePointerDown(e, section, 'end')} role="slider" aria-label={`Adjust end of ${section.name}`} />
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
