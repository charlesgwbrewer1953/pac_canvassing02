// src/App.js
import React, { useState, useEffect, useMemo } from "react";
import "./App.css";
import { shuffle } from "./utils";
import { fetchAddressDataWithFallback } from "./gcsUtils";
import sendReport from "./emailService";
import StepForm from "./components/StepForm";

/* -------------------- Config -------------------- */

const API_BASE =
  process.env.REACT_APP_API_BASE || "https://api.demographikon.org";

const GCS_PREFIX =
  process.env.REACT_APP_GCS_PREFIX ||
  "https://storage.googleapis.com/pac20_oa_canvass";

const FALLBACK_URL = "/sample_address_data.csv";
const ADMIN_EMAIL = "demographikon.dev.01@gmail.com";

const ISSUE_OPTIONS = ["Immigration", "Economy", "NHS", "Housing", "Net Zero"];

/* -------------------- Helpers -------------------- */

const getQueryParam = (name) => {
  const fromSearch = new URLSearchParams(window.location.search).get(name);
  if (fromSearch) return fromSearch;

  const hash = window.location.hash || "";
  const q = hash.indexOf("?");
  if (q >= 0) {
    return new URLSearchParams(hash.slice(q + 1)).get(name);
  }
  return null;
};

const extractOAFromUrl = (url) => {
  if (!url) return null;
  try {
    const tail = url.substring(url.lastIndexOf("/") + 1);
    return tail.replace(".csv", "").split("_").pop();
  } catch {
    return null;
  }
};

const sanitizeFilename = (s) =>
  String(s || "").replace(/[^\w-]+/g, "-");

async function sendCanvassRecord({ sessionToken, payload }) {
  try {
    await fetch(`${API_BASE}/canvass/canvass-records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("DB write failed:", e);
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

  const [currentAddress, setCurrentAddress] = useState("");
  const [formData, setFormData] = useState({});
  const [step, setStep] = useState(0);

  const [issuesOrder, setIssuesOrder] = useState(ISSUE_OPTIONS);

  const isAdmin = useMemo(
    () => user?.role === "admin" || user?.role === "sysadmin",
    [user]
  );

  /* -------- Bootstrap session -------- */

  useEffect(() => {
    async function bootstrap() {
      try {
        const token = getQueryParam("token");
        const allowDev =
          process.env.REACT_APP_ALLOW_DEV_BYPASS === "true";

        if (!token && !allowDev) {
          throw new Error("Missing canvass token");
        }

        if (!token && allowDev) {
          setSessionToken("__DEV__");
          setUser({ id: "dev", role: "admin" });
          setOA("E00181357");
          setCanvasserName("Dev Tester");
          return;
        }

        const resp = await fetch(
          `${API_BASE}/canvass/canvass-session`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          }
        );

        if (!resp.ok) {
          throw new Error(`Session bootstrap failed (${resp.status})`);
        }

        const data = await resp.json();
        setSessionToken(data.session_token);
        setUser(data.user);
        setOA(data.scope?.oa || null);
        setCanvasserName(data.user?.name || data.user?.id);
      } catch (e) {
        setBootstrapError(e.message);
      } finally {
        setBootstrapping(false);
      }
    }

    bootstrap();
  }, []);

  /* -------- Load addresses -------- */

  useEffect(() => {
    if (!oa || bootstrapError) return;

    const url = `${GCS_PREFIX}/OA_${encodeURIComponent(oa)}.csv`;
    fetchAddressDataWithFallback(url, FALLBACK_URL)
      .then(setAddressData)
      .catch((e) => console.error(e));
  }, [oa, bootstrapError]);

  /* -------- Save response -------- */

  const saveResponse = (data, auto = false) => {
    const entry = {
      ...data,
      timestamp: new Date().toISOString(),
      canvasser: canvasserName,
      OA: oa,
    };

    const filtered = responses.filter(
      (r) => r.address !== data.address
    );
    const next = [...filtered, entry];

    setResponses(next);
    setVisited([...new Set([...visited, data.address])]);
    localStorage.setItem("canvassData", JSON.stringify(next));

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

    const steps = getFormSteps();
    if (auto || step === steps.length - 1) {
      setStep(0);
      setFormData({});
      setCurrentAddress("");
    } else {
      setStep(step + 1);
    }
  };

  const getFormSteps = () => [
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
      label: "Likelihood of voting",
      type: "radio",
      options: ["definitely", "probably", "unlikely", "no"],
    },
    {
      name: "issue",
      label: "Most important issue",
      type: "radio",
      options: shuffle([...issuesOrder]),
    },
    { name: "notes", label: "Notes", type: "textarea" },
  ];

  /* -------- Render guards -------- */

  if (bootstrapping) return <div>Starting canvass…</div>;

  if (bootstrapError) {
    return <div>❌ Cannot start canvassing: {bootstrapError}</div>;
  }

  /* -------- UI -------- */

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
            setIssuesOrder(shuffle([...ISSUE_OPTIONS]));
          }}
        >
          <option value="">Select address</option>
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
    </div>
  );
}

export default App;