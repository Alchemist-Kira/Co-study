import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.heroContainer}>
      <div className={styles.heroContent}>
        <h1 className={styles.title}>
          Sync YouTube.<br />
          Talk with Friends.
        </h1>
        <p className={styles.subtitle}>
          Co-Watch allows you to watch coding tutorials and videos in perfect sync with your friends, featuring high-quality push-to-talk voice chat, entirely for free.
        </p>
        <div className={styles.buttonGroup}>
          <Link href="/login" className={styles.primaryButton}>
            Get Started
          </Link>
          <Link href="/demo" className={styles.secondaryButton}>
            Try Demo
          </Link>
        </div>
      </div>
    </main>
  );
}
