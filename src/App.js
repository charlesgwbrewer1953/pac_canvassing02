import React, { useEffect, useRef, useState } from "react";
import "./App.css";

import ResponseSelector from "./components/ResponseSelector";
import StepForm from "./components/StepForm";
import AddressSelector from "./components/AddressSelector";

const API_BASE = process.env.REACT_APP_API_BASE;

// -------- URL token helper (hash router) --------
function getTokenFromUrl() {
  const hash = window.location.hash || "";
  const params = new URLSearchParams(hash.split("?")[1]);
  return params.get("token");
}

// -------- JWT payload decode (NO signature verification; for client-side checks only) --------
function decodeJwtPayload(token) {
  try {
    const payloadB64 = token.split(".")[1];
    const json = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// -------- minimal CSV parser (handles quotes reasonably) --------
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];

  const parseLine = (line) => {
    const out = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        out.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  };

  const headers = parseLine(lines[0]).map((h) => h.trim());
  const rows = [];

  for (const line of lines.slice(1)) {
    const vals = parseLine(line);
    const row = {};
    headers.forEach((h, i) => (row[h] = (vals[i] ?? "").trim()));
    rows.push(row);
  }
  return rows;
}

// -------- validate CSV belongs to this token scope (tenant quarantine) --------
function validateAddressFile({ tokenOa, fileName, rows }) {
  if (!tokenOa) return { ok: false, reason: "Token is missing OA scope" };

  // A) If CSV has an oa column, enforce exact match for all rows
  const hasOaColumn = rows.length > 0 && Object.keys(rows[0]).some((k) => k.toLowerCase() === "oa");
  if (hasOaColumn) {
    const bad = rows.find((r) => String(r.oa || r.OA || r.Oa || "").trim() !== tokenOa);
    if (bad) return { ok: false, reason: `CSV OA does not match token OA (${tokenOa})` };
    return { ok: true };
  }

  // B) Otherwise, enforce filename contains the OA (common operational practice)
  if (fileName && fileName.includes(tokenOa)) return { ok: true };

  return {
    ok: false,
    reason: `Cannot verify CSV belongs to OA ${tokenOa}. Add an 'oa' column or include OA in filename.`,
  };
}

