// src/components/SuggestedChunkItem.tsx
import React from 'react';
import { SuggestedChunkData } from '@/types';
import favoriteStyles from '../app/favorites/favorites.module.css'; // Reuse styles

interface SuggestedChunkItemProps {
  chunk: SuggestedChunkData;
  videoId: string;
  index: number;
  isSelected: boolean;
  onSelectToggle: (chunk: SuggestedChunkData) => void;
  onPreview: (videoId: string, chunk: SuggestedChunkData) => void;
  formatTime: (seconds: number) => string; // Pass formatter down
}

const SuggestedChunkItem: React.FC<SuggestedChunkItemProps> = ({
  chunk,
  videoId,
  index,
  isSelected,
  onSelectToggle,
  onPreview,
  formatTime,
}) => {
  const handleCheckboxChange = () => {
    onSelectToggle(chunk);
  };

  return (
    <li className={favoriteStyles.suggestedChunkItem}>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={handleCheckboxChange}
        id={`suggested-chunk-${index}`}
        className={favoriteStyles.suggestedChunkCheckbox}
      />
      <label htmlFor={`suggested-chunk-${index}`} className={favoriteStyles.suggestedChunkLabel}>
        Suggestion {index + 1} ({formatTime(chunk.startSeconds)} - {formatTime(chunk.endSeconds)})
      </label>
      <button
        onClick={() => onPreview(videoId, chunk)}
        className={favoriteStyles.actionButtonSmall} // Reuse small button style
        title="Preview Section"
      >
        ▶️ Preview
      </button>
    </li>
  );
};

export default SuggestedChunkItem;

