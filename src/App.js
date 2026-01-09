// src/App.js
import React, { useState, useEffect, useMemo } from 'react';
import './App.css';
import { shuffle } from './utils';
import { fetchAddressDataWithFallback, parseAddressCsv } from './gcsUtils';
import sendReport from './emailService';
import StepForm from './components/StepForm';

// -------------------- Styles --------------------
const inputStyle = {
  width: '100%',
  maxWidth: '400px',
  fontSize: '18px',
  padding: '10px',
  marginBottom: '10px',
  boxSizing: 'border-box'
};
const buttonStyle = {
  padding: '10px 20px',
  fontSize: '16px',
  backgroundColor: '#007bff',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  marginTop: '10px'
};
const titleStyle = {
  fontFamily: "'Roboto', sans-serif",
  fontWeight: 300,
  fontSize: '36px',
  marginBottom: '20px',
  color: '#222',
  textAlign: 'center',
  top: 0,
  backgroundColor: '#f0f0f0',
  padding: '10px',
  zIndex: 1000,
  borderBottom: '1px solid #ccc'
};
const radioLabelStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: '20px',
  padding: '12px 18px',
  backgroundColor: '#e8e8e8',
  borderRadius: '8px',
  border: '2px solid #ccc',
  cursor: 'pointer'
};
const radioInputStyle = { width: '36px', height: '36px', marginRight: '14px', cursor: 'pointer' };

// -------------------- Config --------------------
// API base for Express. Set in Netlify env as REACT_APP_API_BASE, e.g. https://api.yourdomain.org
const API_BASE = process.env.REACT_APP_API_BASE || 'https://api.demographikon.org';

// GCS CSV naming convention. Set REACT_APP_GCS_PREFIX if you want a different bucket/prefix.
// Default assumes files like: https://storage.googleapis.com/pac20_oa_canvass/OA_E00181357.csv
const GCS_PREFIX =
  process.env.REACT_APP_GCS_PREFIX || 'https://storage.googleapis.com/pac20_oa_canvass';

// Local fallback CSV bundled with the site
const FALLBACK_URL = '/sample_address_data.csv';

// Admin report recipient (emailService uses this internally; left as-is)
const ADMIN_EMAIL = 'demographikon.dev.01@gmail.com';

// Issues
const ISSUE_OPTIONS = ['Immigration', 'Economy', 'NHS', 'Housing', 'Net Zero'];

// -------------------- Helpers --------------------
const extractConstituencyFromUrl = (url) => {
  if (!url) return 'OA';
  try {
    const tail = url.substring(url.lastIndexOf('/') + 1);
    const uptoUnderscore = tail.split('_')[0];
    return decodeURIComponent(uptoUnderscore || 'OA');
  } catch {
    return 'OA';
  }
};

// Extract OA code from a CSV URL if present (supports "..._E00000000.csv" and "OA_E00000000.csv")
const extractOAFromUrl = (url) => {
  if (!url) return 'UnknownOA';
  try {
    const tail = url.substring(url.lastIndexOf('/') + 1); // e.g. "OA_E00181357.csv"
    const base = tail.replace('.csv', '');
    const parts = base.split('_');
    // If format is <Constituency>_<OA> or OA_<OA>, OA is the last part
    return parts.length > 1 ? parts[parts.length - 1] : 'UnknownOA';
  } catch {
    return 'UnknownOA';
  }
};

// Read query param from either normal querystring or hash querystring (for Netlify hash routing)
const getQueryParam = (name) => {
  const search = window.location.search || '';
  const fromSearch = new URLSearchParams(search).get(name);
  if (fromSearch) return fromSearch;

  // Support URLs like: https://site/#/start?token=...
  const hash = window.location.hash || '';
  const qIndex = hash.indexOf('?');
  if (qIndex >= 0) {
    const hashQuery = hash.substring(qIndex + 1);
    return new URLSearchParams(hashQuery).get(name);
  }
  return null;
};

