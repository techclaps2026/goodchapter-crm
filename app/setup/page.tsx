export default function Setup() {
  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="eyebrow">THE GOOD CHAPTER · SETUP</div>
        <h1>A fresh chapter.</h1>
        <p>
          Connect this app to your new Supabase project to open the studio
          CRM.
        </p>
        <ol>
          <li>Apply the included database migration.</li>
          <li>
            Set the Supabase URL and public key from <code>.env.example</code>.
          </li>
          <li>
            Create your owner account and follow the owner setup instructions in
            the README.
          </li>
        </ol>
        <p className="muted">
          For a fictional local preview, run the development server with
          CRM_DEMO_MODE=true. Preview mode is disabled in production.
        </p>
      </div>
    </main>
  );
}