// -------- localStorage queue --------
const QUEUE_KEY = "canvass_queue_v1";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [session, setSession] = useState(null);
  const [enums, setEnums] = useState(null);

  // address list from CSV attachment
  const [addresses, setAddresses] = useState([]);
  const [addressFileName, setAddressFileName] = useState("");

  // flow state
  const [currentAddress, setCurrentAddress] = useState(null);
  const [response, setResponse] = useState(null);

  // survey draft fields
  const [party, setParty] = useState(null);
  const [support, setSupport] = useState(null);
  const [likelihood, setLikelihood] = useState(null);
  const [issue, setIssue] = useState(null);
  const [notes, setNotes] = useState("");

  // offline queue: [{ client_record_id, address, response, ... , db_sent_at, db_last_error, db_attempts }]
  const [queue, setQueue] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }, [queue]);

  // retry loop
  const [sending, setSending] = useState(false);
  const retryTimerRef = useRef(null);

  // bootstrap: token -> session -> enums
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
        if (!res.ok) throw new Error("Failed to start canvass session");
        const sessionData = await res.json();
        setSession(sessionData);

        const metaRes = await fetch(`${API_BASE}/canvass/metadata`, {
          headers: { Authorization: `Bearer ${sessionData.session_token}` },
        });
        if (!metaRes.ok) throw new Error("Failed to load metadata");
        setEnums(await metaRes.json());

        setLoading(false);
      } catch (e) {
        setError(e.message);
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

  function finalizeRecord() {
    if (!currentAddress || !response) return;

    const record = {
      client_record_id: crypto.randomUUID(), // REQUIRED by backend
      address: currentAddress,
      response,
      party,
      support,
      likelihood,
      issue,
      notes,
      created_at: new Date().toISOString(),

      // delivery tracking
      db_attempts: 0,
      db_last_error: null,
      db_sent_at: null,
    };

    setQueue((q) => [...q, record]);
    resetDraft();
    setCurrentAddress(null);
  }

  async function trySendToDbOnce() {
    if (!session?.session_token) return;

    // send only unsent
    const unsent = queue.filter((r) => !r.db_sent_at);
    if (!unsent.length) return;

    for (const rec of unsent) {
      try {
        const res = await fetch(`${API_BASE}/canvass/canvass-records`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session_token}`,
          },
          body: JSON.stringify({
            client_record_id: rec.client_record_id,
            address: rec.address,
            response: rec.response,
            party: rec.party,
            support: rec.support,
            likelihood: rec.likelihood,
            issue: rec.issue,
            notes: rec.notes,
          }),
        });

        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`${res.status} ${txt || "DB insert failed"}`);
        }

        // mark sent
        setQueue((q) =>
          q.map((r) =>
            r.client_record_id === rec.client_record_id
              ? {
                  ...r,
                  db_sent_at: new Date().toISOString(),
                  db_last_error: null,
                  db_attempts: (r.db_attempts || 0) + 1,
                }
              : r
          )
        );
      } catch (e) {
        // keep it queued; record error + attempts
        setQueue((q) =>
          q.map((r) =>
            r.client_record_id === rec.client_record_id
              ? {
                  ...r,
                  db_last_error: String(e.message || e),
                  db_attempts: (r.db_attempts || 0) + 1,
                }
              : r
          )
        );
      }
    }
  }

  function startRetryLoop() {
    // retry every 30 seconds while Admin screen is active (and app open)
    if (retryTimerRef.current) return;
    retryTimerRef.current = setInterval(() => {
      trySendToDbOnce();
      // email retry would be called here too, once wired
    }, 30_000);
  }

  function stopRetryLoop() {
    if (retryTimerRef.current) {
      clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }

  async function sendNow() {
    setSending(true);
    await trySendToDbOnce();
    setSending(false);
  }

  // -------- render guards --------
  if (loading) return <div>Loading…</div>;
  if (error) return <div style={{ color: "red", padding: 16 }}>❌ {error}</div>;
  if (!session || !enums) return null;

  const token = getTokenFromUrl();
  const jwt = decodeJwtPayload(token);
  const tokenOa = jwt?.oa || session?.scope?.oa; // prefer JWT claim, fallback to session scope

  const unsentCount = queue.filter((r) => !r.db_sent_at).length;

  return (
    <div className="App" style={{ fontFamily: "Roboto, sans-serif" }}>
      <h1>demographiKon</h1>

      <div style={{ marginBottom: 12 }}>
        <strong>OA:</strong> {session.scope?.oa}
      </div>

      {/* 1) CSV LOAD SCREEN (must be explicit; browser security) */}
      {addresses.length === 0 && (
        <div style={{ border: "1px solid #ddd", padding: 14, borderRadius: 8 }}>
          <h3 style={{ marginTop: 0 }}>Load address list</h3>
          <p style={{ marginTop: 0 }}>
            Choose the <strong>CSV attachment</strong> from the email for OA <strong>{tokenOa}</strong>.
          </p>

          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;

              const text = await file.text();
              const rows = parseCsv(text);

              if (!rows.length) {
                alert("CSV appears empty.");
                return;
              }

              const validation = validateAddressFile({
                tokenOa,
                fileName: file.name,
                rows,
              });

              if (!validation.ok) {
                alert(validation.reason);
                return;
              }

              setAddressFileName(file.name);

              // Convert rows -> addresses list
              // Prefer 'address' column, else use the whole row object
              const hasAddressCol = Object.keys(rows[0]).some((k) => k.toLowerCase() === "address");
              const addrList = hasAddressCol
                ? rows.map((r) => r.address || r.Address || r.ADDRESS).filter(Boolean)
                : rows;

              setAddresses(addrList);
            }}
          />

          {addressFileName && (
            <div style={{ marginTop: 10, opacity: 0.7 }}>
              Loaded: <strong>{addressFileName}</strong>
            </div>
          )}
        </div>
      )}

      {/* 2) Address selection */}
      {addresses.length > 0 && !currentAddress && (
        <AddressSelector
          addresses={addresses}
          onSelect={(addr) => {
            resetDraft();
            setCurrentAddress(addr);
          }}
        />
      )}

      {/* 3) Response selection */}
      {currentAddress && response === null && (
        <ResponseSelector options={enums.response} value={response} onResponse={setResponse} />
      )}

      {/* 4) Terminal response -> finalize immediately */}
      {currentAddress && response && response !== "response" && (
        <div style={{ marginTop: 14 }}>
          <p>
            Terminal outcome: <strong>{response}</strong>
          </p>
          <button onClick={finalizeRecord}>Save & return to list</button>
        </div>
      )}

      {/* 5) Survey wizard (sequential screens) */}
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
          onDone={finalizeRecord}
        />
      )}

      {/* 6) Admin send */}
      {addresses.length > 0 && (
        <>
          <hr style={{ margin: "24px 0" }} />
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={async () => {
                startRetryLoop();
                await sendNow();
              }}
              disabled={sending || unsentCount === 0}
            >
              {sending ? "Sending…" : `Admin: Send to DB (${unsentCount} unsent)`}
            </button>

            <button onClick={stopRetryLoop} disabled={!retryTimerRef.current}>
              Stop retry
            </button>

            <span style={{ opacity: 0.7 }}>
              Total stored: {queue.length} | Sent: {queue.length - unsentCount}
            </span>
          </div>

          {unsentCount > 0 && (
            <div style={{ marginTop: 10, opacity: 0.75 }}>
              If sending fails (e.g. poor reception), the app will retry every 30 seconds while this page is open.
            </div>
          )}
        </>
      )}
    </div>
  );
}