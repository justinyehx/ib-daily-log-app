export default function AppLoading() {
  return (
    <main className="loading-shell">
      <aside className="loading-sidebar">
        <div className="loading-block loading-brand"></div>
        <div className="loading-stack">
          <div className="loading-block loading-pill"></div>
          <div className="loading-block loading-nav"></div>
          <div className="loading-block loading-nav"></div>
          <div className="loading-block loading-nav"></div>
          <div className="loading-block loading-nav"></div>
        </div>
        <div className="loading-block loading-card"></div>
      </aside>

      <section className="loading-content">
        <div className="loading-row">
          <div className="loading-block loading-title"></div>
          <div className="loading-block loading-chip"></div>
        </div>
        <div className="loading-row loading-cards">
          <div className="loading-block loading-card-large"></div>
          <div className="loading-block loading-card-large"></div>
          <div className="loading-block loading-card-large"></div>
        </div>
        <div className="loading-block loading-panel"></div>
        <div className="loading-block loading-panel"></div>
      </section>
    </main>
  );
}
