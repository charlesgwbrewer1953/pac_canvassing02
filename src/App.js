// src/App.js
import React, { useEffect, useMemo, useState } from "react";
import "./App.css";

import { fetchAddressDataWithFallback, parseAddressCsv } from "./gcsUtils";
import StepForm from "./components/StepForm";
import EnumGuard from "./components/EnumGuard";
import ResponseSelector from "./components/ResponseSelector";
import { useCanvassEnums } from "./hooks/useCanvassEnums";
import sendEmailReport from "./emailService";

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
const API_BASE = process.env.REACT_APP_API_BASE || "https://api.demographikon.org";
const GCS_PREFIX =
  process.env.REACT_APP_GCS_PREFIX || "https://storage.googleapis.com/pac20_oa_canvass";
const FALLBACK_URL = "/sample_address_data.csv";

// -------------------- Party colours --------------------
// Keys are DB enum labels (snake_case). Any missing value falls back to black.
const PARTY_COLOURS = {
  lab: "#E4003B",
  con: "#0087DC",
  libdem: "#FAA61A",
  grn: "#6AB023",
  snp: "#FDF38E",
  pc: "#005B54",
  ref: "#12B6CF",
  dup: "#D46A4C",
  sinn_fein: "#326760",
  sdlp: "#2AA82C",
  alliance: "#F6CB2F",
  uup: "#48A5EE",
};

// -------------------- Helpers --------------------
const getQueryParam = (name) => {
  const search = window.location.search || "";
  const fromSearch = new URLSearchParams(search).get(name);
  if (fromSearch) return fromSearch;

  const hash = window.location.hash || "";
  const qIndex = hash.indexOf("?");
  if (qIndex >= 0) {
    const hashQuery = hash.substring(qIndex + 1);
    return new URLSearchParams(hashQuery).get(name);
  }
  return null;
};

const genUUID = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

