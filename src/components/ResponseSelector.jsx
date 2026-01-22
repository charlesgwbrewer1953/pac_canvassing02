// src/components/ResponseSelector.jsx
import React from "react";

export default function ResponseSelector({
  value,
  onSetResponse,
  radioLabelStyle,
  radioInputStyle,
}) {
  const makeStyle = (active, activeBg) => ({
    ...radioLabelStyle,
    backgroundColor: active ? activeBg : "#e8e8e8",
    color: active ? "#fff" : "#000",
    margin: 0,
    display: "flex",
    width: "100%",
  });

  return (
    <div style={{ marginBottom: 20 }}>
      <h3>Response</h3>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={makeStyle(value === "response", "#007bff")}>
          <input
            type="radio"
            name="response"
            value="response"
            checked={value === "response"}
            onChange={() => onSetResponse("response")}
            style={radioInputStyle}
          />
          Response
        </label>

        <label style={makeStyle(value === "no_response", "#6c757d")}>
          <input
            type="radio"
            name="response"
            value="no_response"
            checked={value === "no_response"}
            onChange={() => onSetResponse("no_response")}
            style={radioInputStyle}
          />
          No Response
        </label>

        <label style={makeStyle(value === "not_home", "#6c757d")}>
          <input
            type="radio"
            name="response"
            value="not_home"
            checked={value === "not_home"}
            onChange={() => onSetResponse("not_home")}
            style={radioInputStyle}
          />
          Not Home
        </label>
      </div>
    </div>
  );
}