// src/App.js
import React, { useEffect, useMemo, useState } from "react";
import "./App.css";

import { fetchAddressDataWithFallback, parseAddressCsv } from "./gcsUtils";
import StepForm from "./components/StepForm";
import EnumGuard from "./components/EnumGuard";
import ResponseSelector from "./components/ResponseSelector";
import { useCanvassEnums } from "./hooks/useCanvassEnums";

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

// -------------------- API call --------------------
async function sendCanvassRecord({ API_BASE, sessionToken, payload }) {
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
  const [visited, setVisited] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(null);

  // Form
  const [currentAddress, setCurrentAddress] = useState("");
  const [formData, setFormData] = useState({});
  const [responses, setResponses] = useState([]);
  const [step, setStep] = useState(0);

  // Bootstrap session
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

  // Restore local responses
  useEffect(() => {
    const savedData = localStorage.getItem("canvassData");
    if (!savedData) return;

    try {
      const parsed = JSON.parse(savedData);
      setResponses(parsed);
      setVisited(parsed.map((r) => r.address));
    } catch {
      // ignore bad local state
    }
  }, []);

  // Load address CSV
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

  const getFormSteps = useMemo(() => {
    if (!enums) return () => [];

    const prettify = (v) => String(v).replace(/_/g, " ");

    return () => {
      const selected = addressData.find((a) => a.address === formData.address);
      const residents = selected?.residents || [];

      return [
        { name: "residents", label: "Who was spoken to?", type: "checkbox", options: residents },
        {
          name: "party",
          label: "Party Preference",
          type: "radio",
          options: enums.party.map((v) => ({ value: v, label: v.toUpperCase() })),
        },
        {
          name: "support",
          label: "Support level",
          type: "radio",
          options: enums.support.map((v) => ({ value: v, label: prettify(v) })),
        },
        {
          name: "likelihood",
          label: "Likelihood of Voting",
          type: "radio",
          options: enums.likelihood.map((v) => ({ value: v, label: prettify(v) })),
        },
        {
          name: "issue",
          label: "Most Important Issue",
          type: "radio",
          options: enums.issue.map((v) => ({ value: v, label: prettify(v) })),
        },
        { name: "notes", label: "Notes", type: "textarea" },
      ];
    };
  }, [enums, addressData, formData.address]);

  const saveLocal = (entry) => {
    const filtered = responses.filter((r) => r.address !== entry.address);
    const next = [...filtered, entry];
    setResponses(next);
    setVisited([...new Set([...visited, entry.address])]);
    localStorage.setItem("canvassData", JSON.stringify(next));
  };

  const saveResponse = async (data, auto = false) => {
    const steps = getFormSteps();
    const isFinalStep = auto || step === steps.length - 1;

    const newEntry = {
      ...data,
      timestamp: new Date().toISOString(),
      canvasser: canvasserName,
      OA: oa,
    };

    saveLocal(newEntry);

    if (isFinalStep && sessionToken) {
      const dbPayload = {
        client_record_id: genUUID(),
        address: data.address,
        response: data.response, // MUST be canonical enum label
        party: data.party ?? null,
        support: data.support ?? null,
        likelihood: data.likelihood ?? null,
        issue: data.issue ?? null,
        notes: data.notes || null,
        canvassed_at: new Date().toISOString(),
      };

      await sendCanvassRecord({ API_BASE, sessionToken, payload: dbPayload });
    }

    if (isFinalStep) {
      setStep(0);
      setFormData({});
      setCurrentAddress("");
    } else {
      setStep((s) => s + 1);
    }
  };

  const goToAddressSelection = () => {
    setCurrentAddress("");
    setFormData({});
    setStep(0);
  };

  const goToPreviousStep = () => {
    if (formData.response && step > 0) setStep((s) => s - 1);
    else goToAddressSelection();
  };

  // Render guards
  if (bootstrapping) return <div style={{ padding: 20 }}>🔐 Starting canvass session…</div>;
  if (bootstrapError) return <div style={{ padding: 20 }}>❌ Cannot start canvassing: {bootstrapError}</div>;

  const steps = getFormSteps();

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

      <EnumGuard loading={metaLoading} error={metaError} enums={enums}>
        {/* Address selector */}
        {!currentAddress && (
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

        {/* Response selector */}
        {currentAddress && !formData.response && (
          <ResponseSelector
            value={formData.response}
            radioLabelStyle={radioLabelStyle}
            radioInputStyle={radioInputStyle}
            onSetResponse={(respValue) => {
              const next = { ...formData, response: respValue };
              setFormData(next);

              // If it's non-contact statuses, auto-save immediately
              if (respValue === "no_response" || respValue === "not_home") {
                saveResponse({ address: currentAddress, response: respValue }, true);
              }
            }}
          />
        )}

        {/* Step form */}
        {formData.response === "response" && steps[step] && (
          <StepForm
            step={step}
            formData={formData}
            setFormData={setFormData}
            stepConfig={steps[step]}
            onNext={() => saveResponse(formData, false)}
          />
        )}

        <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
          <button onClick={goToPreviousStep} style={buttonStyle}>
            ⬅ Previous
          </button>

          <button onClick={goToAddressSelection} style={{ ...buttonStyle, backgroundColor: "#6c757d" }}>
            ↩ Address Selection
          </button>
        </div>
      </EnumGuard>
    </div>
  );
}