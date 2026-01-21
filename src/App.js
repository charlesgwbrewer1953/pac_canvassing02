// src/App.js
import React, { useEffect, useMemo, useState } from "react";
import "./App.css";

import { shuffle } from "./utils";
import { fetchAddressDataWithFallback, parseAddressCsv } from "./gcsUtils";
import sendReport from "./emailService";
import StepForm from "./components/StepForm";

// -------------------- Styles --------------------
const inputStyle = {
  width: "100%",
  maxWidth: "400px",
  fontSize: "18px",
  padding: "10px",
  marginBottom: "10px",
  boxSizing: "border-box",
};

const buttonStyle = {
  padding: "10px 20px",
  fontSize: "16px",
  backgroundColor: "#007bff",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  marginTop: "10px",
};

const titleStyle = {
  fontFamily: "'Roboto', sans-serif",
  fontWeight: 300,
  fontSize: "36px",
  marginBottom: "20px",
  color: "#222",
  textAlign: "center",
  top: 0,
  backgroundColor: "#f0f0f0",
  padding: "10px",
  zIndex: 1000,
  borderBottom: "1px solid #ccc",
};

const radioLabelStyle = {
  display: "inline-flex",
  alignItems: "center",
  fontSize: "20px",
  padding: "12px 18px",
  backgroundColor: "#e8e8e8",
  borderRadius: "8px",
  border: "2px solid #ccc",
  cursor: "pointer",
};

const radioInputStyle = {
  width: "36px",
  height: "36px",
  marginRight: "14px",
  cursor: "pointer",
};

// -------------------- Config --------------------
// Express/Railway API base
const API_BASE = process.env.REACT_APP_API_BASE || "https://api.demographikon.org";

// GCS CSV prefix
const GCS_PREFIX =
  process.env.REACT_APP_GCS_PREFIX || "https://storage.googleapis.com/pac20_oa_canvass";

// Local fallback CSV bundled with the site
const FALLBACK_URL = "/sample_address_data.csv";

// Used in the success alert
const ADMIN_EMAIL = "demographikon.dev.01@gmail.com";

// Issues (shuffled per pass)
const ISSUE_OPTIONS = ["Immigration", "Economy", "NHS", "Housing", "Net Zero"];

// -------------------- Helpers --------------------
const getQueryParam = (name) => {
  const search = window.location.search || "";
  const fromSearch = new URLSearchParams(search).get(name);
  if (fromSearch) return fromSearch;

  // Support hash routing URLs like: https://site/#/start?token=...
  const hash = window.location.hash || "";
  const qIndex = hash.indexOf("?");
  if (qIndex >= 0) {
    const hashQuery = hash.substring(qIndex + 1);
    return new URLSearchParams(hashQuery).get(name);
  }
  return null;
};

const sanitizeFilename = (s) => (s || "").toString().replace(/[^\w-]+/g, "-");

const toCell = (v) => (Array.isArray(v) ? v.join("; ") : v ?? "");
const buildHeaders = (records) => {
  const keys = new Set();
  records.forEach((r) => Object.keys(r || {}).forEach((k) => keys.add(k)));

  const preferred = [
    "address",
    "response",
    "residents",
    "party",
    "support",
    "likelihood",
    "issue",
    "notes",
    "canvasser",
    "timestamp",
    "OA",
    "postcode",
    "ward",
  ];

  const rest = [...keys].filter((k) => !preferred.includes(k)).sort();
  return [...preferred.filter((k) => keys.has(k)), ...rest];
};

