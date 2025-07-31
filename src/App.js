import React, { useState, useEffect } from 'react';
import StepForm from './StepForm';
import { shuffle, generateCSVAndJSON } from './utils';
import { fetchAddressDataWithFallback } from './gcsUtils';

// Version info
const version = { major: 0, minor: 1, patch: 0 };

// Styles (keep existing styles...)
const inputStyle = {
  width: '40ch',
  fontSize: '18px',
  padding: '10px',
  marginBottom: '10px'
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
  position: 'sticky',
  top: 0,
  backgroundColor: '#fff',
  padding: '10px',
  zIndex: 1000,
  borderBottom: '1px solid #ccc'
};

const radioLabelStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: '20px',
  padding: '10px 16px',
  backgroundColor: '#e8e8e8',
  borderRadius: '8px',
  border: '2px solid #ccc',
  cursor: 'pointer'
};

const radioInputStyle = {
  width: '24px',
  height: '24px',
  marginRight: '12px',
  cursor: 'pointer'
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

  function getFormSteps() {
    const selected = addressData.find(a => a.address === formData.address);
    const residents = selected?.residents || [];

    return [
      {
        name: 'residents',
        label: 'Who was spoken to?',
        type: 'checkbox',
        options: residents
      },
      {
        name: 'party',
        label: 'Party Preference',
        type: 'radio',
        options: [
          { value: 'CON', label: 'Conservative', color: 'blue' },
          { value: 'LAB', label: 'Labour', color: 'red' },
          { value: 'LIBDEM', label: 'Liberal Democrat', color: 'darkorange' },
          { value: 'REF', label: 'Reform', color: 'teal' },
          { value: 'OTH', label: 'Other', color: 'green' },
          { value: 'NONE', label: 'None', color: 'black' }
        ]
      },
      {
        name: 'support',
        label: 'Support level',
        type: 'select',
        options: ['member', 'strong', 'lean to', 'none']
      },
      {
        name: 'likelihood',
        label: 'Likelihood of Voting',
        type: 'select',
        options: ['definitely', 'probably', 'unlikely', 'no']
      },
      {
        name: 'issue',
        label: 'Most Important Issue',
        type: 'radio',
        options: shuffle(['Immigration', 'Economy', 'NHS', 'Housing', 'Net Zero'])
      },
      {
        name: 'notes',
        label: 'Notes',
        type: 'textarea'
      }
    ];
  }

  const saveResponse = (data, auto = false) => {
    const newEntry = {
      ...data,
      timestamp: new Date().toISOString(),
      canvasser: canvasserName
    };
    
    // CORE REQUIREMENT #2: Remove any existing entry for this address, keep only the latest
    const filteredResponses = responses.filter(r => r.address !== data.address);
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

  // Simplified login - just accept any user ID
  const handleLogin = () => {
    if (userId.trim()) {
      setCanvasserName(userId.trim());
      setLoggedIn(true);
    } else {
      alert("Please enter a user ID");
    }
  };

  // CORE REQUIREMENT #3: Send JSON to demographikon address via Brevo
  const sendResults = async () => {
    const { json } = generateCSVAndJSON(responses, addressData);
    
    console.log('📤 Sending report to demographikon...');
    
    try {
      const apiUrl = '/.netlify/functions/send-email';
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          canvasser: canvasserName,
          canvasserEmail: `${canvasserName}@canvasser.com`, // CHANGED: was recipientEmail
          date: new Date().toISOString(),
          json
          // REMOVED: recipientEmail - the function hardcodes the recipient
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert(`✅ Report sent to demographikon! Message ID: ${result.messageId}`);
      } else {
        alert(`❌ Failed to send report: ${result.message}`);
      }
    } catch (err) {
      alert("❌ Failed to send report. Network error.");
      console.error('Send error:', err);
    }
  };

  useEffect(() => {
    // Load saved responses
    const savedData = localStorage.getItem('canvassData');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setResponses(parsed);
        setVisited(parsed.map(r => r.address));
      } catch (e) {
        console.error('Error loading saved data:', e);
      }
    }

    // CORE REQUIREMENT #1: Load address data from external file
    // FIXED: Use googleapis.com not cloud.google.com
    const GCS_ADDRESS_DATA_URL = 'https://storage.googleapis.com/pac20_oa_canvass/Runcorn%20and%20Helsby_E00062413.csv';
    const SAMPLE_CSV_URL = '/sample_address_data.csv';
    
    setDataLoading(true);
    setDataError(null);
    
    fetchAddressDataWithFallback(GCS_ADDRESS_DATA_URL, SAMPLE_CSV_URL)
      .then(data => {
        console.log("📦 Address data loaded:", data);
        setAddressData(data);
        setDataLoading(false);
      })
      .catch(err => {
        console.error('❌ Failed to load address data:', err);
        setDataError(err.message);
        setDataLoading(false);
      });

    // REMOVED: No longer fetch user_emails.json
  }, []);

  if (!loggedIn) {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ position: 'relative' }}>
          <h1 style={titleStyle}>demographikon
            <span style={{
              position: 'absolute', right: 0, top: '50%',
              transform: 'translateY(-50%)',
              fontStyle: 'italic', fontSize: '0.2em',
              color: '#888', fontWeight: 400
            }}>
              Version {version.major}.{version.minor}.{version.patch}
            </span>
          </h1>
        </div>
        <label>Enter User ID:<br />
          <input 
            value={userId} 
            onChange={e => setUserId(e.target.value)} 
            style={inputStyle}
            onKeyPress={e => e.key === 'Enter' && handleLogin()}
          />
        </label><br /><br />
        <button onClick={handleLogin} style={buttonStyle}>Login</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, backgroundColor: 'rgb(227, 227, 227)' }}>
      <div style={{ position: 'relative' }}>
        <h1 style={titleStyle}>demographikon
          <span style={{
            position: 'absolute', right: 0, top: '50%',
            transform: 'translateY(-50%)',
            fontStyle: 'italic', fontSize: '0.2em',
            color: '#888', fontWeight: 400
          }}>
            Version {version.major}.{version.minor}.{version.patch}
          </span>
        </h1>
      </div>

      <div>
        <label>Select Address:<br />
          {dataLoading ? (
            <div style={{...inputStyle, display: 'flex', alignItems: 'center', backgroundColor: '#f0f0f0'}}>
              📡 Loading address data...
            </div>
          ) : dataError ? (
            <div style={{...inputStyle, display: 'flex', alignItems: 'center', backgroundColor: '#ffe6e6', color: '#d00'}}>
              ❌ Error loading data: {dataError}
            </div>
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
              {addressData.map((entry, idx) => (
                <option key={idx} value={entry.address}>
                  {entry.address}{visited.includes(entry.address) ? ' (visited)' : ''}
                </option>
              ))}
            </select>
          )}
        </label>
        {!dataLoading && !dataError && (
          <div style={{fontSize: '14px', color: '#666', marginTop: '5px'}}>
            📊 {addressData.length} addresses loaded
          </div>
        )}
      </div><br />

      {currentAddress && (
        <>
          <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
            <label style={{ ...radioLabelStyle }}>
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
            <label style={{ ...radioLabelStyle }}>
              <input
                type="radio"
                name="response"
                value="No Response"
                checked={formData.response === 'No Response'}
                onChange={() => {
                  setFormData({ ...formData, response: 'No Response', address: currentAddress });
                  saveResponse({ ...formData, response: 'No Response', address: currentAddress }, true);
                }}
                style={radioInputStyle}
              />
              No Response
            </label>
          </div>

          {formData.response === 'Response' && (
            <StepForm
              step={step}
              formData={formData}
              setFormData={setFormData}
              stepConfig={getFormSteps()[step]}
              onNext={() => saveResponse(formData)}
            />
          )}
        </>
      )}

      <div style={{ marginTop: 30 }}>
        <button onClick={() => setAdminMode(!adminMode)} style={buttonStyle}>Admin</button>
        {adminMode && (
          <div style={{ marginTop: 20 }}>
            <button onClick={sendResults} style={{ ...buttonStyle, backgroundColor: 'green' }}>
              Send Report to Demographikon
            </button>
            <div style={{ marginTop: 10, fontSize: '14px', color: '#666' }}>
              📊 Current responses: {responses.length} addresses
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;