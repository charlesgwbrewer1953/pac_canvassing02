// src/App.js
import React, { useEffect, useMemo, useState } from "react";
import "./App.css";

import { shuffle } from "./utils";
import { fetchAddressDataWithFallback } from "./gcsUtils";
import sendReport from "./emailService";
import StepForm from "./components/StepForm";

/* -------------------- Config -------------------- */

const API_BASE =
  process.env.REACT_APP_API_BASE || "https://demographikon-auth-production.up.railway.app";

const GCS_PREFIX =
  process.env.REACT_APP_GCS_PREFIX ||
  "https://storage.googleapis.com/pac20_oa_canvass";

const FALLBACK_URL = "/sample_address_data.csv";

const ISSUE_OPTIONS = ["Immigration", "Economy", "NHS", "Housing", "Net Zero"];

/* -------------------- Helpers -------------------- */

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
      console.error("DB write failed", resp.status);
      return false;
    }
    return true;
  } catch (e) {
    console.error("DB write error", e);
    return false;
  }
}

/* -------------------- App -------------------- */

function App() {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [bootstrapError, setBootstrapError] = useState(null);

  const [sessionToken, setSessionToken] = useState(null);
  const [user, setUser] = useState(null);
  const [oa, setOA] = useState(null);

  const [canvasserName, setCanvasserName] = useState("");
  const [addressData, setAddressData] = useState([]);
  const [visited, setVisited] = useState([]);
  const [responses, setResponses] = useState([]);
  const [formData, setFormData] = useState({});
  const [currentAddress, setCurrentAddress] = useState("");
  const [step, setStep] = useState(0);
  const [issuesOrder, setIssuesOrder] = useState(ISSUE_OPTIONS);

  const isAdmin = useMemo(
    () => user?.role === "admin" || user?.role === "sysadmin",
    [user]
  );

  /* -------------------- Bootstrap session -------------------- */

  useEffect(() => {
    async function bootstrap() {
      try {
        const token = getQueryParam("token");
        if (!token) throw new Error("Missing canvass token");

        const resp = await fetch(`${API_BASE}/canvass/canvass-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!resp.ok) throw new Error(`Bootstrap failed (${resp.status})`);

        const data = await resp.json();

        setSessionToken(data.session_token);
        setUser(data.user);
        setOA(data.scope?.oa || null);
        setCanvasserName(data.user?.name || data.user?.id || "canvasser");
      } catch (e) {
        setBootstrapError(e.message);
      } finally {
        setBootstrapping(false);
      }
    }
    bootstrap();
  }, []);

  /* -------------------- Load CSV -------------------- */

  useEffect(() => {
    if (!oa || bootstrapError) return;

    const url = `${GCS_PREFIX}/OA_${encodeURIComponent(oa)}.csv`;

    fetchAddressDataWithFallback(url, FALLBACK_URL)
      .then(setAddressData)
      .catch((e) => console.error(e));
  }, [oa, bootstrapError]);

  /* -------------------- Form helpers -------------------- */

  const startNewPass = () => {
    setIssuesOrder(shuffle([...ISSUE_OPTIONS]));
    setStep(0);
  };

  const saveResponse = (data, auto = false) => {
    const entry = {
      ...data,
      timestamp: new Date().toISOString(),
      canvasser: canvasserName,
      OA: oa,
    };

    const nextResponses = [
      ...responses.filter((r) => r.address !== data.address),
      entry,
    ];

    setResponses(nextResponses);
    setVisited([...new Set([...visited, data.address])]);
    localStorage.setItem("canvassData", JSON.stringify(nextResponses));

    if (sessionToken) {
      sendCanvassRecord({
        sessionToken,
        payload: {
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
        },
      });
    }

    if (auto || step === getFormSteps().length - 1) {
      setStep(0);
      setFormData({});
      setCurrentAddress("");
    } else {
      setStep(step + 1);
    }
  };

  const getFormSteps = () => [
    { name: "residents", label: "Who was spoken to?", type: "checkbox" },
    { name: "party", label: "Party Preference", type: "radio" },
    { name: "support", label: "Support level", type: "radio" },
    { name: "likelihood", label: "Likelihood of Voting", type: "radio" },
    { name: "issue", label: "Most Important Issue", type: "radio" },
    { name: "notes", label: "Notes", type: "textarea" },
  ];

  /* -------------------- Email sending -------------------- */

  const sendResults = async () => {
    await sendReport({
      subjectOverride: `Canvass results ${oa}`,
      bodyText: `Canvasser: ${canvasserName}\nOA: ${oa}`,
      attachments: [
        {
          filename: `canvass_${oa}.json`,
          mimeType: "application/json",
          content: JSON.stringify(responses, null, 2),
        },
      ],
    });
  };

  /* -------------------- Render guards -------------------- */

  if (bootstrapping) return <div>Starting canvass session…</div>;

  if (bootstrapError)
    return <div>❌ Cannot start canvassing: {bootstrapError}</div>;

  /* -------------------- UI -------------------- */

  return (
    <div style={{ padding: 20 }}>
      <h1>demographiKon</h1>
      <div>User: {user?.id}</div>
      <div>OA: {oa}</div>

      {!currentAddress && (
        <select
          value={currentAddress}
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
        <button onClick={sendResults}>Send Report</button>
      )}
    </div>
  );
}

export default App;