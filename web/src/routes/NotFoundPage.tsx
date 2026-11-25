import { Link } from "react-router-dom";
import styles from "./PlayerPage.module.css";

// Any address the router doesn't know, styled like the player page's missing-player message.
export function NotFoundPage() {
  return (
    <>
      <Link className={styles.back} to="/">Back to the board</Link>
      <div className={styles.error} role="alert">
        <p>There's no page at this address. The link may be mistyped or out of date.</p>
      </div>
    </>
  );
}
