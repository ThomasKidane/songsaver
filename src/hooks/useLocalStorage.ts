// src/hooks/useLocalStorage.ts
import { useState, useEffect } from 'react';

// Helper function to safely get initial value from localStorage
function getStorageValue<T>(key: string, defaultValue: T): T {
  // Check if running on the client side
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved !== null) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error(`Error reading localStorage key “${key}”:`, error);
      return defaultValue;
    }
  }
  // Return default value during SSR or if window is undefined
  return defaultValue;
}

// The custom hook
export function useLocalStorage<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    // Initialize state with value from localStorage or default
    return getStorageValue(key, defaultValue);
  });

  useEffect(() => {
    // This effect runs only on the client after hydration
    try {
      // Update localStorage when the state value changes
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error writing localStorage key “${key}”:`, error);
    }
  }, [key, value]); // Re-run effect if key or value changes

  return [value, setValue];
}
