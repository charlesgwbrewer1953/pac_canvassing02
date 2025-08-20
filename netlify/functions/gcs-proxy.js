// netlify/functions/gcs-proxy.js
const { Storage } = require("@google-cloud/storage");

const storage = new Storage({
  credentials: JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON),
  projectId: process.env.GCP_PROJECT_ID || "political_maps",
});

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
    return { statusCode: 500, body: `Server error: ${e.message}` };
  }
};