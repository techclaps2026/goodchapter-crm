import Link from "next/link";
export default function NotFound() {
  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="eyebrow">THE GOOD CHAPTER</div>
        <h1>This page isn’t available.</h1>
        <p>
          The link may have been revoked, or the record may no longer be
          available.
        </p>
        <Link className="button" href="/">
          Back to workspace
        </Link>
      </div>
    </main>
  );
}
