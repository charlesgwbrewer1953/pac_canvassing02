// netlify/functions/gcs-proxy.js
const { Storage } = require("@google-cloud/storage");

let storage;
function getStorage() {
  if (storage) return storage;

  const rawCreds = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!rawCreds) {
    throw new Error("Missing GCP_SERVICE_ACCOUNT_JSON");
  }

  let credentials;
  try {
    credentials = JSON.parse(rawCreds);
  } catch (e) {
    throw new Error("Invalid JSON in GCP_SERVICE_ACCOUNT_JSON");
  }

  storage = new Storage({
    credentials,
    projectId: process.env.GCP_PROJECT_ID || credentials.project_id || "political_maps",
  });
  return storage;
}

const BUCKET = process.env.GCS_BUCKET || "pac20_oa_canvass";

function isSafeObject(name) {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    !name.includes("..") &&
    !name.startsWith("/") &&
    name.toLowerCase().endsWith(".csv")
  );
}

exports.handler = async (event) => {
  try {
    const storage = getStorage();

    const qp = event.queryStringParameters || {};
    const object = qp.object;

    if (!isSafeObject(object)) {
      return { statusCode: 400, body: "Bad object name" };
    }

    const file = storage.bucket(BUCKET).file(object);
    const [exists] = await file.exists();
    if (!exists) {
      return { statusCode: 404, body: "Not found" };
    }

    // Files are tiny (~15KB) — download and return body.
    const [buf] = await file.download();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `inline; filename="${encodeURIComponent(object)}"`,
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
      body: buf.toString("utf8"),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: `Server error: ${e.message}`,
    };
  }
};
