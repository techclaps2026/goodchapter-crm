export default function CrmLoading() {
  return (
    <div className="app" role="status" aria-live="polite">
      <aside className="sidebar" aria-hidden="true">
        <div className="brand">
          {/* The brand asset is a local SVG, matching the CRM sidebar. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" />
          <small>MERCHANDISE CRM</small>
        </div>
        <div className="loading-sidebar-nav">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <span key={item} className="loading-sidebar-row" />
          ))}
        </div>
      </aside>
      <main className="workspace">
        <div className="topbar">
          <span>The Good Chapter</span>
        </div>
        <div className="content">
          <div className="eyebrow">THE GOOD CHAPTER</div>
          <div className="row loading-heading">
            <span className="navigation-spinner" aria-hidden="true" />
            <h1>Opening the studio…</h1>
          </div>
          <div className="skeleton" aria-hidden="true" />
        </div>
      </main>
    </div>
  );
}
