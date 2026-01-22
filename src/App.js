import React, { useEffect, useMemo, useState } from "react";
import "./App.css";

import ResponseSelector from "./components/ResponseSelector";
import StepForm from "./components/StepForm";
import AddressSelector from "./components/AddressSelector";

const API_BASE = process.env.REACT_APP_API_BASE;

function getTokenFromUrl() {
  const hash = window.location.hash || "";
  const params = new URLSearchParams(hash.split("?")[1]);
  return params.get("token");
}

export default function App() {
  /* =========================
     GLOBAL / SESSION STATE
     ========================= */

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const [session, setSession] = useState(null); // user, oa, session_token
  const [enums, setEnums] = useState(null);

  /* =========================
     ADDRESS + FLOW STATE
     ========================= */

  const [addresses, setAddresses] = useState([]);
  const [currentAddress, setCurrentAddress] = useState(null);

  const [response, setResponse] = useState(null); // response_status enum

  /* =========================
     SURVEY DRAFT (LOCAL ONLY)
     ========================= */

  const [party, setParty] = useState(null);
  const [support, setSupport] = useState(null);
  const [likelihood, setLikelihood] = useState(null);
  const [issue, setIssue] = useState(null);
  const [notes, setNotes] = useState("");

  /* =========================
     OFFLINE QUEUE
     ========================= */

  const [queue, setQueue] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("canvass_queue") || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("canvass_queue", JSON.stringify(queue));
  }, [queue]);

  /* =========================
     BOOTSTRAP
     ========================= */

  useEffect(() => {
    async function bootstrap() {
      try {
        const token = getTokenFromUrl();
        if (!token) {
          setError("Missing canvass token in URL (token=...)");
          setLoading(false);
          return;
        }

        // Start session
        const res = await fetch(`${API_BASE}/canvass/canvass-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!res.ok) throw new Error("Failed to start canvass session");

        const sessionData = await res.json();
        setSession(sessionData);

        // Load enums (canonical DB truth)
        const metaRes = await fetch(`${API_BASE}/canvass/metadata`, {
          headers: {
            Authorization: `Bearer ${sessionData.session_token}`,
          },
        });

        if (!metaRes.ok) throw new Error("Failed to load metadata");

        const meta = await metaRes.json();
        setEnums(meta);

        // Addresses are OA-scoped CSV via backend
        const addrRes = await fetch(
          `${API_BASE}/canvass/addresses/${sessionData.scope.oa}`,
          {
            headers: {
              Authorization: `Bearer ${sessionData.session_token}`,
            },
          }
        );

        if (!addrRes.ok) throw new Error("Failed to load addresses");

        const addrData = await addrRes.json();
        setAddresses(addrData);

        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    }

    bootstrap();
  }, []);

  /* =========================
     HELPERS
     ========================= */

  function resetDraft() {
    setResponse(null);
    setParty(null);
    setSupport(null);
    setLikelihood(null);
    setIssue(null);
    setNotes("");
  }

  function saveRecord() {
    if (!currentAddress || !response) return;

    const record = {
      address: currentAddress,
      response,
      party,
      support,
      likelihood,
      issue,
      notes,
      created_at: new Date().toISOString(),
    };

    setQueue((q) => [...q, record]);

    resetDraft();
    setCurrentAddress(null);
  }

  async function sendAllQueued() {
    if (!queue.length) return;

    try {
      for (const record of queue) {
        const res = await fetch(`${API_BASE}/canvass/canvass-records`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session_token}`,
          },
          body: JSON.stringify(record),
        });

        if (!res.ok) throw new Error("Failed to submit record");
      }

      setQueue([]);
      alert("All responses successfully submitted.");
    } catch (err) {
      alert(
        "Submission failed. Responses are safely stored and will retry later."
      );
    }
  }

  /* =========================
     RENDER
     ========================= */

  if (loading) return <div>Loading…</div>;

  if (error)
    return (
      <div style={{ color: "red", padding: 20 }}>
        ❌ Cannot start canvassing: {error}
      </div>
    );

  if (!session || !enums) return null;

  return (
    <div className="App">
      <h1>demographiKon</h1>

      <div style={{ marginBottom: 16 }}>
        <strong>User:</strong> {session.user.id} ({session.user.role})
        <br />
        <strong>OA:</strong> {session.scope.oa}
      </div>

      {/* ADDRESS SELECTION */}
      {!currentAddress && (
        <AddressSelector
          addresses={addresses}
          onSelect={(addr) => {
            resetDraft();
            setCurrentAddress(addr);
          }}
        />
      )}

      {/* RESPONSE SCREEN */}
      {currentAddress && response === null && (
        <ResponseSelector
          options={enums.response}
          value={response}
          onResponse={setResponse}
        />
      )}

      {/* TERMINAL RESPONSE */}
      {currentAddress && response && response !== "response" && (
        <div style={{ marginTop: 20 }}>
          <p>
            Terminal outcome: <strong>{response}</strong>
          </p>
          <button onClick={saveRecord}>Save & return to list</button>
        </div>
      )}

      {/* STEPPED SURVEY */}
      {currentAddress && response === "response" && (
        <StepForm
          enums={enums}
          value={{ party, support, likelihood, issue, notes }}
          onChange={(v) => {
            setParty(v.party ?? party);
            setSupport(v.support ?? support);
            setLikelihood(v.likelihood ?? likelihood);
            setIssue(v.issue ?? issue);
            setNotes(v.notes ?? notes);
          }}
          onBackToResponse={() => setResponse(null)}
          onDone={saveRecord}
        />
      )}

      {/* ADMIN SEND */}
      <hr style={{ margin: "30px 0" }} />

      <button onClick={sendAllQueued}>
        Admin: Send {queue.length} queued response
        {queue.length === 1 ? "" : "s"}
      </button>
    </div>
  );
}