"use client";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <html>
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "32px",
            background: "#f8f1e9"
          }}
        >
          <section
            style={{
              width: "min(560px, 100%)",
              display: "grid",
              gap: "16px",
              padding: "28px",
              borderRadius: "24px",
              border: "1px solid rgba(118, 86, 63, 0.2)",
              background: "rgba(255,253,250,0.92)",
              boxShadow: "0 18px 40px rgba(76,50,33,0.08)"
            }}
          >
            <p
              style={{
                margin: 0,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                fontSize: "0.72rem",
                fontWeight: 800,
                color: "#8a6c57"
              }}
            >
              App Error
            </p>
            <h1
              style={{
                margin: 0,
                fontSize: "2.4rem",
                lineHeight: 0.95,
                color: "#3a291f"
              }}
            >
              Something went wrong on this page.
            </h1>
            <p style={{ margin: 0, color: "#6a5446", lineHeight: 1.6 }}>
              The app hit a temporary runtime issue. Try the in-app reset first before restarting
              anything.
            </p>
            {error?.message ? (
              <p
                style={{
                  margin: 0,
                  padding: "12px 14px",
                  borderRadius: "14px",
                  background: "rgba(184,77,61,0.08)",
                  color: "#8a3a2f",
                  fontFamily: "Arial, Helvetica, sans-serif",
                  fontSize: "0.95rem"
                }}
              >
                {error.message}
              </p>
            ) : null}
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <button
                className="button"
                onClick={() => reset()}
                style={{ minWidth: "148px" }}
                type="button"
              >
                Try again
              </button>
              <button
                className="button secondary"
                onClick={() => window.location.reload()}
                style={{ minWidth: "148px" }}
                type="button"
              >
                Reload page
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
