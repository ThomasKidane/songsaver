// src/components/YouTubeInput.tsx
import React, { useState } from 'react';
import styles from '../app/page.module.css'; // Adjust path if needed

interface YouTubeInputProps {
  onSubmit: (videoId: string) => void;
}

export default function YouTubeInput({ onSubmit }: YouTubeInputProps) {
  const [url, setUrl] = useState<string>('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const videoId = extractVideoId(url);
    if (videoId) {
      onSubmit(videoId);
    } else {
      alert('Invalid YouTube URL');
    }
  };

  const extractVideoId = (url: string): string | null => {
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  return (
    // Use the form style class
    <form onSubmit={handleSubmit} className={styles.inputForm}>
      <input
        type="text"
        value={url}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
        placeholder="Enter YouTube Music Video URL"
        required
        className={styles.inputField} // Apply input style
      />
      {/* Apply analyze button style */}
      <button type="submit" className={styles.analyzeButton}>
        Analyze
      </button>
    </form>
  );
}
