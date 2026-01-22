import React, { useEffect, useState } from "react";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [session, setSession] = useState(null);
  const [enums, setEnums] = useState(null);

  const [addresses, setAddresses] = useState([]);
  const [currentAddress, setCurrentAddress] = useState(null);
  const [response, setResponse] = useState(null);

  const [party, setParty] = useState(null);
  const [support, setSupport] = useState(null);
  const [likelihood, setLikelihood] = useState(null);
  const [issue, setIssue] = useState(null);
  const [notes, setNotes] = useState("");

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

  useEffect(() => {
    async function bootstrap() {
      try {
        const token = getTokenFromUrl();
        if (!token) throw new Error("Missing canvass token in URL");

        const res = await fetch(`${API_BASE}/canvass/canvass-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!res.ok) throw new Error("Failed to start session");
        const sessionData = await res.json();
        setSession(sessionData);

        const metaRes = await fetch(`${API_BASE}/canvass/metadata`, {
          headers: {
            Authorization: `Bearer ${sessionData.session_token}`,
          },
        });

        if (!metaRes.ok) throw new Error("Failed to load metadata");
        setEnums(await metaRes.json());

        const addrRes = await fetch(
          `${API_BASE}/canvass/addresses/${sessionData.scope.oa}`,
          {
            headers: {
              Authorization: `Bearer ${sessionData.session_token}`,
            },
          }
        );

        if (!addrRes.ok) throw new Error("Failed to load addresses");
        setAddresses(await addrRes.json());

        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    }

    bootstrap();
  }, []);

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

        if (!res.ok) throw new Error("Submit failed");
      }

      setQueue([]);
      alert("All responses submitted successfully");
    } catch {
      alert("Send failed — responses retained locally");
    }
  }

  if (loading) return <div>Loading…</div>;
  if (error) return <div style={{ color: "red" }}>{error}</div>;
  if (!session || !enums) return null;

  return (
    <div className="App">
      <h1>demographiKon</h1>

      {!currentAddress && (
        <AddressSelector
          addresses={addresses}
          onSelect={(addr) => {
            resetDraft();
            setCurrentAddress(addr);
          }}
        />
      )}

      {currentAddress && response === null && (
        <ResponseSelector
          options={enums.response}
          value={response}
          onResponse={setResponse}
        />
      )}

      {currentAddress && response && response !== "response" && (
        <button onClick={saveRecord}>Save & return</button>
      )}

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

      <hr />
      <button onClick={sendAllQueued}>
        Admin: Send {queue.length} queued responses
      </button>
    </div>
  );
}