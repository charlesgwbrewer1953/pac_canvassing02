// src/components/ResponseSelector.jsx
import React from "react";

const prettify = (v) => String(v).replace(/_/g, " ");

export default function ResponseSelector({
  options,
  value,
  onSetResponse,
  radioLabelStyle,
  radioInputStyle,
}) {
  if (!options?.length) return null;

  const makeStyle = (active, activeBg, activeFg) => ({
    ...radioLabelStyle,
    backgroundColor: active ? activeBg : "#e8e8e8",
    color: active ? activeFg : "#000",
    margin: 0,
    display: "flex",
    width: "100%",
  });

  return (
    <div style={{ marginBottom: 20 }}>
      <h3>Response</h3>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {options.map((opt) => {
          const active = value === opt;
          // Canonical UI rule: selected option inverts to black/white
          const bg = "#000";
          const fg = "#fff";

          return (
            <label key={opt} style={makeStyle(active, bg, fg)}>
              <input
                type="radio"
                name="response"
                value={opt}
                checked={active}
                onChange={() => onSetResponse(opt)}
                style={radioInputStyle}
              />
              {prettify(opt)}
            </label>
          );
        })}
      </div>
    </div>
  );
}
