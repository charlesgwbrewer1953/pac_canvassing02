export default function OptionGrid({
  title,
  options,
  selected,
  onSelect,
  layout = "column", // "column" or "grid"
  activeBg = "#000",
  activeFg = "#fff",
}) {
  if (!options || !options.length) return null;

  const containerStyle =
    layout === "grid"
      ? {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
        }
      : {
          display: "flex",
          flexDirection: "column",
          gap: 12,
        };

  return (
    <div>
      {title && <h3>{title}</h3>}

      <div style={containerStyle}>
        {options.map((opt) => {
          const isSelected = opt === selected;

          return (
            <button
              key={opt}
              type="button"
              onClick={() => onSelect(opt)}
              style={{
                padding: 14,
                borderRadius: 6,
                border: "2px solid black",
                background: isSelected ? activeBg : "white",
                color: isSelected ? activeFg : "black",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {opt.replace(/_/g, " ")}
            </button>
          );
        })}
      </div>
    </div>
  );
}