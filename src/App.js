import React, { useState, useEffect } from 'react';
import StepForm from './StepForm';
import { shuffle, generateCSVAndJSON } from './utils';

// Version info
const version = { major: 0, minor: 0, patch: 6 };

// Styles
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
  const [emailMap, setEmailMap] = useState({});
  const [canvasserEmail, setCanvasserEmail] = useState('');
  const [canvasserName, setCanvasserName] = useState('');
  const [addressData, setAddressData] = useState([]);
  const [visited, setVisited] = useState([]);
  const [formData, setFormData] = useState({});
  const [responses, setResponses] = useState([]);
  const [currentAddress, setCurrentAddress] = useState('');
  const [step, setStep] = useState(0);
  const [adminMode, setAdminMode] = useState(false);

  // ✅ Define getFormSteps BEFORE any usage
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
    const newResponses = [...responses, newEntry];
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
    if (emailMap[userId]) {
      setCanvasserEmail(emailMap[userId]);
      setCanvasserName(userId);
      setLoggedIn(true);
    } else {
      alert("Unknown user ID");
    }
  };

  const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw7VrjE3osFl-kZyhjP_M6P1nYA-qlNAmMw5qDD10dBMgOtmxR6zI02x9CKrerz4ho/exec';

const sendResults = async () => {
  const { json } = generateCSVAndJSON(responses, addressData);
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: canvasserEmail,
        canvasser: canvasserName,
        date: new Date().toISOString(),
        json,
        secret: "DEMOGRAPHIKON2024"
      })
    });
    if (response.ok) {
      alert("✅ Report sent via Gmail!");
    } else {
      alert("❌ Failed to send report. Server error.");
      console.error('Send error: Server responded with', response.status, response.statusText);
    }
  } catch (err) {
    alert("❌ Failed to send report. Network error.");
    console.error('Send error:', err);
  }
};

  useEffect(() => {
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

    fetch('/address_data.json')
      .then(res => res.json())
      .then(data => {
        console.log("📦 Address data loaded:", data);
        setAddressData(data);
      });

    fetch('/user_emails.json')
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(data => setEmailMap(data))
      .catch(err => {
        console.error('Error loading user_emails.json:', err);
      });
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
          <input value={userId} onChange={e => setUserId(e.target.value)} style={inputStyle} />
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
        </label>
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
            <button onClick={sendResults} style={{ ...buttonStyle, backgroundColor: 'green' }}>Send Full Report</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;