import OptionGrid from "./OptionGrid";

export default function ResponseSelector({ options, value, onChange }) {
  if (!options?.length) return null;

  return (
    <>
      <h3>Response</h3>
      <OptionGrid
        options={options}
        selected={value}
        onSelect={onChange}
      />
    </>
  );
}