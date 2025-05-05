/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/page.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import styles from './page.module.css';
import Navbar from '@/components/Navbar';
import * as THREE from 'three';
import { FaChevronRight } from 'react-icons/fa';

export default function Home() {
  const [vantaEffect, setVantaEffect] = useState<any>(null);
  const vantaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let effectInstance: any = null;

    import('vanta/dist/vanta.net.min')
      .then((vantaModule) => {
        const NET = vantaModule.default;
        if (vantaRef.current && !vantaEffect) {
          try {
            effectInstance = NET({
              el: vantaRef.current,
              THREE: THREE,
              mouseControls: true,
              touchControls: true,
              gyroControls: false,
              minHeight: 200.00,
              minWidth: 200.00,
              scale: 1.00,
              scaleMobile: 1.00,
              color: 0x38bdf8,
              backgroundColor: 0x121417,
              points: 12.00,
              maxDistance: 22.00,
              spacing: 18.00
            });
            setVantaEffect(effectInstance);
          } catch (error) {
            console.error("Vanta NET initialization failed:", error);
          }
        }
      })
      .catch((error) => console.error("Failed to load Vanta NET:", error));

    return () => {
      if (vantaEffect?.destroy) {
        vantaEffect.destroy();
        setVantaEffect(null);
      }
    };
  }, [vantaEffect]); // Added vantaEffect to dependencies

  return (
    <div className={styles.pageWrapper}>
      <div ref={vantaRef} className={styles.vantaBackground}></div>
      <Navbar />
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
