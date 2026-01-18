// src/App.js
import React, { useState, useEffect, useMemo } from 'react';
import './App.css';
import { shuffle } from './utils';
import { fetchAddressDataWithFallback, parseAddressCsv } from './gcsUtils';
import sendReport from './emailService';
import StepForm from './components/StepForm';

/* -------------------- Styles -------------------- */
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
  backgroundColor: '#f0f0f0',
  padding: '10px',
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
const radioInputStyle = { width: '36px', height: '36px', marginRight: '14px' };

/* -------------------- Config -------------------- */
const API_BASE =
  process.env.REACT_APP_API_BASE || 'https://api.demographikon.org';

const GCS_PREFIX =
  process.env.REACT_APP_GCS_PREFIX ||
  'https://storage.googleapis.com/pac20_oa_canvass';

const FALLBACK_URL = '/sample_address_data.csv';

const ISSUE_OPTIONS = [
  'Immigration',
  'Economy',
  'NHS',
  'Housing',
  'Net Zero'
];

/* -------------------- Helpers -------------------- */
const getQueryParam = (name) => {
  const fromSearch = new URLSearchParams(window.location.search).get(name);
  if (fromSearch) return fromSearch;

  const hash = window.location.hash || '';
  const q = hash.indexOf('?');
  if (q >= 0) {
    return new URLSearchParams(hash.substring(q + 1)).get(name);
  }
  return null;
};

async function sendCanvassRecord({ sessionToken, payload }) {
  try {
    const resp = await fetch(`${API_BASE}/canvass/canvass-records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      console.error('Canvass DB write failed:', resp.status);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Canvass DB write error:', e);
    return false;
  }
}

/* -------------------- App -------------------- */
function App() {
  /* ---- bootstrap ---- */
  const [bootstrapping, setBootstrapping] = useState(true);
  const [bootstrapError, setBootstrapError] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  const [user, setUser] = useState(null);
  const [oa, setOA] = useState(null);

  /* ---- canvass state ---- */
  const [canvasserName, setCanvasserName] = useState('');
  const [addressData, setAddressData] = useState([]);
  const [visited, setVisited] = useState([]);
  const [formData, setFormData] = useState({});
  const [responses, setResponses] = useState([]);
  const [currentAddress, setCurrentAddress] = useState('');
  const [step, setStep] = useState(0);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(null);
  const [issuesOrder, setIssuesOrder] = useState(ISSUE_OPTIONS);

  const isAdmin = useMemo(
    () => user?.role === 'admin' || user?.role === 'sysadmin',
    [user]
  );

  /* -------------------- Bootstrap -------------------- */
  useEffect(() => {
    async function bootstrap() {
      try {
        const token = getQueryParam('token');
        if (!token) throw new Error('Missing canvass token');

        const resp = await fetch(`${API_BASE}/canvass/canvass-session`, {
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
        setCanvasserName(data.user?.name || data.user?.id || 'canvasser');
      } catch (e) {
        console.error(e);
        setBootstrapError(e.message);
      } finally {
        setBootstrapping(false);
      }
    }
    bootstrap();
  }, []);

  /* -------------------- Load CSV -------------------- */
  useEffect(() => {
    if (bootstrapping || bootstrapError || !oa) return;

    const url = `${GCS_PREFIX}/OA_${oa}.csv`;
    setDataLoading(true);

    fetchAddressDataWithFallback(url, FALLBACK_URL)
      .then(setAddressData)
      .catch((e) => setDataError(e.message))
      .finally(() => setDataLoading(false));
  }, [bootstrapping, bootstrapError, oa]);

  /* -------------------- Steps -------------------- */
  const startNewPass = () => {
    setIssuesOrder(shuffle([...ISSUE_OPTIONS]));
    setStep(0);
  };

  const getFormSteps = () => {
    const selected = addressData.find((a) => a.address === formData.address);
    const residents = selected?.residents || [];

    return [
      { name: 'residents', type: 'checkbox', options: residents },
      { name: 'party', type: 'radio', options: ['CON', 'LAB', 'LIBDEM', 'REF', 'GRN', 'OTH'] },
      { name: 'support', type: 'radio', options: ['certain', 'strong', 'lean', 'none'] },
      { name: 'likelihood', type: 'radio', options: ['definitely', 'probably', 'unlikely', 'no'] },
      { name: 'issue', type: 'radio', options: issuesOrder },
      { name: 'notes', type: 'textarea' }
    ];
  };

  /* -------------------- Save response -------------------- */
  const saveResponse = (data, auto = false) => {
    const entry = {
      ...data,
      timestamp: new Date().toISOString(),
      canvasser: canvasserName,
      OA: oa
    };

    const newResponses = [
      ...responses.filter((r) => r.address !== data.address),
      entry
    ];

    setResponses(newResponses);
    setVisited([...new Set([...visited, data.address])]);
    localStorage.setItem('canvassData', JSON.stringify(newResponses));

    if (sessionToken) {
      sendCanvassRecord({
        sessionToken,
        payload: {
          client_record_id: crypto.randomUUID(),
          ...entry
        }
      });
    }

    const steps = getFormSteps();
    if (auto || step === steps.length - 1) {
      setStep(0);
      setFormData({});
      setCurrentAddress('');
    } else {
      setStep(step + 1);
    }
  };

  /* -------------------- Render guards -------------------- */
  if (bootstrapping) return <div>🔐 Starting canvass session…</div>;

  if (bootstrapError)
    return (
      <div style={{ color: 'red' }}>
        ❌ Cannot start canvassing: {bootstrapError}
      </div>
    );

  /* -------------------- UI -------------------- */
  return (
    <div style={{ padding: 20 }}>
      <h1 style={titleStyle}>demographiKon</h1>

      <div><strong>User:</strong> {user?.id}</div>
      <div><strong>OA:</strong> {oa}</div>

      {!currentAddress && (
        <select
          value=""
          onChange={(e) => {
            setCurrentAddress(e.target.value);
            setFormData({ address: e.target.value });
          }}
          style={inputStyle}
        >
          <option value="">-- Choose an address --</option>
          {addressData
            .filter((a) => !visited.includes(a.address))
            .map((a, i) => (
              <option key={i} value={a.address}>{a.address}</option>
            ))}
        </select>
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

      {isAdmin && (
        <button style={buttonStyle} onClick={() => sendReport()}>
          Send Report
        </button>
      )}
    </div>
  );
}

export default App;