// src/components/Navbar.tsx
import Link from 'next/link';
// *** FIX: Correct the import path for the CSS module ***
import styles from './Navbar.module.css';
import { FaMusic } from 'react-icons/fa'; // Assuming you still want the icon

const Navbar = () => {
  // Add logic here later to detect the current path for active link styling if needed
  // const pathname = usePathname(); // Requires 'use client' in Navbar if used

  return (
    <nav className={styles.navbar}>
      <div className={styles.navContainer}>
        <Link href="/" className={styles.brand}>
          <FaMusic aria-hidden="true" />
          <span>SongSaver</span> {/* Or your app name */}
        </Link>
        <div className={styles.navLinks}>
          {/* Add aria-current="page" attribute based on path if implementing active styles */}
          <Link href="/" className={styles.navLink} >
            Home
          </Link>
          <Link href="/favorites" className={styles.navLink}>
            Favorites
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
