const PARTY_COLOURS = {
  lab: "#E4003B",
  con: "#0087DC",
  libdem: "#FAA61A",
  grn: "#6AB023",
  snp: "#FDF38E",
  pc: "#005B54",
  ref: "#12B6CF",
  dup: "#D46A4C",
  sinn_fein: "#326760",
  sdlp: "#2AA82C",
  alliance: "#F6CB2F",
  uup: "#48A5EE",
};

export default function PartySelector({ options, value, onChange }) {
  return (
    <div style={gridStyle}>
      {options.map(party => {
        const isSelected = party === value;
        const colour = PARTY_COLOURS[party] || "#000";

        return (
          <button
            key={party}
            onClick={() => onChange(party)}
            style={{
              ...baseButton,
              ...(isSelected
                ? {
                    background: colour,
                    color: readableText(colour),
                    borderColor: colour,
                  }
                : {}),
            }}
          >
            {party.toUpperCase()}
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
  cursor: "pointer",
  fontWeight: 700,
};

function readableText(bg) {
  return bg === "#FDF38E" || bg === "#FAA61A" || bg === "#F6CB2F"
    ? "black"
    : "white";
}