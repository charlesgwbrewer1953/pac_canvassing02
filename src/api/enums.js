// src/api/enums.js
export async function fetchEnums(API_BASE) {
  const resp = await fetch(`${API_BASE}/canvass/metadata`);
  if (!resp.ok) throw new Error(`metadata_failed_${resp.status}`);
  return resp.json();
}