import React from "react";

export default function AddressSelector({ addresses, onSelect }) {
  if (!addresses || !addresses.length) {
    return <div>No addresses available</div>;
  }

  return (
    <div>
      <h3>Select Address</h3>

      <select
        defaultValue=""
        onChange={(e) => {
          const idx = e.target.value;
          if (idx !== "") onSelect(addresses[idx]);
        }}
      >
        <option value="">-- Choose an address --</option>
        {addresses.map((addr, i) => (
          <option key={i} value={i}>
            {typeof addr === "string"
              ? addr
              : addr.address || JSON.stringify(addr)}
          </option>
        ))}
      </select>
    </div>
  );
}