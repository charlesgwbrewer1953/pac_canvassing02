// src/components/EnumGuard.jsx
import React from "react";

export default function EnumGuard({ loading, error, enums, children }) {
  if (loading) return <div>📡 Loading canvass metadata…</div>;
  if (error) return <div>❌ Cannot load canvass metadata: {error}</div>;
  if (!enums) return <div>❌ Metadata missing (cannot continue)</div>;
  return <>{children}</>;
}