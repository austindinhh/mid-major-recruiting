import { Link, useParams, useSearchParams } from "react-router-dom";

// Placeholder until the full player page is built (plan phase 4).
export function PlayerPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const season = params.get("season");
  return (
    <>
      <h1>Player page</h1>
      <p>The full player page is not built yet.</p>
      <Link to={`/?${season ? `season=${season}&` : ""}player=${id}`}>Back to the board</Link>
    </>
  );
}
