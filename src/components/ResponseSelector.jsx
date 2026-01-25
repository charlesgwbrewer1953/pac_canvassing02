import OptionGrid from "./OptionGrid";

export default function ResponseSelector({ options, value, onChange }) {
  return (
    <OptionGrid
      title="Response"
      options={options}
      selected={value}
      onSelect={onChange}
    />
  );
}