import styles from './RouteLoading.module.css';

type RouteLoadingProps = {
  label?: string;
};

export function RouteLoading({ label = 'Dang tai noi dung...' }: RouteLoadingProps) {
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <div className={styles.card} aria-hidden="true">
        <span className={styles.kicker} />
        <span className={styles.title} />
        <span className={styles.line} />
        <span className={styles.line} />
        <span className={styles.shortLine} />
      </div>
      <p className={styles.label}>{label}</p>
    </div>
  );
}
