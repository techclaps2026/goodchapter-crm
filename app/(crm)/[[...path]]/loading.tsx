export default function Loading() {
  return (
    <main className="route-loading" role="status" aria-live="polite">
      <span className="navigation-spinner" aria-hidden="true" />
      <div>
        <div className="eyebrow">THE GOOD CHAPTER</div>
        <h1>Opening view…</h1>
        <p>Getting your CRM ready.</p>
      </div>
    </main>
  );
}