const toCSV = (records) => {
  if (!records || records.length === 0) return "";
  const headers = buildHeaders(records);

  const esc = (s) => {
    const str = String(s ?? "");
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const rows = [
    headers.join(","),
    ...records.map((r) => headers.map((h) => esc(toCell(r[h]))).join(",")),
  ];

  return rows.join("\n");
};

const genUUID = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback (should rarely happen in modern browsers)
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

function normalizeEnum(value) {
  if (value === null || value === undefined) return null;
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

// -------------------- API Calls --------------------
async function sendCanvassRecord({ sessionToken, payload }) {
  try {
    const resp = await fetch(`${API_BASE}/canvass/canvass-records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("❌ Canvass DB write failed:", resp.status, text);
      return { ok: false, status: resp.status, text };
    }

    return { ok: true };
  } catch (e) {
    console.error("❌ Canvass DB write error:", e);
    return { ok: false, status: 0, text: String(e?.message || e) };
  }
}

// -------------------- App --------------------
function App() {
  // Bootstrap state
  const [bootstrapping, setBootstrapping] = useState(true);
  const [bootstrapError, setBootstrapError] = useState(null);

  // From /canvass-session
  const [sessionToken, setSessionToken] = useState(null);
  const [user, setUser] = useState(null); // { id, role, tenant_id, ... }
  const [oa, setOA] = useState(null);

  // Canvass UI state
  const [canvasserName, setCanvasserName] = useState("");

  const [addressData, setAddressData] = useState([]);
  const [visited, setVisited] = useState([]);
  const [formData, setFormData] = useState({});
  const [responses, setResponses] = useState([]);
  const [currentAddress, setCurrentAddress] = useState("");

  const [step, setStep] = useState(0);

  // Admin UI
  const [adminMode, setAdminMode] = useState(false);

  // Data loading
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(null);

  // Source reference (loaded CSV path)
  const [sourceRef, setSourceRef] = useState(null);
  const [constituency, setConstituency] = useState("OA");

  // Issues order per pass
  const [issuesOrder, setIssuesOrder] = useState(ISSUE_OPTIONS);

  // Send button UI
  const [sendBtnLabel, setSendBtnLabel] = useState("Send Report to Demographikon");
  const [sending, setSending] = useState(false);

  const isAdmin = useMemo(() => {
    const r = user?.role;
    return r === "admin" || r === "sysadmin";
  }, [user]);

  // -------------------- Bootstrap session --------------------
  useEffect(() => {
    async function bootstrap() {
      try {
        const tokenFromUrl = getQueryParam("token");
        const allowDevBypass = process.env.REACT_APP_ALLOW_DEV_BYPASS === "true";

        if (!tokenFromUrl && !allowDevBypass) {
          throw new Error("Missing canvass token in URL (token=...)");
        }

        if (!tokenFromUrl && allowDevBypass) {
          console.warn("⚠️ DEV MODE: bypassing canvass token");
          setSessionToken("__DEV_SESSION__");
          setUser({ id: "dev-user", role: "admin", tenant_id: "dev-tenant" });
          setOA("E00181357");
          setCanvasserName("Dev Tester");
          return;
        }

        const resp = await fetch(`${API_BASE}/canvass/canvass-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tokenFromUrl }),
        });

        if (!resp.ok) {
          throw new Error(`Session bootstrap failed (${resp.status})`);
        }

        const data = await resp.json();

        setSessionToken(data.session_token);
        setUser(data.user);
        setOA(data.scope?.oa || null);

        setCanvasserName(data.user?.name || data.user?.id || "canvasser");
      } catch (err) {
        console.error(err);
        setBootstrapError(err?.message || "Bootstrap failed");
      } finally {
        setBootstrapping(false);
      }
    }

    bootstrap();
  }, []);

  // -------------------- Restore saved local responses --------------------
  useEffect(() => {
    const savedData = localStorage.getItem("canvassData");
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setResponses(parsed);
        setVisited(parsed.map((r) => r.address));
      } catch (e) {
        console.error("Error loading saved data:", e);
      }
    }
  }, []);

  // -------------------- Load address CSV once OA is known --------------------
  useEffect(() => {
    if (bootstrapping) return;
    if (bootstrapError) return;

    if (!oa) {
      setDataLoading(false);
      setDataError("No OA scope returned from /canvass-session");
      return;
    }

    const primaryUrl = `${GCS_PREFIX}/OA_${encodeURIComponent(oa)}.csv`;
    setSourceRef(primaryUrl);
    setConstituency(`OA ${oa}`);

    setDataLoading(true);
    setDataError(null);

    // Optional override for testing via proxy
    const object = getQueryParam("object");
    if (object) {
      const decoded = decodeURIComponent(object);
      setSourceRef(decoded);

      fetch(`/.netlify/functions/gcs-proxy?object=${encodeURIComponent(decoded)}`)
        .then((resp) => {
          if (!resp.ok) throw new Error(`Proxy failed: ${resp.statusText}`);
          return resp.text();
        })
        .then((csvText) => {
          const data = parseAddressCsv(csvText);
          setAddressData(data);
        })
        .catch((err) => {
          console.error("Proxy fetch error:", err);
          setDataError(err.message);
        })
        .finally(() => {
          setDataLoading(false);
        });

      return;
    }

    fetchAddressDataWithFallback(primaryUrl, FALLBACK_URL)
      .then((data) => setAddressData(data))
      .catch((err) => setDataError(err.message))
      .finally(() => setDataLoading(false));
  }, [bootstrapping, bootstrapError, oa]);


  // Canonical enum metadata from backend (DB is source of truth)