// CSV helpers
const toCell = (v) => (Array.isArray(v) ? v.join('; ') : (v ?? ''));
const buildHeaders = (records) => {
  const keys = new Set();
  records.forEach((r) => Object.keys(r || {}).forEach((k) => keys.add(k)));
  const preferred = [
    'address',
    'response',
    'residents',
    'party',
    'support',
    'likelihood',
    'issue',
    'notes',
    'canvasser',
    'timestamp',
    'OA',
    'postcode',
    'ward'
  ];
  const rest = [...keys].filter((k) => !preferred.includes(k)).sort();
  return [...preferred.filter((k) => keys.has(k)), ...rest];
};
const toCSV = (records) => {
  if (!records || records.length === 0) return '';
  const headers = buildHeaders(records);
  const esc = (s) => {
    const str = String(s ?? '');
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const rows = [headers.join(','), ...records.map((r) => headers.map((h) => esc(toCell(r[h]))).join(','))];
  return rows.join('\n');
};
const sanitizeFilename = (s) => (s || '').toString().replace(/[^\w-]+/g, '-');

function App() {
  // -------------------- Session bootstrap state --------------------
  const [bootstrapping, setBootstrapping] = useState(true);
  const [bootstrapError, setBootstrapError] = useState(null);

  // From /canvass-session
  const [sessionToken, setSessionToken] = useState(null);
  const [user, setUser] = useState(null); // { id, role, tenant_id }
  const [oa, setOA] = useState(null);

  // -------------------- Existing app state --------------------
  const [canvasserName, setCanvasserName] = useState('');

  const [addressData, setAddressData] = useState([]);
  const [visited, setVisited] = useState([]);
  const [formData, setFormData] = useState({});
  const [responses, setResponses] = useState([]);
  const [currentAddress, setCurrentAddress] = useState('');

  const [step, setStep] = useState(0);

  // Admin UI state (only shown to admins/sysadmin)
  const [adminMode, setAdminMode] = useState(false);

  // Data loading
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(null);

  // Constituency label (purely display)
  const [constituency, setConstituency] = useState('OA');

  // Source reference (loaded CSV path)
  const [sourceRef, setSourceRef] = useState(null);

  // Issues order for shuffle-per-pass
  const [issuesOrder, setIssuesOrder] = useState(ISSUE_OPTIONS);

  // Send button UI state
  const [sendBtnLabel, setSendBtnLabel] = useState('Send Report to Demographikon');
  const [sending, setSending] = useState(false);

  const isAdmin = useMemo(() => {
    const r = user?.role;
    return r === 'admin' || r === 'sysadmin';
  }, [user]);

  // -------------------- Bootstrap: exchange token for session --------------------
  useEffect(() => {
    async function bootstrap() {
      try {
        const token = getQueryParam('token');

        if (!token) {
          throw new Error('Missing canvass token in URL (token=...)');
        }

        const resp = await fetch(`${API_BASE}/canvass-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });

        if (!resp.ok) {
          throw new Error(`Session bootstrap failed (${resp.status})`);
        }

        const data = await resp.json();

        setSessionToken(data.session_token);
        setUser(data.user);
        setOA(data.scope?.oa || null);

        // Prefer a friendly name if you later add it; today we only have users.id.
        setCanvasserName(data.user?.name || data.user?.id || 'canvasser');

      } catch (err) {
        console.error(err);
        setBootstrapError(err.message || 'Bootstrap failed');
      } finally {
        setBootstrapping(false);
      }
    }

    bootstrap();
  }, []);

  // -------------------- Restore saved responses + load address CSV for OA --------------------
  useEffect(() => {
    // Restore saved responses (local only)
    const savedData = localStorage.getItem('canvassData');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setResponses(parsed);
        setVisited(parsed.map((r) => r.address));
      } catch (e) {
        console.error('Error loading saved data:', e);
      }
    }
  }, []);

  // Load CSV once OA is known
  useEffect(() => {
    if (bootstrapping) return;
    if (bootstrapError) return;
    if (!oa) {
      setDataLoading(false);
      setDataError('No OA scope returned from /canvass-session');
      return;
    }

    // Build OA-based CSV URL
    // Default naming: OA_<OA>.csv in bucket/prefix
    const PRIMARY_URL = `${GCS_PREFIX}/OA_${encodeURIComponent(oa)}.csv`;

    setSourceRef(PRIMARY_URL);
    setConstituency(`OA ${oa}`);

    setDataLoading(true);
    setDataError(null);

    // Support legacy ?object= override (useful for testing), but only if present.
    // This does NOT change OA authority (still derived from /canvass-session).
    const object = getQueryParam('object');
    if (object) {
      const decoded = decodeURIComponent(object);
      console.log('Loading CSV from Netlify proxy:', decoded);

      setSourceRef(decoded);
      setConstituency(extractConstituencyFromUrl(decoded) || `OA ${oa}`);

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
          console.error('Proxy fetch error:', err);
          setDataError(err.message);
        })
        .finally(() => {
          setDataLoading(false);
        });
    } else {
      fetchAddressDataWithFallback(PRIMARY_URL, FALLBACK_URL)
        .then((data) => {
          setAddressData(data);
        })
        .catch((err) => {
          setDataError(err.message);
        })
        .finally(() => {
          setDataLoading(false);
        });
    }
  }, [bootstrapping, bootstrapError, oa]);

  // -------------------- Per-pass helpers --------------------
  const startNewPass = () => {
    setIssuesOrder(shuffle([...ISSUE_OPTIONS]));
    setStep(0);
  };

  function getFormSteps() {
    const selected = addressData.find((a) => a.address === formData.address);
    const residents = selected?.residents || [];
    return [
      { name: 'residents', label: 'Who was spoken to?', type: 'checkbox', options: residents },
      {
        name: 'party',
        label: 'Party Preference',
        type: 'radio',
        options: [
          { value: 'CON', label: 'Conservative', color: 'blue' },
          { value: 'LAB', label: 'Labour', color: 'red' },
          { value: 'LIBDEM', label: 'Liberal Democrat', color: 'darkorange' },
          { value: 'REF', label: 'Reform', color: '#4FAED6' },
          { value: 'GRN', label: 'Green', color: 'green' },
          { value: 'OTH', label: 'Other', color: 'grey' },
          { value: 'NONE', label: 'None', color: 'black' }
        ]
      },
      { name: 'support', label: 'Support level', type: 'radio', options: ['certain', 'strong', 'lean to', 'none'] },
      { name: 'likelihood', label: 'Likelihood of Voting', type: 'radio', options: ['definitely', 'probably', 'unlikely', 'no'] },
      { name: 'issue', label: 'Most Important Issue', type: 'radio', options: issuesOrder },
      { name: 'notes', label: 'Notes', type: 'textarea' }
    ];
  }

  const saveResponse = (data, auto = false) => {
    const newEntry = { ...data, timestamp: new Date().toISOString(), canvasser: canvasserName, OA: oa };
    const filteredResponses = responses.filter((r) => r.address !== data.address);
    const newResponses = [...filteredResponses, newEntry];
    const newVisited = [...new Set([...visited, data.address])];

    setResponses(newResponses);
    setVisited(newVisited);
    localStorage.setItem('canvassData', JSON.stringify(newResponses));

    const steps = getFormSteps();
    if (auto || step === steps.length - 1) {
      setStep(0);
      setFormData({});
      setCurrentAddress('');
    } else {
      setStep(step + 1);
    }
  };

  // Go to top / Address selection
  const goToAddressSelection = () => {
    setCurrentAddress('');
    setFormData({});
    setStep(0);
  };

  const goToPreviousStep = () => {
    if (formData.response && step > 0) {
      setStep(step - 1);
    } else if (formData.response && step === 0) {
      setFormData({ address: currentAddress });
    } else if (!formData.response) {
      goToAddressSelection();
    }
  };

  // -------------------- Admin report sender (unchanged behaviour; UI gated by role) --------------------
  const sendResults = async () => {
    // Merge responses per address
    const mergedByAddress = responses.reduce((acc, curr) => {
      const existing = acc[curr.address];
      if (!existing) {
        acc[curr.address] = { ...curr };
      } else {
        if (new Date(curr.timestamp) > new Date(existing.timestamp)) {
          existing.timestamp = curr.timestamp;
        }
        Object.keys(curr).forEach((key) => {
          if (key === 'timestamp' || key === 'address') return;
          const currentVal = curr[key];
          const existingVal = existing[key];
          if (Array.isArray(currentVal)) {
            existing[key] = Array.from(new Set([...(existingVal || []), ...currentVal]));
          } else if (typeof currentVal === 'string' && currentVal.trim() !== '') {
            if (!existingVal) {
              existing[key] = currentVal;
            } else if (!String(existingVal).includes(currentVal)) {
              existing[key] = `${existingVal}; ${currentVal}`;
            }
          } else if (currentVal !== undefined) {
            existing[key] = currentVal;
          }
        });
      }
      return acc;
    }, {});
    const mergedResponses = Object.values(mergedByAddress);

    // Enrich from addressData (OA/postcode/ward if present)
    const byAddr = new Map(addressData.map((row) => [row.address, row]));
    const enriched = mergedResponses.map((r) => {
      const extra = byAddr.get(r.address) || {};
      const OA_code = extra.OA || extra.oa || extra.output_area || extra.OutputArea || oa;
      const { postcode, ward } = extra;
      return {
        ...r,
        ...(OA_code ? { OA: OA_code } : {}),
        ...(postcode ? { postcode } : {}),
        ...(ward ? { ward } : {})
      };
    });

    // Flatten → CSV
    const csv = toCSV(enriched);

    const tsDates = (responses || [])
      .map((r) => (r?.timestamp || '').split('T')[0])
      .filter(Boolean);

    const todayStr = new Date().toISOString().split('T')[0];
    const startDate = tsDates.length ? [...tsDates].sort()[0] : todayStr;
    const endDate = tsDates.length ? [...tsDates].sort().slice(-1)[0] : todayStr;

    const parsedConstituency = extractConstituencyFromUrl(sourceRef);
    const constituencyName = constituency || parsedConstituency || `OA ${oa}`;

    const constituencySafe = sanitizeFilename(constituencyName || 'Constituency');
    const oaLabel = sanitizeFilename(oa || extractOAFromUrl(sourceRef));
    const canvasserSafe = sanitizeFilename(canvasserName || 'unknown');

    const fileName = `${constituencySafe}_OA${oaLabel}_${canvasserSafe}_${todayStr}.csv`;

    const bodyText =
      `Constituency: ${constituencyName}\n` +
      `OA: ${oa || 'unknown'}\n` +
      `Canvasser: ${canvasserName}\n` +
      `Start date: ${startDate}\n` +
      `End date: ${endDate}`;

    try {
      setSending(true);
      setSendBtnLabel('Sending…');

      await sendReport({
        subjectOverride: `Survey results ${constituencyName} ${todayStr}`,
        bodyText,
        attachments: [{ filename: fileName, mimeType: 'text/csv', content: csv }]
      });

      setSendBtnLabel('Report Sent ✅');
      alert(`✅ Report sent successfully to ${ADMIN_EMAIL}! File: ${fileName}`);
    } catch (error) {
      console.error(error);
      setSendBtnLabel('Failed ❌');
      alert(`❌ Failed to send report: ${error.message}`);
    } finally {
      setSending(false);
      setTimeout(() => setSendBtnLabel('Send Report to Demographikon'), 3000);
    }
  };

  // -------------------- Render guards --------------------
  if (bootstrapping) {
    return (
      <div style={{ padding: 20, backgroundColor: '#f0f0f0', minHeight: '100vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={titleStyle}>demographiKon</h1>
          <span style={{ fontStyle: 'italic', fontSize: '10pt', color: '#b3b3b3' }}>Version 2.0.0</span>
        </div>
        <div style={{ ...inputStyle, backgroundColor: '#f0f0f0' }}>🔐 Starting canvass session…</div>
      </div>
    );
  }

  if (bootstrapError) {
    return (
      <div style={{ padding: 20, backgroundColor: '#f0f0f0', minHeight: '100vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={titleStyle}>demographiKon</h1>
          <span style={{ fontStyle: 'italic', fontSize: '10pt', color: '#b3b3b3' }}>Version 2.0.0</span>
        </div>
        <div style={{ ...inputStyle, backgroundColor: '#ffe6e6', color: '#d00' }}>
          ❌ Cannot start canvassing: {bootstrapError}
        </div>
        <div style={{ marginTop: 10, fontSize: 14, color: '#666' }}>
          This app requires a signed token in the link you received by email.
        </div>
      </div>
    );
  }

  // -------------------- Main UI --------------------
  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={titleStyle}>demographiKon</h1>
        <span style={{ fontStyle: 'italic', fontSize: '10pt', color: '#b3b3b3' }}>Version 2.0.0</span>
      </div>

      <div style={{ marginBottom: 12, fontSize: 14, color: '#666' }}>
        <div><strong>User:</strong> {user?.id} ({user?.role})</div>
        <div><strong>OA:</strong> {oa || 'unknown'}</div>
      </div>

      {/* Only show address selector until one is chosen */}
      {!currentAddress && (
        <label>
          Select Address:<br />
          {dataLoading ? (
            <div style={{ ...inputStyle, backgroundColor: '#f0f0f0' }}>📡 Loading address data...</div>
          ) : dataError ? (
            <div style={{ ...inputStyle, backgroundColor: '#ffe6e6', color: '#d00' }}>❌ {dataError}</div>
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
        <>
          {/* Response/No Response section (hidden once a choice is made) */}
          <div style={{ marginBottom: '20px' }}>
            <h3>Response</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label
                style={{
                  ...radioLabelStyle,
                  backgroundColor: formData.response === 'Response' ? '#007bff' : '#e8e8e8',
                  color: formData.response === 'Response' ? '#fff' : '#000',
                  margin: '0',
                  display: 'flex',
                  width: '100%'
                }}
              >
                <input
                  type="radio"
                  name="response"
                  value="Response"
                  checked={formData.response === 'Response'}
                  onChange={() => {
                    startNewPass();
                    setFormData({ ...formData, response: 'Response' });
                  }}
                  style={radioInputStyle}
                />
                Response
              </label>

              <label
                style={{
                  ...radioLabelStyle,
                  backgroundColor: formData.response === 'No Response' ? '#6c757d' : '#e8e8e8',
                  color: formData.response === 'No Response' ? '#fff' : '#000',
                  margin: '0',
                  display: 'flex',
                  width: '100%'
                }}
              >
                <input
                  type="radio"
                  name="response"
                  value="No Response"
                  checked={formData.response === 'No Response'}
                  onChange={() => {
                    const updated = { ...formData, response: 'No Response' };
                    saveResponse({ address: updated.address, response: 'No Response' }, true);
                  }}
                  style={radioInputStyle}
                />
                No Response
              </label>
            </div>
          </div>
        </>
      )}

      {formData.response === 'Response' && (
        <StepForm
          step={step}
          formData={formData}
          setFormData={setFormData}
          stepConfig={getFormSteps()[step]}
          onNext={() => saveResponse(formData)}
        />
      )}

      <div style={{ marginTop: 20, display: 'flex', gap: '10px' }}>
        <button onClick={goToPreviousStep} style={buttonStyle}>
          ⬅ Previous
        </button>

        <button onClick={goToAddressSelection} style={{ ...buttonStyle, backgroundColor: '#6c757d' }}>
          ↩ Address Selection
        </button>
      </div>

      {/* Admin controls (role-gated) */}
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
                  backgroundColor: sending ? '#888' : 'green',
                  cursor: sending ? 'not-allowed' : 'pointer'
                }}
                disabled={sending}
              >
                {sendBtnLabel}
              </button>

              <div style={{ marginTop: 10, fontSize: '14px', color: '#666' }}>
                📊 Responses: {responses.length}
              </div>
            </div>
          )}
        </div>
      )}

      {/* (Optional) Debug info */}
      <div style={{ marginTop: 30, fontSize: 12, color: '#999' }}>
        <div>Source: {sourceRef || 'n/a'}</div>
        <div>Session token: {sessionToken ? '✅ present' : '❌ missing'}</div>
      </div>
    </div>
  );
}

export default App;