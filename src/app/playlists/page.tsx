// src/app/playlists/page.tsx
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import styles from '../page.module.css'; // Reuse styles
import playlistStyles from './playlists.module.css'; // Specific styles

export interface Playlist {
  id: string;
  name: string;
  songVideoIds: string[];
  createdDate: string;
}

// Helper for generating simple IDs (replace with nanoid or crypto.randomUUID in production)
const generateId = () => '_' + Math.random().toString(36).substr(2, 9);

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useLocalStorage<Playlist[]>('playlists', []);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  const createPlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    const newPlaylist: Playlist = {
      id: generateId(),
      name: newPlaylistName.trim(),
      songVideoIds: [],
      createdDate: new Date().toISOString(),
    };
    setPlaylists(prev => [...prev, newPlaylist]);
    setNewPlaylistName('');
  };

  const deletePlaylist = (id: string) => {
    setPlaylists(prev => prev.filter(pl => pl.id !== id));
  };

  return (
    <div className={playlistStyles.container}>
      <Link href="/" className={styles.navButton}>
        &larr; Back Home
      </Link>
      <h1 className={playlistStyles.title}>My Playlists</h1>

       {/* Form to create a playlist */}
      <form onSubmit={createPlaylist} className={playlistStyles.addForm}>
        <input
           type="text"
           placeholder="New Playlist Name"
           value={newPlaylistName}
           onChange={(e) => setNewPlaylistName(e.target.value)}
           required
           className={styles.inputField}
        />
        <button type="submit" className={styles.analyzeButton}>
          Create Playlist
        </button>
      </form>

      {playlists.length === 0 ? (
        <p>You haven&apos;t created any playlists yet.</p>
      ) : (
        <ul className={playlistStyles.playlistList}>
          {playlists.map(pl => (
            <li key={pl.id} className={playlistStyles.playlistItem}>
              {/* Link to individual playlist page (implement later) */}
              <span className={playlistStyles.playlistName}>{pl.name}</span>
              <span className={playlistStyles.songCount}>({pl.songVideoIds.length} songs)</span>
              <button
                onClick={() => deletePlaylist(pl.id)}
                className={playlistStyles.deleteButton}
                title="Delete Playlist"
              >
                🗑️
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
