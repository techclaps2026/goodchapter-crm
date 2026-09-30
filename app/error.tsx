"use client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="error-screen">
      <h1>Something went wrong.</h1>
      <p>We couldn’t load this page. Your saved records are safe.</p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
