// src/app/page.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import styles from './page.module.css'; // Homepage specific styles

// Import Navbar
import Navbar from '@/components/Navbar';

// Vanta.js Imports - Use dynamic import for client-side only library
import type VantaBase from 'vanta/dist/vanta.base.js'; // Type for state
import * as THREE from 'three'; // Import THREE

// React Icons
import { FaChevronRight } from 'react-icons/fa';

// Define Vanta type more specifically if possible, or use 'any' for simplicity
type VantaEffect = VantaBase | null | { destroy: () => void };

export default function Home() {
  const [vantaEffect, setVantaEffect] = useState<VantaEffect>(null);
  const vantaRef = useRef<HTMLDivElement>(null); // Ref for the background element

  // Initialize Vanta.js NET effect on mount
  useEffect(() => {
    let effectInstance: VantaEffect = null; // Variable for cleanup scope

    // Dynamically import Vanta NET only on the client-side
    import('vanta/dist/vanta.net.min.js') // <<< CHANGE: Importing NET effect
      .then((vantaModule) => {
        const NET = vantaModule.default; // Access the default export

        // Initialize only IF the ref exists AND effect hasn't been created
        if (vantaRef.current && !vantaEffect) {
          console.log("Attempting to initialize Vanta NET...");
          try {
            effectInstance = NET({ // <<< CHANGE: Calling NET effect
              el: vantaRef.current,
              THREE: THREE, // Pass the THREE object
              mouseControls: true,
              touchControls: true,
              gyroControls: false,
              minHeight: 200.00,
              minWidth: 200.00,
              scale: 1.00,
              scaleMobile: 1.00,
              // --- NET Effect Options ---
              color: 0x38bdf8,      // Use accent color (Sky Blue hex) - var(--accent-primary)
              backgroundColor: 0x121417, // Match CSS background - var(--bg-primary)
              points: 12.00,         // Number of points
              maxDistance: 22.00,    // Max distance between points for lines
              spacing: 18.00         // Spacing between points
              // showDots: false      // Optionally hide the points
            });
            setVantaEffect(effectInstance); // Store the live instance in state
            console.log("Vanta NET Initialized Successfully.");
          } catch (error) {
            console.error("Vanta NET initialization failed:", error);
          }
        } else if (vantaEffect) {
          console.log("Vanta effect already initialized.");
        } else if (!vantaRef.current) {
          console.error("Vanta container ref not found during initialization attempt.");
        }
      })
      .catch((error) => console.error("Failed to dynamically load Vanta NET:", error));

    // Cleanup function: Called when component unmounts
    return () => {
      if (vantaEffect && typeof vantaEffect.destroy === 'function') {
        console.log("Destroying Vanta NET...");
        vantaEffect.destroy();
        setVantaEffect(null); // Clear state
        console.log("Vanta NET destroyed.");
      } else if (effectInstance && typeof effectInstance.destroy === 'function') {
         // Fallback cleanup if state update didn't happen before unmount
         console.log("Destroying Vanta NET (from effect closure)...");
         effectInstance.destroy();
         console.log("Vanta NET destroyed (from effect closure).");
      } else {
        console.log("Cleanup: No active Vanta effect found to destroy.");
      }
    };
  // Run effect only once on mount, relying on !vantaEffect check internally
  }, []); // Empty dependency array is generally correct for this pattern

  return (
    <div className={styles.pageWrapper}>
      {/* Vanta Background Container - Needs ref */}
      <div ref={vantaRef} className={styles.vantaBackground}></div>

      {/* Navbar */}
      <Navbar />

      {/* Main Content (Keep the styled text/button) */}
      <main className={styles.mainContent}>
        <div className={styles.heroSection}>
          <h1 className={styles.mainTitle}>
            Find the <span className={styles.highlight}>Perfect</span> Loop
          </h1>
          <p className={styles.description}>
            Instantly analyze YouTube videos for their most replayed moments. Save suggestions, mark custom sections, and master your favorite parts.
          </p>
          <Link href="/favorites" className={styles.ctaButton}>
            <span>Explore Favorites</span>
            <FaChevronRight aria-hidden="true"/>
          </Link>
        </div>
      </main>
    </div>
  );
}
