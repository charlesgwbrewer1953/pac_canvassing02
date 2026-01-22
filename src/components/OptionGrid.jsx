export default function OptionGrid({
  options,
  selected,
  onSelect,
}) {
  return (
    <div style={gridStyle}>
      {options.map(opt => {
        const isSelected = opt === selected;

        return (
          <button
            key={opt}
            onClick={() => onSelect(opt)}
            style={{
              ...baseButton,
              ...(isSelected ? selectedButton : {}),
            }}
          >
            {opt.replace(/_/g, " ")}
          </button>
        );
      })}
    </div>
  );
}

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: "12px",
};

const baseButton = {
  padding: "14px",
  borderRadius: "6px",
  border: "2px solid black",
  background: "white",
  color: "black",
  cursor: "pointer",
  fontWeight: 600,
};

const selectedButton = {
  background: "black",
  color: "white",
};