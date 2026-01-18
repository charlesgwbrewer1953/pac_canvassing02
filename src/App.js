// src/App.js
import React, { useState, useEffect, useMemo } from "react";
import "./App.css";
import StepForm from "./components/StepForm";
import { shuffle } from "./utils";
import { fetchAddressDataWithFallback, parseAddressCsv } from "./gcsUtils";
import sendReport from "./emailService";

/* ------------------------------------------------------------------
 * CONFIG
 * ------------------------------------------------------------------ */

const API_BASE =
  process.env.REACT_APP_API_BASE || "https://demographikon-auth-production.up.railway.app";

const GCS_PREFIX =
  process.env.REACT_APP_GCS_PREFIX ||
  "https://storage.googleapis.com/pac20_oa_canvass";

const FALLBACK_URL = "/sample_address_data.csv";

const ISSUE_OPTIONS = ["Immigration", "Economy", "NHS", "Housing", "Net Zero"];

/* ------------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------------ */

function getQueryParam(name) {
  const fromSearch = new URLSearchParams(window.location.search).get(name);
  if (fromSearch) return fromSearch;

  const hash = window.location.hash || "";
  const q = hash.indexOf("?");
  if (q >= 0) {
    return new URLSearchParams(hash.substring(q + 1)).get(name);
  }
  return null;
}

async function sendCanvassRecord(sessionToken, payload) {
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
      console.error("DB write failed:", resp.status);
    }
  } catch (e) {
    console.error("DB write error:", e);
  }
}

/* ------------------------------------------------------------------
 * APP
 * ------------------------------------------------------------------ */

