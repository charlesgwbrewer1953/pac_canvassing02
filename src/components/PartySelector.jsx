import OptionGrid from "./OptionGrid";

const PARTY_COLOURS = {
  lab: "#E4003B",
  con: "#0087DC",
  libdem: "#FAA61A",
  grn: "#6AB023",
  snp: "#FDF38E",
  pc: "#005B54",
  ref: "#12B6CF",
  other: "#999999",
};

export default function PartySelector({ options, value, onChange }) {
  return (
    <OptionGrid
      title="Political Party"
      options={options}
      selected={value}
      onSelect={onChange}
      layout="grid"
      activeBg={PARTY_COLOURS[value] || "#000"}
      activeFg="#fff"
    />
  );
}