// src/App.js
import React, { useState, useEffect } from 'react';
import './App.css';
import { shuffle } from './utils';
import { fetchAddressDataWithFallback } from './gcsUtils';
import sendReport from './emailService';
import StepForm from './components/StepForm';

const version = { major: 0, minor: 1, patch: 0 };

// Styles
const inputStyle = { width: '100%', maxWidth: '400px', fontSize: '18px', padding: '10px', marginBottom: '10px', boxSizing: 'border-box' };
const buttonStyle = { padding: '10px 20px', fontSize: '16px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '6px', marginTop: '10px' };
const titleStyle = {
  fontFamily: "'Roboto', sans-serif",
  fontWeight: 300,
  fontSize: '36px',
  marginBottom: '20px',
  color: '#222',
  textAlign: 'center',
  position: 'sticky',
  top: 0,
  backgroundColor: '#fff',
  padding: '10px',
  zIndex: 1000,
  borderBottom: '1px solid #ccc'
};
const radioLabelStyle = { display: 'inline-flex', alignItems: 'center', fontSize: '20px', padding: '10px 16px', backgroundColor: '#e8e8e8', borderRadius: '8px', border: '2px solid #ccc', cursor: 'pointer' };
const radioInputStyle = { width: '24px', height: '24px', marginRight: '12px', cursor: 'pointer' };

// ---- Data source URLs (single source of truth) ----
const PRIMARY_URL = 'https://storage.googleapis.com/pac20_oa_canvass/Runcorn%20and%20Helsby_E00062413.csv';
const FALLBACK_URL = '/sample_address_data.csv';

// Extract constituency name from a CSV URL or path
const extractConstituencyFromUrl = (url) => {
  if (!url) return 'OA';
  try {
    const tail = url.substring(url.lastIndexOf('/') + 1); // "Runcorn%20and%20Helsby_E00062413.csv"
    const uptoUnderscore = tail.split('_')[0];            // "Runcorn%20and%20Helsby"
    return decodeURIComponent(uptoUnderscore || 'OA');
  } catch {
    return 'OA';
  }
};

function App() {
  const [userId, setUserId] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [canvasserName, setCanvasserName] = useState('');
  const [addressData, setAddressData] = useState([]);
  const [visited, setVisited] = useState([]);
  const [formData, setFormData] = useState({});
  const [responses, setResponses] = useState([]);
  const [currentAddress, setCurrentAddress] = useState('');
  const [step, setStep] = useState(0);
  const [adminMode, setAdminMode] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(null);
  const [constituency, setConstituency] = useState('OA');

  // Send button UI state
  const [sendBtnLabel, setSendBtnLabel] = useState('Send Report to Demographikon');
  const [sending, setSending] = useState(false);

  // ---- helpers for CSV + filenames ----
  const toCell = (v) => (Array.isArray(v) ? v.join('; ') : (v ?? ''));
  const buildHeaders = (records) => {
    const keys = new Set();
    records.forEach((r) => Object.keys(r || {}).forEach((k) => keys.add(k)));
    const preferred = ['address','response','residents','party','support','likelihood','issue','notes','canvasser','timestamp','OA','postcode','ward'];
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
    const rows = [
      headers.join(','),
      ...records.map((r) => headers.map((h) => esc(toCell(r[h]))).join(','))
    ];
    return rows.join('\n');
  };
  const getOAFromDataset = () => {
    const first = addressData?.[0] || {};
    return first.OA || first.oa || first.output_area || first.OutputArea || 'OA';
  };
  const sanitizeFilename = (s) => (s || '').toString().replace(/[^\w\-]+/g, '-');

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
          { value: 'REF', label: 'Reform', color: 'teal' },
          { value: 'GRN', label: 'Green', color: 'green' },
          { value: 'OTH', label: 'Other', color: 'grey' },
          { value: 'NONE', label: 'None', color: 'black' }
        ]
      },
      { name: 'support', label: 'Support level', type: 'select', options: ['certain', 'strong', 'lean to', 'none'] },
      { name: 'likelihood', label: 'Likelihood of Voting', type: 'select', options: ['definitely', 'probably', 'unlikely', 'no'] },
      { name: 'issue', label: 'Most Important Issue', type: 'radio', options: shuffle(['Immigration', 'Economy', 'NHS', 'Housing', 'Net Zero']) },
      { name: 'notes', label: 'Notes', type: 'textarea' }
    ];
  }

  const saveResponse = (data, auto = false) => {
    const newEntry = { ...data, timestamp: new Date().toISOString(), canvasser: canvasserName };
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

  const handleLogin = () => {
    if (userId.trim()) {
      setCanvasserName(userId.trim());
      setLoggedIn(true);
    } else {
      alert('Please enter a user ID');
    }
  };

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
      const OA_code = extra.OA || extra.oa || extra.output_area || extra.OutputArea;
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
    console.log('CSV length:', csv.length);
    console.log('CSV preview:', csv.slice(0, 200));

    // --- Email details (Constituency / Canvasser / Start / End) ---
    const tsDates = (responses || [])
      .map((r) => (r?.timestamp || '').split('T')[0])
      .filter(Boolean);

    const todayStr = new Date().toISOString().split('T')[0];
    const startDate = tsDates.length ? [...tsDates].sort()[0] : todayStr;
    const endDate = tsDates.length ? [...tsDates].sort().slice(-1)[0] : todayStr;

    const parsedConstituency = extractConstituencyFromUrl(PRIMARY_URL);
    const constituencyName = constituency || parsedConstituency;

    const oaLabel = sanitizeFilename(getOAFromDataset());
    const canvasserSafe = sanitizeFilename(canvasserName || 'unknown');
    const fileName = `${oaLabel}_${canvasserSafe}_${todayStr}.csv`;

    const bodyText =
      `Constituency: ${constituencyName}\n` +
      `Canvasser: ${canvasserName}\n` +
      `Start date: ${startDate}\n` +
      `End date: ${endDate}`;

    // Button UX
    try {
      setSending(true);
      setSendBtnLabel('Sending…');

      await sendReport({
        subjectOverride: `Survey results ${constituencyName} ${todayStr}`,
        bodyText,
        attachments: [
          { filename: fileName, mimeType: 'text/csv', content: csv }
        ]
      });

      setSendBtnLabel('Report Sent ✅');
      alert(`✅ Report sent successfully! File: ${fileName}`);
    } catch (error) {
      console.error(error);
      setSendBtnLabel('Failed ❌');
      alert(`❌ Failed to send report: ${error.message}`);
    } finally {
      setSending(false);
      setTimeout(() => setSendBtnLabel('Send Report to Demographikon'), 3000);
    }
  };

  // ---- Single, correct useEffect ----
  useEffect(() => {
    // Restore saved responses
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

    // Set constituency from the primary URL (safe)
    try {
      setConstituency(extractConstituencyFromUrl(PRIMARY_URL));
    } catch (e) {
      // ignore
    }

    // Fetch address data (with fallback)
    setDataLoading(true);
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
  }, []);

  if (!loggedIn) {
    return (
      <div style={{ padding: 20 }}>
        <h1 style={titleStyle}>demographiKon</h1>
        <label>
          Enter User ID:<br />
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            style={inputStyle}
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
          />
        </label>
        <br /><br />
        <button onClick={handleLogin} style={buttonStyle}>Login</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h1 style={titleStyle}>demographiKon</h1>

{/* Only show address selector until one is chosen */}
{!currentAddress && (
  <label>Select Address:<br />
    {dataLoading ? (
      <div style={{...inputStyle, backgroundColor: '#f0f0f0'}}>📡 Loading address data...</div>
    ) : dataError ? (
      <div style={{...inputStyle, backgroundColor: '#ffe6e6', color: '#d00'}}>❌ {dataError}</div>
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
          .filter(entry => !visited.includes(entry.address))
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
              <label style={{
                ...radioLabelStyle,
                backgroundColor: formData.response === 'Response' ? '#007bff' : '#e8e8e8',
                color: formData.response === 'Response' ? '#fff' : '#000',
                margin: '0',
                display: 'flex',
                width: '100%'
              }}>
                <input
                  type="radio"
                  name="response"
                  value="Response"
                  checked={formData.response === 'Response'}
                  onChange={() => setFormData({ ...formData, response: 'Response' })}
                  style={radioInputStyle}
                />
                Response
              </label>

              <label style={{
                ...radioLabelStyle,
                backgroundColor: formData.response === 'No Response' ? '#6c757d' : '#e8e8e8',
                color: formData.response === 'No Response' ? '#fff' : '#000',
                margin: '0',
                display: 'flex',
                width: '100%'
              }}>
                <input
                  type="radio"
                  name="response"
                  value="No Response"
                  checked={formData.response === 'No Response'}
                  onChange={() => {
                    const updated = { ...formData, response: 'No Response' };
                    // Save immediately and reset; do NOT auto-select next address
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

      <div style={{ marginTop: 30 }}>
        <button onClick={() => setAdminMode(!adminMode)} style={buttonStyle}>Admin</button>
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
    </div>
  );
}

export default App;