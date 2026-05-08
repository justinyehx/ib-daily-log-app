/**
 * Shell-shaped skeleton shown while any page's server component is fetching.
 * Matches the AppShell layout so there's no layout shift when content arrives.
 */
export function PageLoadingSkeleton() {
  return (
    <div className="shell">
      {/* ── Mobile top bar skeleton (visible only on mobile) ── */}
      <header className="mobile-topbar">
        <div style={sk({ width: 140, height: 16, radius: 6 })} />
        <div style={sk({ width: 44, height: 44, radius: 10 })} />
      </header>

      {/* ── Sidebar skeleton (visible on desktop, off-screen drawer on mobile) ── */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <div style={sk({ width: 120, height: 10, mb: 6 })} />
          <div style={sk({ width: "80%", height: 20, mb: 4 })} />
          <div style={sk({ width: "60%", height: 14 })} />
        </div>

        <nav className="nav" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[90, 80, 90, 70, 85].map((w, i) => (
            <div key={i} style={sk({ width: `${w}%`, height: 36, radius: 10 })} />
          ))}
        </nav>

        <div style={{ marginTop: "auto" }}>
          <div style={sk({ width: "100%", height: 110, radius: 14 })} />
        </div>
      </aside>

      {/* ── Content skeleton ── */}
      <main className="content">
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Header */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={sk({ width: 80, height: 12 })} />
            <div style={sk({ width: 220, height: 28 })} />
          </div>

          {/* Hero stat bar */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={sk({ flex: 1, height: 76, radius: 14, width: "20%" })} />
            ))}
          </div>

          {/* Main panels */}
          <div style={sk({ width: "100%", height: 220, radius: 20 })} />
          <div style={sk({ width: "100%", height: 300, radius: 20 })} />
        </div>
      </main>
    </div>
  );
}

/** Returns an inline style for a shimmer skeleton block. */
function sk({
  width,
  height,
  mb = 0,
  radius = 8,
  flex,
}: {
  width?: number | string;
  height: number;
  mb?: number;
  radius?: number;
  flex?: number;
}): React.CSSProperties {
  return {
    width: typeof width === "number" ? width : width,
    height,
    marginBottom: mb || undefined,
    borderRadius: radius,
    flex,
    background:
      "linear-gradient(90deg, rgba(171,93,59,0.08) 25%, rgba(171,93,59,0.15) 50%, rgba(171,93,59,0.08) 75%)",
    backgroundSize: "400% 100%",
    animation: "shimmer 1.6s ease-in-out infinite",
    flexShrink: 0,
  };
}