async function sendCanvassRecord({ sessionToken, payload }) {
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
    throw new Error(`db_write_failed_${resp.status}:${text}`);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function prettyKey(v) {
  return String(v).replace(/_/g, " ");
}

// Local storage keys (single source of truth on-device)
const LS_QUEUE = "canvassQueue"; // array of records
const LS_DRAFT = "canvassDraft"; // in-progress formData + step

// -------------------- App --------------------
export default function App() {
  // Bootstrap
  const [bootstrapping, setBootstrapping] = useState(true);
  const [bootstrapError, setBootstrapError] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  const [user, setUser] = useState(null);
  const [oa, setOA] = useState(null);
  const [canvasserName, setCanvasserName] = useState("");

  // Enums (DB canonical)
  const { enums, loading: metaLoading, error: metaError } = useCanvassEnums(API_BASE);

  // Address CSV
  const [addressData, setAddressData] = useState([]);
  const [visited, setVisited] = useState([]); // addresses with a completed local record
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(null);

  // Flow
  const [currentAddress, setCurrentAddress] = useState("");
  const [formData, setFormData] = useState({});
  const [step, setStep] = useState(0);

  // Local queue (records stored on device until Admin send)
  const [queue, setQueue] = useState([]); // { client_record_id, sent, last_error, ...fields }

  // Admin
  const [adminMode, setAdminMode] = useState(false);
  const [sendState, setSendState] = useState({ status: "idle", message: "" });

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

        if (!resp.ok) throw new Error(`Session bootstrap failed (${resp.status})`);
        const data = await resp.json();

        setSessionToken(data.session_token);
        setUser(data.user);
        setOA(data.scope?.oa || null);
        setCanvasserName(data.user?.name || data.user?.id || "canvasser");
      } catch (err) {
        setBootstrapError(err?.message || "Bootstrap failed");
      } finally {
        setBootstrapping(false);
      }
    }

    bootstrap();
  }, []);

  // -------------------- Restore local queue + draft --------------------
  useEffect(() => {
    try {
      const savedQueue = localStorage.getItem(LS_QUEUE);
      if (savedQueue) {
        const parsed = JSON.parse(savedQueue);
        if (Array.isArray(parsed)) {
          setQueue(parsed);
          setVisited(parsed.map((r) => r.address).filter(Boolean));
        }
      }
    } catch {
      // ignore
    }

    try {
      const savedDraft = localStorage.getItem(LS_DRAFT);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed?.currentAddress) {
          setCurrentAddress(parsed.currentAddress);
          setFormData(parsed.formData || {});
          setStep(typeof parsed.step === "number" ? parsed.step : 0);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist draft as user moves through wizard (so refresh won't lose work)
  useEffect(() => {
    try {
      localStorage.setItem(
        LS_DRAFT,
        JSON.stringify({ currentAddress, formData, step })
      );
    } catch {
      // ignore
    }
  }, [currentAddress, formData, step]);

  const persistQueue = (nextQueue) => {
    setQueue(nextQueue);
    setVisited(nextQueue.map((r) => r.address).filter(Boolean));
    localStorage.setItem(LS_QUEUE, JSON.stringify(nextQueue));
  };

  // -------------------- Load address CSV --------------------
  useEffect(() => {
    if (bootstrapping || bootstrapError) return;

    if (!oa) {
      setDataLoading(false);
      setDataError("No OA scope returned from /canvass-session");
      return;
    }

    const primaryUrl = `${GCS_PREFIX}/OA_${encodeURIComponent(oa)}.csv`;
    setDataLoading(true);
    setDataError(null);

    const object = getQueryParam("object");
    if (object) {
      const decoded = decodeURIComponent(object);

      fetch(`/.netlify/functions/gcs-proxy?object=${encodeURIComponent(decoded)}`)
        .then((resp) => {
          if (!resp.ok) throw new Error(`Proxy failed: ${resp.statusText}`);
          return resp.text();
        })
        .then((csvText) => setAddressData(parseAddressCsv(csvText)))
        .catch((err) => setDataError(err.message))
        .finally(() => setDataLoading(false));

      return;
    }

    fetchAddressDataWithFallback(primaryUrl, FALLBACK_URL)
      .then((data) => setAddressData(data))
      .catch((err) => setDataError(err.message))
      .finally(() => setDataLoading(false));
  }, [bootstrapping, bootstrapError, oa]);

  // -------------------- Steps (presentation logic) --------------------
  const getFormSteps = useMemo(() => {
    if (!enums) return () => [];

    return () => {
      const selected = addressData.find((a) => a.address === formData.address);
      const residents = selected?.residents || [];

      return [
        { name: "residents", label: "Who was spoken to?", type: "checkbox", options: residents },
        {
          name: "party",
          label: "Party Preference",
          type: "radio",
          options: enums.party.map((v) => ({
            value: v,
            label: v.toUpperCase(),
            color: PARTY_COLOURS[v] || "#000",
          })),
        },
        {
          name: "support",
          label: "Support level",
          type: "radio",
          options: enums.support.map((v) => ({ value: v, label: prettyKey(v), color: "#000" })),
        },
        {
          name: "likelihood",
          label: "Likelihood of Voting",
          type: "radio",
          options: enums.likelihood.map((v) => ({ value: v, label: prettyKey(v), color: "#000" })),
        },
        {
          name: "issue",
          label: "Most Important Issue",
          type: "radio",
          options: enums.issue.map((v) => ({ value: v, label: prettyKey(v), color: "#000" })),
        },
        { name: "notes", label: "Notes", type: "textarea" },
      ];
    };
  }, [enums, addressData, formData.address]);

  const steps = getFormSteps();

  // -------------------- Flow actions --------------------
  const goToAddressSelection = () => {
    setAdminMode(false);
    setCurrentAddress("");
    setFormData({});
    setStep(0);
    setSendState({ status: "idle", message: "" });
  };

  const goToPreviousStep = () => {
    // Presentation logic: Previous goes back within the wizard;
    // if you're at response step, Previous returns to Address Selection.
    if (formData.response === "response" && step > 0) {
      setStep((s) => s - 1);
      return;
    }
    // If survey not started yet (or at first step), return to address selection
    goToAddressSelection();
  };

  const enqueueCompletedRecord = (entry) => {
    const withIds = {
      client_record_id: entry.client_record_id || genUUID(),
      sent: false,
      last_error: null,
      ...entry,
    };

    // One record per address; replace if already exists (most recent wins)
    const filtered = queue.filter((r) => r.address !== withIds.address);
    const next = [...filtered, withIds];
    persistQueue(next);
  };

  const finalizeCurrentAddress = (finalData) => {
    const entry = {
      address: finalData.address,
      response: finalData.response,
      residents: finalData.residents || [],
      party: finalData.party ?? null,
      support: finalData.support ?? null,
      likelihood: finalData.likelihood ?? null,
      issue: finalData.issue ?? null,
      notes: finalData.notes || null,
      canvasser: canvasserName,
      OA: oa,
      canvassed_at: nowIso(),
      timestamp: nowIso(),
    };

    enqueueCompletedRecord(entry);

    // Reset wizard and return to address list
    setStep(0);
    setFormData({});
    setCurrentAddress("");
  };

  const onResponseChosen = (respValue) => {
    const next = { ...formData, address: currentAddress, response: respValue };
    setFormData(next);

    // Canonical rule: ONLY "response" continues the survey.
    // Everything else is terminal and immediately completes the address locally.
    if (respValue !== "response") {
      finalizeCurrentAddress({ address: currentAddress, response: respValue });
    }
  };

  const onNextStep = () => {
    const isLast = step >= steps.length - 1;
    if (isLast) {
      finalizeCurrentAddress(formData);
    } else {
      setStep((s) => s + 1);
    }
  };

  // -------------------- Admin send (bulk, confirm, retry) --------------------
  const unsent = queue.filter((r) => !r.sent);

  const sendAllOnce = async () => {
    if (!sessionToken) {
      setSendState({ status: "error", message: "No session token available." });
      return { ok: false, remaining: unsent.length };
    }

    const pending = queue.filter((r) => !r.sent);
    if (pending.length === 0) {
      setSendState({ status: "success", message: "No unsent records." });
      return { ok: true, remaining: 0 };
    }

    setSendState({ status: "sending", message: `Sending ${pending.length} record(s)…` });

    const results = [];
    let nextQueue = [...queue];

    for (const rec of pending) {
      const payload = {
        client_record_id: rec.client_record_id,
        address: rec.address,
        response: rec.response,
        party: rec.party ?? null,
        support: rec.support ?? null,
        likelihood: rec.likelihood ?? null,
        issue: rec.issue ?? null,
        notes: rec.notes || null,
        canvassed_at: rec.canvassed_at || rec.timestamp || nowIso(),
      };

      try {
        await sendCanvassRecord({ sessionToken, payload });
        nextQueue = nextQueue.map((x) =>
          x.client_record_id === rec.client_record_id
            ? { ...x, sent: true, last_error: null }
            : x
        );
        results.push({ client_record_id: rec.client_record_id, ok: true });
      } catch (e) {
        const msg = e?.message || String(e);
        nextQueue = nextQueue.map((x) =>
          x.client_record_id === rec.client_record_id
            ? { ...x, sent: false, last_error: msg }
            : x
        );
        results.push({ client_record_id: rec.client_record_id, ok: false, error: msg });
      }
    }

    persistQueue(nextQueue);

    const remaining = nextQueue.filter((r) => !r.sent).length;
    const ok = remaining === 0;

    // Email backup (attempt summary + payloads)
    try {
      const date = new Date().toLocaleDateString();
      const time = new Date().toLocaleTimeString();
      await sendEmailReport({
        canvasser: canvasserName,
        date,
        time,
        subjectOverride: ok
          ? `Canvassing Report (SUCCESS) - ${canvasserName} ${date}`
          : `Canvassing Report (PARTIAL) - ${canvasserName} ${date}`,
        bodyText: ok
          ? `All records sent successfully. Count: ${results.length}`
          : `Some records failed to send. Sent: ${results.filter((r) => r.ok).length}, Failed: ${results.filter((r) => !r.ok).length}, Remaining unsent: ${remaining}`,
        dataJSON: JSON.stringify(
          {
            oa,
            canvasser: canvasserName,
            attempted_at: nowIso(),
            results,
            records: pending,
          },
          null,
          2
        ),
      });
    } catch (e) {
      // Backup email failure should not block DB transmission status
      // (We still surface it so user knows.)
      // We'll append to message below.
      const m = e?.message || String(e);
      setSendState((s) => ({
        ...s,
        message: `${s.message}\nEmail backup failed: ${m}`,
      }));
    }

    if (ok) {
      setSendState({ status: "success", message: `Success. Sent ${results.length} record(s).` });
    } else {
      setSendState({
        status: "retrying",
        message: `Partial success. Remaining unsent: ${remaining}. Will retry in 30 seconds…`,
      });
    }

    return { ok, remaining };
  };

  const sendAllWithRetry = async () => {
    // Retry loop until success.
    // Stops if user leaves Admin mode (adminMode becomes false).
    let attempt = 0;
    while (true) {
      if (!adminMode) return;
      attempt += 1;
      const { ok } = await sendAllOnce();
      if (ok) return;
      // Wait 30s then retry
      await new Promise((r) => setTimeout(r, 30000));
    }
  };

  // -------------------- Render guards --------------------
  if (bootstrapping) return <div style={{ padding: 20 }}>🔐 Starting canvass session…</div>;
  if (bootstrapError)
    return <div style={{ padding: 20 }}>❌ Cannot start canvassing: {bootstrapError}</div>;

  return (
    <div style={{ padding: 20, fontFamily: "Roboto, sans-serif" }}>
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

      <EnumGuard loading={metaLoading} error={metaError} enums={enums}>
        {/* ---------------- Admin screen (presentation: explicit send) ---------------- */}
        {adminMode && (
          <div style={{ marginTop: 10 }}>
            <h3>Admin</h3>

            <div style={{ marginBottom: 10 }}>
              <div>
                <strong>Unsent records:</strong> {unsent.length}
              </div>
              <div>
                <strong>Total stored on device:</strong> {queue.length}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={sendAllWithRetry}
                style={{ ...buttonStyle, backgroundColor: "#28a745" }}
                disabled={sendState.status === "sending"}
              >
                Send Report to Demographikon
              </button>

              <button
                onClick={async () => {
                  try {
                    const date = new Date().toLocaleDateString();
                    const time = new Date().toLocaleTimeString();
                    await sendEmailReport({
                      canvasser: canvasserName,
                      date,
                      time,
                      subjectOverride: `Canvassing Report (MANUAL EMAIL) - ${canvasserName} ${date}`,
                      dataJSON: JSON.stringify({ oa, canvasser: canvasserName, queued: queue }, null, 2),
                    });
                    setSendState({ status: "success", message: "Email backup sent." });
                  } catch (e) {
                    setSendState({ status: "error", message: e?.message || String(e) });
                  }
                }}
                style={{ ...buttonStyle, backgroundColor: "#6c757d" }}
              >
                Email Backup
              </button>
            </div>

            {sendState.message && (
              <pre
                style={{
                  marginTop: 12,
                  padding: 12,
                  background: "#f8f9fa",
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {sendState.status.toUpperCase()}: {sendState.message}
              </pre>
            )}

            {unsent.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <details>
                  <summary>Show unsent records</summary>
                  <pre style={{ whiteSpace: "pre-wrap" }}>
                    {JSON.stringify(unsent.map(({ last_error, ...r }) => r), null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </div>
        )}

        {/* ---------------- Address selector ---------------- */}
        {!adminMode && !currentAddress && (
          <label>
            Select Address:
            <br />
            {dataLoading ? (
              <div style={{ ...inputStyle, backgroundColor: "#f0f0f0" }}>📡 Loading address data…</div>
            ) : dataError ? (
              <div style={{ ...inputStyle, backgroundColor: "#ffe6e6", color: "#d00" }}>❌ {dataError}</div>
            ) : (
              <select
                value={currentAddress}
                onChange={(e) => {
                  const selected = e.target.value;
                  setCurrentAddress(selected);
                  setFormData({ address: selected });
                  setStep(0);
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

        {/* ---------------- Response selector ---------------- */}
        {!adminMode && currentAddress && !formData.response && (
          <ResponseSelector
            options={enums?.response || []}
            value={formData.response}
            radioLabelStyle={radioLabelStyle}
            radioInputStyle={radioInputStyle}
            onSetResponse={onResponseChosen}
          />
        )}

        {/* ---------------- Step form ---------------- */}
        {!adminMode && formData.response === "response" && steps[step] && (
          <StepForm
            step={step}
            formData={formData}
            setFormData={setFormData}
            stepConfig={steps[step]}
            onNext={onNextStep}
          />
        )}

        {/* ---------------- Navigation buttons ---------------- */}
        <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={goToPreviousStep} style={buttonStyle} disabled={adminMode}>
            ⬅ Previous
          </button>

          <button
            onClick={goToAddressSelection}
            style={{ ...buttonStyle, backgroundColor: "#6c757d" }}
          >
            ↩ Address Selection
          </button>

          <button
            onClick={() => {
              setAdminMode((v) => !v);
              setSendState({ status: "idle", message: "" });
            }}
            style={{ ...buttonStyle, backgroundColor: "#17a2b8" }}
          >
            Admin
          </button>
        </div>
      </EnumGuard>
    </div>
  );
}