function App() {
  /* -------------------- Bootstrap state -------------------- */
  const [bootstrapping, setBootstrapping] = useState(true);
  const [bootstrapError, setBootstrapError] = useState(null);

  const [sessionToken, setSessionToken] = useState(null);
  const [user, setUser] = useState(null);
  const [oa, setOA] = useState(null);

  /* -------------------- App state -------------------- */
  const [addressData, setAddressData] = useState([]);
  const [visited, setVisited] = useState([]);
  const [responses, setResponses] = useState([]);

  const [currentAddress, setCurrentAddress] = useState("");
  const [formData, setFormData] = useState({});
  const [step, setStep] = useState(0);

  const [issuesOrder, setIssuesOrder] = useState(ISSUE_OPTIONS);

  const isAdmin = useMemo(
    () => user?.role === "admin" || user?.role === "sysadmin",
    [user]
  );

  /* ------------------------------------------------------------------
   * BOOTSTRAP SESSION
   * ------------------------------------------------------------------ */

  useEffect(() => {
    async function bootstrap() {
      try {
        const token = getQueryParam("token");

        if (!token) {
          throw new Error("Missing canvass token");
        }

        const resp = await fetch(`${API_BASE}/canvass/canvass-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!resp.ok) {
          throw new Error(`Session bootstrap failed (${resp.status})`);
        }

        const data = await resp.json();

        setSessionToken(data.session_token);
        setUser(data.user);
        setOA(data.scope?.oa || null);
      } catch (err) {
        setBootstrapError(err.message);
      } finally {
        setBootstrapping(false);
      }
    }

    bootstrap();
  }, []);

  /* ------------------------------------------------------------------
   * LOAD ADDRESS DATA
   * ------------------------------------------------------------------ */

  useEffect(() => {
    if (bootstrapping || bootstrapError || !oa) return;

    const url = `${GCS_PREFIX}/OA_${encodeURIComponent(oa)}.csv`;

    fetchAddressDataWithFallback(url, FALLBACK_URL)
      .then(setAddressData)
      .catch((e) => setBootstrapError(e.message));
  }, [bootstrapping, bootstrapError, oa]);

  /* ------------------------------------------------------------------
   * FORM LOGIC
   * ------------------------------------------------------------------ */

  function startNewPass() {
    setIssuesOrder(shuffle([...ISSUE_OPTIONS]));
    setStep(0);
  }

  function saveResponse(data, auto = false) {
    const entry = {
      ...data,
      OA: oa,
      timestamp: new Date().toISOString(),
    };

    const filtered = responses.filter((r) => r.address !== data.address);
    const nextResponses = [...filtered, entry];

    setResponses(nextResponses);
    setVisited([...new Set([...visited, data.address])]);
    localStorage.setItem("canvassData", JSON.stringify(nextResponses));

    if (sessionToken) {
      sendCanvassRecord(sessionToken, {
        client_record_id: crypto.randomUUID(),
        address: data.address,
        response: data.response,
        residents: data.residents || null,
        party: data.party || null,
        support: data.support || null,
        likelihood: data.likelihood || null,
        issue: data.issue || null,
        notes: data.notes || null,
        canvassed_at: new Date().toISOString(),
      });
    }

    const steps = getFormSteps();
    if (auto || step === steps.length - 1) {
      setStep(0);
      setFormData({});
      setCurrentAddress("");
    } else {
      setStep(step + 1);
    }
  }

  function getFormSteps() {
    const selected = addressData.find((a) => a.address === formData.address);
    const residents = selected?.residents || [];

    return [
      { name: "residents", label: "Who was spoken to?", type: "checkbox", options: residents },
      {
        name: "party",
        label: "Party Preference",
        type: "radio",
        options: ["CON", "LAB", "LIBDEM", "REF", "GRN", "OTH", "NONE"],
      },
      {
        name: "support",
        label: "Support level",
        type: "radio",
        options: ["certain", "strong", "lean to", "none"],
      },
      {
        name: "likelihood",
        label: "Likelihood of Voting",
        type: "radio",
        options: ["definitely", "probably", "unlikely", "no"],
      },
      {
        name: "issue",
        label: "Most Important Issue",
        type: "radio",
        options: issuesOrder,
      },
      { name: "notes", label: "Notes", type: "textarea" },
    ];
  }

  /* ------------------------------------------------------------------
   * RENDER GUARDS
   * ------------------------------------------------------------------ */

  if (bootstrapping) {
    return <div style={{ padding: 20 }}>Starting canvass session…</div>;
  }

  if (bootstrapError) {
    return (
      <div style={{ padding: 20, color: "red" }}>
        ❌ Cannot start canvassing: {bootstrapError}
      </div>
    );
  }

  /* ------------------------------------------------------------------
   * MAIN UI
   * ------------------------------------------------------------------ */

  return (
    <div style={{ padding: 20 }}>
      <h1>demographiKon</h1>

      <div style={{ fontSize: 14, marginBottom: 10 }}>
        <div>User: {user?.id} ({user?.role})</div>
        <div>OA: {oa}</div>
      </div>

      {!currentAddress && (
        <select
          value=""
          onChange={(e) => {
            setCurrentAddress(e.target.value);
            setFormData({ address: e.target.value });
          }}
        >
          <option value="">-- Choose an address --</option>
          {addressData
            .filter((a) => !visited.includes(a.address))
            .map((a, i) => (
              <option key={i} value={a.address}>
                {a.address}
              </option>
            ))}
        </select>
      )}

      {currentAddress && !formData.response && (
        <>
          <button
            onClick={() => {
              startNewPass();
              setFormData({ ...formData, response: "Response" });
            }}
          >
            Response
          </button>

          <button
            onClick={() =>
              saveResponse({ address: currentAddress, response: "No Response" }, true)
            }
          >
            No Response
          </button>
        </>
      )}

      {formData.response === "Response" && (
        <StepForm
          step={step}
          formData={formData}
          setFormData={setFormData}
          stepConfig={getFormSteps()[step]}
          onNext={() => saveResponse(formData)}
        />
      )}

      {isAdmin && (
        <button
          onClick={() =>
            sendReport({
              subjectOverride: "Canvass results",
              bodyText: "Attached canvass data",
              attachments: [
                {
                  filename: "canvass.csv",
                  mimeType: "text/csv",
                  content: JSON.stringify(responses),
                },
              ],
            })
          }
        >
          Send Report
        </button>
      )}
    </div>
  );
}

export default App;