// utils.js

// Shuffle helper — randomize array order
export function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

// Export CSV from localStorage
export function downloadCSV() {
  const data = JSON.parse(localStorage.getItem('canvassData')) || [];

  if (data.length === 0) {
    alert("No data to export.");
    return;
  }

  const headers = Object.keys(data[0]);
  const rows = data.map(entry => headers.map(h => `"${entry[h] || ''}"`).join(','));
  const csvContent = [headers.join(','), ...rows].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", "canvass-data.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ✅ Generate CSV and JSON from in-memory data
export function generateCSVAndJSON(responses, addressData) {
  const headers = Object.keys(responses[0] || {});
  const csv = [
    headers.join(","),
    ...responses.map(r =>
      headers.map(h => JSON.stringify(r[h] || "")).join(",")
    )
  ].join("\n");

  const json = {
    responses,
    addresses: addressData
  };

  return { csv, json };
}