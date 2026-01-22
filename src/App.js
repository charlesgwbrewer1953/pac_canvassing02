import { useEffect, useState } from "react";
import ResponseSelector from "./components/ResponseSelector";
import OptionGrid from "./components/OptionGrid";
import PartySelector from "./components/PartySelector";

const API_BASE = process.env.REACT_APP_API_BASE;

/**
 * Robust token extraction:
 * - works for ?token=...
 * - works for #/start?token=...
 */
function getTokenFromUrl() {
  // Standard query string
  const searchParams = new URLSearchParams(window.location.search);
  const searchToken = searchParams.get("token");
  if (searchToken) return searchToken;

  // Hash-based routing: #/start?token=...
  if (window.location.hash.includes("?")) {
    const hashQuery = window.location.hash.split("?")[1];
    const hashParams = new URLSearchParams(hashQuery);
    return hashParams.get("token");
  }

  return null;
}

export default function App() {
  // -------------------------
  // Session / auth
  // -------------------------
  const [sessionToken, setSessionToken] = useState(null);
  const [user, setUser] = useState(null);
  const [oa, setOa] = useState(null);

  // -------------------------
  // Metadata (DB enums)
  // -------------------------
  const [enums, setEnums] = useState(null);

  // -------------------------
  // Addresses (stubbed CSV)
  // -------------------------
  const [addresses, setAddresses] = useState([]);
  const [currentAddress, setCurrentAddress] = useState(null);

  // -------------------------
  // Canvass state
  // -------------------------
  const [response, setResponse] = useState(null);
  const [party, setParty] = useState(null);
  const [support, setSupport] = useState(null);
  const [likelihood, setLikelihood] = useState(null);
  const [issue, setIssue] = useState(null);
  const [notes, setNotes] = useState("");

  // -------------------------
  // Guard: API base must exist
  // -------------------------
  if (!API_BASE) {
    return (
      <div style={{ padding: 20, color: "red" }}>
        Missing REACT_APP_API_BASE environment variable
      </div>
    );
  }

  // -------------------------
  // Create canvass session
  // -------------------------
  useEffect(() => {
    const token = getTokenFromUrl();
    if (!token) return;

    fetch(`${API_BASE}/canvass/canvass-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(res => res.json())
      .then(data => {
        setSessionToken(data.session_token);
        setUser(data.user);
        setOa(data.scope?.oa);
      })
      .catch(err => {
        console.error("Session error:", err);
      });
  }, []);

  // -------------------------
  // Load metadata (enums)
  // -------------------------
  useEffect(() => {
    if (!sessionToken) return;

    fetch(`${API_BASE}/canvass/metadata`, {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    })
      .then(res => res.json())
      .then(setEnums)
      .catch(err => {
        console.error("Metadata error:", err);
      });
  }, [sessionToken]);

  // -------------------------
  // Load addresses (TEMP)
  // -------------------------
  useEffect(() => {
    if (!oa) return;

    // TEMP: replace later with real OA-based source
    fetch("/sample_address_data.csv")
      .then(res => res.text())
      .then(text => {
        const rows = text.split("\n").slice(1).filter(Boolean);
        setAddresses(rows);
      });
  }, [oa]);

  // -------------------------
  // Helpers
  // -------------------------
  function resetSurvey() {
    setResponse(null);
    setParty(null);
    setSupport(null);
    setLikelihood(null);
    setIssue(null);
    setNotes("");
  }

  function saveRecord() {
    if (!currentAddress || !response) return;

    fetch(`${API_BASE}/canvass/canvass-records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        address: currentAddress,
        response,
        party,
        support,
        likelihood,
        issue,
        notes,
      }),
    })
      .then(() => {
        resetSurvey();
        setCurrentAddress(null);
      })
      .catch(err => {
        console.error("Save error:", err);
      });
  }

  // -------------------------
  // Render guards
  // -------------------------
  if (!user || !enums) {
    return <div style={{ padding: 20 }}>Loading…</div>;
  }

  // -------------------------
  // UI
  // -------------------------
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 20 }}>
      <h2>demographiKon</h2>

      <p>
        <strong>User:</strong> {user.id} ({user.role})
        <br />
        <strong>OA:</strong> {oa}
      </p>

      {/* ---------------- Address selection ---------------- */}
      {!currentAddress && (
        <>
          <h3>Select Address</h3>
          <select
            value=""
            onChange={e => setCurrentAddress(e.target.value)}
          >
            <option value="">-- Choose an address --</option>
            {addresses.map((a, i) => (
              <option key={i} value={a}>
                {a}
              </option>
            ))}
          </select>
        </>
      )}

      {/* ---------------- Response step ---------------- */}
      {currentAddress && !response && (
        <ResponseSelector
          options={enums.response}
          value={response}
          onChange={value => {
            setResponse(value);

            // TERMINAL RESPONSE: auto-save
            if (value !== "response") {
              setTimeout(saveRecord, 0);
            }
          }}
        />
      )}

      {/* ---------------- Survey (ONLY if response === "response") ---------------- */}
      {currentAddress && response === "response" && (
        <>
          <h3>Political Party</h3>
          <PartySelector
            options={enums.party}
            value={party}
            onChange={setParty}
          />

          {party && (
            <>
              <h3>Strength of Support</h3>
              <OptionGrid
                options={enums.support}
                selected={support}
                onSelect={setSupport}
              />
            </>
          )}

          {support && (
            <>
              <h3>Likelihood to Vote</h3>
              <OptionGrid
                options={enums.likelihood}
                selected={likelihood}
                onSelect={setLikelihood}
              />
            </>
          )}

          {likelihood && (
            <>
              <h3>Most Important Issue</h3>
              <OptionGrid
                options={enums.issue}
                selected={issue}
                onSelect={setIssue}
              />
            </>
          )}

          {issue && (
            <>
              <h3>Notes</h3>
              <textarea
                rows={4}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                style={{ width: "100%" }}
              />

              <br /><br />
              <button onClick={saveRecord}>
                Save Response
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}