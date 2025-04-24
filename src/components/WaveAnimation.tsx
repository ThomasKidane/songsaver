// src/components/WaveAnimation.tsx
import React from 'react';
import styles from '../app/page.module.css'; // Adjust path if needed

const WaveAnimation: React.FC = () => {
  return (
    <div className={styles.waveContainer}>
      <div className={styles.waveBar}></div>
      <div className={styles.waveBar}></div>
      <div className={styles.waveBar}></div>
      <div className={styles.waveBar}></div>
      <div className={styles.waveBar}></div>
    </div>
  );
};

export default WaveAnimation;
