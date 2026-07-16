import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1>현장 원가관리 시스템</h1>
          <p>Phase 9 개발 기반이 구성되었습니다.</p>
        </div>
      </main>
    </div>
  );
}
