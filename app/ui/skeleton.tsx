export function Skeleton() {
  return () => (
    <div
      style={{
        padding: "1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <div
          style={{
            width: "4rem",
            height: "4rem",
            borderRadius: "50%",
            background: "#e0e0e0",
          }}
        />
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          <div
            style={{
              height: "1rem",
              width: "60%",
              background: "#e0e0e0",
              borderRadius: "4px",
            }}
          />
          <div
            style={{
              height: "0.75rem",
              width: "40%",
              background: "#e0e0e0",
              borderRadius: "4px",
            }}
          />
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          marginTop: "0.5rem",
        }}
      >
        <div
          style={{
            height: "0.75rem",
            width: "100%",
            background: "#e0e0e0",
            borderRadius: "4px",
          }}
        />
        <div
          style={{
            height: "0.75rem",
            width: "90%",
            background: "#e0e0e0",
            borderRadius: "4px",
          }}
        />
        <div
          style={{
            height: "0.75rem",
            width: "95%",
            background: "#e0e0e0",
            borderRadius: "4px",
          }}
        />
      </div>
      <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
        <div
          style={{
            height: "2rem",
            width: "5rem",
            background: "#e0e0e0",
            borderRadius: "4px",
          }}
        />
        <div
          style={{
            height: "2rem",
            width: "5rem",
            background: "#e0e0e0",
            borderRadius: "4px",
          }}
        />
      </div>
    </div>
  );
}