const [enums, setEnums] = useState(null);
const [metaLoading, setMetaLoading] = useState(true);
const [metaError, setMetaError] = useState(null);

useEffect(() => {
  let cancelled = false;

  async function loadEnums() {
    try {
      const resp = await fetch(`${API_BASE}/canvass/metadata`);
      if (!resp.ok) {
        throw new Error(`metadata_failed_${resp.status}`);
      }
      const data = await resp.json();
      if (!cancelled) {
        setEnums(data);
      }
    } catch (e) {
      if (!cancelled) setMetaError(e.message);
    } finally {
      if (!cancelled) setMetaLoading(false);
    }
  }

  loadEnums();
  return () => { cancelled = true; };
}, []);

  // -------------------- Steps --------------------
  const startNewPass = () => {
    setIssuesOrder(shuffle([...ISSUE_OPTIONS]));
    setStep(0);
  };

const getFormSteps = () => {
  const selected = addressData.find(a => a.address === formData.address);
  const residents = selected?.residents || [];

  if (!enums) return [];

  return [
    {
      name: "residents",
      label: "Who was spoken to?",
      type: "checkbox",
      options: residents,
    },
    {
      name: "party",
      label: "Party Preference",
      type: "radio",
      options: enums.party.map(v => ({
        value: v,                 // CANONICAL
        label: v.toUpperCase(),   // DISPLAY ONLY
      })),
    },
    {
      name: "support",
      label: "Support level",
      type: "radio",
      options: enums.support.map(v => ({
        value: v,
        label: v.replace("_", " "),
      })),
    },
    {
      name: "likelihood",
      label: "Likelihood of Voting",
      type: "radio",
      options: enums.likelihood.map(v => ({
        value: v,
        label: v.replace("_", " "),
      })),
    },
    {
      name: "issue",
      label: "Most Important Issue",
      type: "radio",
      options: enums.issue.map(v => ({
        value: v,
        label: v.replace("_", " "),
      })),
    },
    {
      name: "notes",
      label: "Notes",
      type: "textarea",
    },
  ];
};

  // -------------------- Save response + (only when complete) write to DB --------------------
  const saveResponse = async (data, auto = false) => {
    const steps = getFormSteps();
    const isFinalStep = auto || step === steps.length - 1;

    // Always save locally
    const newEntry = {
      ...data,
      timestamp: new Date().toISOString(),
      canvasser: canvasserName,
      OA: oa,
    };

    const filteredResponses = responses.filter((r) => r.address !== data.address);
    const newResponses = [...filteredResponses, newEntry];
    const newVisited = [...new Set([...visited, data.address])];

    setResponses(newResponses);
    setVisited(newVisited);
    localStorage.setItem("canvassData", JSON.stringify(newResponses));

    // Write to DB only once record is complete
    if (isFinalStep) {
      if (sessionToken) {
const dbPayload = {
  client_record_id: genUUID(),
  address: data.address,

  response: data.response,
  party: data.party ?? null,
  support: data.support ?? null,
  likelihood: data.likelihood ?? null,
  issue: data.issue ?? null,

  notes: data.notes || null,
  canvassed_at: new Date().toISOString(),
};

        await sendCanvassRecord({ sessionToken, payload: dbPayload });
      } else {
        console.warn("No session token; skipping DB write");
      }
    }

    // Advance/reset UI
    if (isFinalStep) {
      setStep(0);
      setFormData({});
      setCurrentAddress("");
    } else {
      setStep(step + 1);
    }
  };

  // Navigation helpers
  const goToAddressSelection = () => {
    setCurrentAddress("");
    setFormData({});
    setStep(0);
  };

  const goToPreviousStep = () => {
    if (formData.response && step > 0) {
      setStep(step - 1);
    } else if (formData.response && step === 0) {
      setFormData({ address: currentAddress, response: formData.response });
    } else {
      goToAddressSelection();
    }
  };

  // -------------------- Email report sender --------------------
  const sendResults = async () => {
    const mergedByAddress = responses.reduce((acc, curr) => {
      const existing = acc[curr.address];
      if (!existing) {
        acc[curr.address] = { ...curr };
      } else {
        if (new Date(curr.timestamp) > new Date(existing.timestamp)) {
          existing.timestamp = curr.timestamp;
        }
        Object.keys(curr).forEach((key) => {
          if (key === "timestamp" || key === "address") return;
          const currentVal = curr[key];
          const existingVal = existing[key];
          if (Array.isArray(currentVal)) {
            existing[key] = Array.from(new Set([...(existingVal || []), ...currentVal]));
          } else if (typeof currentVal === "string" && currentVal.trim() !== "") {
            if (!existingVal) existing[key] = currentVal;
            else if (!String(existingVal).includes(currentVal)) existing[key] = `${existingVal}; ${currentVal}`;
          } else if (currentVal !== undefined) {
            existing[key] = currentVal;
          }
        });
      }
      return acc;
    }, {});

    const mergedResponses = Object.values(mergedByAddress);

    // Enrich from addressData (postcode/ward if present)
    const byAddr = new Map(addressData.map((row) => [row.address, row]));
    const enriched = mergedResponses.map((r) => {
      const extra = byAddr.get(r.address) || {};
      const OA_code = extra.OA || extra.oa || extra.output_area || extra.OutputArea || oa;
      const { postcode, ward } = extra;
      return {
        ...r,
        ...(OA_code ? { OA: OA_code } : {}),
        ...(postcode ? { postcode } : {}),
        ...(ward ? { ward } : {}),
      };
    });

    const csv = toCSV(enriched);

    const todayStr = new Date().toISOString().split("T")[0];
    const constituencyName = constituency || `OA ${oa || "unknown"}`;

    const constituencySafe = sanitizeFilename(constituencyName || "Constituency");
    const oaSafe = sanitizeFilename(oa || "unknownOA");
    const canvasserSafe = sanitizeFilename(canvasserName || "unknown");

    const fileName = `${constituencySafe}_OA${oaSafe}_${canvasserSafe}_${todayStr}.csv`;

    const bodyText =
      `Constituency: ${constituencyName}\n` +
      `OA: ${oa || "unknown"}\n` +
      `Canvasser: ${canvasserName}\n` +
      `Records: ${responses.length}\n`;

    try {
      setSending(true);
      setSendBtnLabel("Sending…");

      await sendReport({
        subjectOverride: `Survey results ${constituencyName} ${todayStr}`,
        bodyText,
        attachments: [{ filename: fileName, mimeType: "text/csv", content: csv }],
      });

      setSendBtnLabel("Report Sent ✅");
      alert(`✅ Report sent successfully to ${ADMIN_EMAIL}! File: ${fileName}`);
    } catch (error) {
      console.error(error);
      setSendBtnLabel("Failed ❌");
      alert(`❌ Failed to send report: ${error.message}`);
    } finally {
      setSending(false);
      setTimeout(() => setSendBtnLabel("Send Report to Demographikon"), 3000);
    }
  };

  // -------------------- Render guards --------------------
  if (bootstrapping) {
    return (
      <div style={{ padding: 20, backgroundColor: "#f0f0f0", minHeight: "100vh" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={titleStyle}>demographiKon</h1>
          <span style={{ fontStyle: "italic", fontSize: "10pt", color: "#b3b3b3" }}>Version 2.0.0</span>
        </div>
        <div style={{ ...inputStyle, backgroundColor: "#f0f0f0" }}>🔐 Starting canvass session…</div>
      </div>
    );
  }

  if (bootstrapError) {
    return (
      <div style={{ padding: 20, backgroundColor: "#f0f0f0", minHeight: "100vh" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={titleStyle}>demographiKon</h1>
          <span style={{ fontStyle: "italic", fontSize: "10pt", color: "#b3b3b3" }}>Version 2.0.0</span>
        </div>
        <div style={{ ...inputStyle, backgroundColor: "#ffe6e6", color: "#d00" }}>
          ❌ Cannot start canvassing: {bootstrapError}
        </div>
        <div style={{ marginTop: 10, fontSize: 14, color: "#666" }}>
          This app requires a signed token in the link you received by email.
        </div>
      </div>
    );
  }

  // -------------------- Main UI --------------------
  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={titleStyle}>demographiKon</h1>
        <span style={{ fontStyle: "italic", fontSize: "10pt", color: "#b3b3b3" }}>Version 2.0.0</span>
      </div>

      <div style={{ marginBottom: 12, fontSize: 14, color: "#666" }}>
        <div>
          <strong>User:</strong> {user?.id} ({user?.role})
        </div>
        <div>
          <strong>OA:</strong> {oa || "unknown"}
        </div>
      </div>
{/* -------------------- Metadata guard -------------------- */}
{metaLoading && (
  <div style={{ ...inputStyle, backgroundColor: "#f0f0f0" }}>
    📡 Loading canvass metadata…
  </div>
)}

{metaError && (
  <div style={{ ...inputStyle, backgroundColor: "#ffe6e6", color: "#d00" }}>
    ❌ Cannot load canvass metadata: {metaError}
  </div>
)}

{!metaLoading && !metaError && !enums && (
  <div style={{ ...inputStyle, backgroundColor: "#ffe6e6", color: "#d00" }}>
    ❌ Metadata missing (cannot continue)
  </div>
)}

{/* STOP RENDER HERE UNTIL METADATA EXISTS */}
{!(metaLoading || metaError || !enums) && (
  <>
    {/* Address selector */}
    {!currentAddress && (
        <label>
          Select Address:
          <br />
          {dataLoading ? (
            <div style={{ ...inputStyle, backgroundColor: "#f0f0f0" }}>📡 Loading address data...</div>
          ) : dataError ? (
            <div style={{ ...inputStyle, backgroundColor: "#ffe6e6", color: "#d00" }}>❌ {dataError}</div>
          ) : (
            <select
              value={currentAddress}
              onChange={(e) => {
                const selected = e.target.value;
                setCurrentAddress(selected);
                setFormData({ address: selected });
              }}
              style={inputStyle}
            >
              <option value="">-- Choose an address --</option>
              {addressData
                .filter((entry) => !visited.includes(entry.address))
                .map((entry, idx) => (
                  <option key={idx} value={entry.address}>
                    {entry.address}
                  </option>
                ))}
            </select>
          )}
        </label>
      )}

      <br />

      {currentAddress && !formData.response && (
        <div style={{ marginBottom: "20px" }}>
          <h3>Response</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <label
              style={{
                ...radioLabelStyle,
                backgroundColor: formData.response === "response" ? "#007bff" : "#e8e8e8",
                color: formData.response === "response" ? "#fff" : "#000",
                margin: "0",
                display: "flex",
                width: "100%",
              }}
            >
              <input
                type="radio"
                name="response"
                value="response"
          checked={formData.response === "response"}
                onChange={() => {
                  startNewPass();
                  setFormData({ ...formData, response: "response" });
                }}
                style={radioInputStyle}
              />
              Response
            </label>

            <label
              style={{
                ...radioLabelStyle,
                backgroundColor: formData.response === "no_response" ? "#6c757d" : "#e8e8e8",
                color: formData.response === "no_response" ? "#fff" : "#000",
                margin: "0",
                display: "flex",
                width: "100%",
              }}
            >
              <input
                type="radio"
                name="response"
                value="no_response"
          checked={formData.response === "no_response"}
                onChange={() => {
                  saveResponse({ address: formData.address, response: "no_response" }, true);
                }}
                style={radioInputStyle}
              />
              No Response
            </label>
          </div>
        </div>
      )}

      {formData.response === "response" && (
        <StepForm
          step={step}
          formData={formData}
          setFormData={setFormData}
          stepConfig={getFormSteps()[step]}
          onNext={() => saveResponse(formData, false)}
        />
      )}

      <div style={{ marginTop: 20, display: "flex", gap: "10px" }}>
        <button onClick={goToPreviousStep} style={buttonStyle}>
          ⬅ Previous
        </button>

        <button onClick={goToAddressSelection} style={{ ...buttonStyle, backgroundColor: "#6c757d" }}>
          ↩ Address Selection
        </button>
      </div>

      {/* Admin controls */}
      {isAdmin && (
        <div style={{ marginTop: 30 }}>
          <button onClick={() => setAdminMode(!adminMode)} style={buttonStyle}>
            Admin
          </button>

          {adminMode && (
            <div style={{ marginTop: 20 }}>
              <button
                onClick={sendResults}
                style={{
                  ...buttonStyle,
                  backgroundColor: sending ? "#888" : "green",
                  cursor: sending ? "not-allowed" : "pointer",
                }}
                disabled={sending}
              >
                {sendBtnLabel}
              </button>

              <div style={{ marginTop: 10, fontSize: "14px", color: "#666" }}>
                📊 Responses: {responses.length}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Debug info */}
      <div style={{ marginTop: 30, fontSize: 12, color: "#999" }}>
        <div>Source: {sourceRef || "n/a"}</div>
        <div>Session token: {sessionToken ? "✅ present" : "❌ missing"}</div>
      </div>
)}
    </div>
  );
}

export default App;