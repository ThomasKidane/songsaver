// src/components/VisualTimeline.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SongSection } from '@/types';
import styles from './VisualTimeline.module.css';

interface VisualTimelineProps {
  sections: SongSection[];
  totalDuration: number;
  onSectionClick?: (section: SongSection) => void;
  onSectionUpdate?: (sectionId: string, newStart: number, newEnd: number) => void;
}

const formatTimelineTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
};

interface DragInfo {
  sectionId: string;
  handle: 'start' | 'end';
  initialX: number;
  initialStart: number;
  initialEnd: number;
  timelineWidth: number;
  currentStart: number;
  currentEnd: number;
}

const MIN_SECTION_DURATION = 0.1; // Minimum duration in seconds

const VisualTimeline: React.FC<VisualTimelineProps> = ({
  sections,
  totalDuration,
  onSectionClick,
  onSectionUpdate
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragInfo | null>(null);

  // --- Pointer Move Handler ---
  const handlePointerMove = useCallback((e: PointerEvent) => {
    // Use functional update to get the latest state and prevent stale closures
    setDragState(prevDragState => {
        if (!prevDragState || !timelineRef.current) return prevDragState; // Exit if no active drag

        e.preventDefault(); // Prevent text selection, etc.

        const dx = e.clientX - prevDragState.initialX;
        const timelineWidth = prevDragState.timelineWidth;
        if (timelineWidth <= 0) return prevDragState; // Safety check

        const timeChange = (dx / timelineWidth) * totalDuration;

        let newStart = prevDragState.initialStart;
        let newEnd = prevDragState.initialEnd;

        if (prevDragState.handle === 'start') {
            // Calculate proposed new start
            let proposedStart = prevDragState.initialStart + timeChange;
            // Clamp: >= 0 and ensure it's less than end time by min duration
            newStart = Math.max(0, Math.min(prevDragState.initialEnd - MIN_SECTION_DURATION, proposedStart));
            // Ensure end time doesn't change when dragging start
            newEnd = prevDragState.initialEnd;
        } else { // handle === 'end'
            // Calculate proposed new end
            let proposedEnd = prevDragState.initialEnd + timeChange;
            // Clamp: >= start time + min duration and <= totalDuration
            newEnd = Math.max(prevDragState.initialStart + MIN_SECTION_DURATION, Math.min(totalDuration, proposedEnd));
            // Ensure start time doesn't change when dragging end
            newStart = prevDragState.initialStart;
        }

        // Update the state for immediate visual feedback
        // Only update currentStart/currentEnd which drive the visual render
        return { ...prevDragState, currentStart: newStart, currentEnd: newEnd };
    });
  }, [totalDuration]);

  // --- Pointer Up Handler ---
  const handlePointerUp = useCallback((e: PointerEvent) => {
    console.log("Pointer Up Triggered");
    // Use functional update to ensure we have the absolute latest drag state
    setDragState(currentDragState => {
        if (!currentDragState) {
             console.log("Pointer Up: No active drag state found.");
             return null; // No drag was active
        }

        console.log("Pointer Up: Processing drag state", currentDragState);

        // Final times are the 'current' times from the last computed state
        const finalStart = currentDragState.currentStart;
        const finalEnd = currentDragState.currentEnd;

        // Check if times actually changed significantly
        const startChanged = Math.abs(finalStart - currentDragState.initialStart) > 0.01;
        const endChanged = Math.abs(finalEnd - currentDragState.initialEnd) > 0.01;

        if (startChanged || endChanged) {
            console.log(`Pointer Up: Times changed, calling onSectionUpdate with ${finalStart.toFixed(3)} - ${finalEnd.toFixed(3)}`);
            onSectionUpdate?.(currentDragState.sectionId, finalStart, finalEnd);
        } else {
             console.log("Pointer Up: No significant change detected.");
        }

        // Cleanup: Remove global listeners and cursor style
        document.body.classList.remove(styles.dragging);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp); // Include cancel

        return null; // *** CRITICAL: Reset drag state ***
    });
  }, [onSectionUpdate, handlePointerMove]); // Ensure handlePointerMove is stable via useCallback

  // --- Pointer Down Handler ---
  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    section: SongSection,
    handle: 'start' | 'end'
  ) => {
    console.log(`Pointer Down on ${handle} handle for section ${section.id} at ${e.clientX}`);
    e.preventDefault();
    e.stopPropagation(); // Prevent click event on marker body

    if (!timelineRef.current) { console.error("Timeline ref not found."); return; }
    document.body.classList.add(styles.dragging);

    const timelineRect = timelineRef.current.getBoundingClientRect();
    if (timelineRect.width <= 0) { console.error("Timeline width is zero."); return; }

    // Set initial drag state
    setDragState({
      sectionId: section.id,
      handle: handle,
      initialX: e.clientX,
      initialStart: section.startSeconds,
      initialEnd: section.endSeconds,
      timelineWidth: timelineRect.width,
      currentStart: section.startSeconds, // Init current times
      currentEnd: section.endSeconds,
    });

    // Add global listeners -> these MUST be removed in handlePointerUp
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

   // --- Effect for Unmount Cleanup ---
   // Ensures listeners are removed if the component unmounts mid-drag
   useEffect(() => {
       return () => {
           // Check if listeners might still be attached when unmounting
           console.log("VisualTimeline Unmount Cleanup");
           document.body.classList.remove(styles.dragging);
           window.removeEventListener('pointermove', handlePointerMove);
           window.removeEventListener('pointerup', handlePointerUp);
           window.removeEventListener('pointercancel', handlePointerUp);
       };
   }, [handlePointerMove, handlePointerUp]); // Re-run if handlers change (due to dependencies)


  // --- Rendering Logic ---
  if (!totalDuration || totalDuration <= 0) return null;
  const validSections = Array.isArray(sections) ? sections : [];
  const toPercent = (value: number) => Math.max(0, Math.min(100, (value / totalDuration) * 100));

  return (
    <div className={styles.timelineWrapper} aria-label="Song Sections Timeline">
      <div ref={timelineRef} className={styles.timelineTrack}>
        {validSections.map((section) => {
          // Use dragState if actively dragging this section, otherwise use props
          const isDraggingThis = dragState?.sectionId === section.id;
          const displayStart = isDraggingThis ? dragState.currentStart : section.startSeconds;
          const displayEnd = isDraggingThis ? dragState.currentEnd : section.endSeconds;

          const leftPercent = toPercent(displayStart);
          const endPercent = toPercent(displayEnd);
          // Calculate width based on possibly updated display times
          const widthPercent = Math.max(0.2, endPercent - leftPercent); // Min width

          // Prevent rendering invalid markers
          if (isNaN(leftPercent) || isNaN(widthPercent) || widthPercent <= 0 || leftPercent >= 100 || displayEnd <= displayStart) {
            console.warn("VisualTimeline: Skipping invalid marker
