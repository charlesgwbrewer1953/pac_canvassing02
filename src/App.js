import React, { useState, useEffect } from 'react';
import StepForm from './StepForm';
import { shuffle, generateCSVAndJSON } from './utils';

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

  useEffect(() => {
    fetch('/address_data.json')
      .then(res => res.json())
      .then(data => {
        console.log("📦 Address data loaded:", data);
        setAddressData(data);
      });

    fetch('/user_emails.json')
      .then(res => res.json())
      .then(data => setEmailMap(data));
  }, []);

  useEffect(() => {
    console.log("📌 Address selected:", currentAddress);
  }, [currentAddress]);

  useEffect(() => {
    console.log("🧾 formData.address:", formData.address);
  }, [formData.address]);

  const handleLogin = () => {
    if (emailMap[userId]) {
      setCanvasserEmail(emailMap[userId]);
      setCanvasserName(userId);
      setLoggedIn(true);
    } else {
      alert("Unknown user ID");
    }
  };

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

  const sendResults = async () => {
    const { csv, json } = generateCSVAndJSON(responses, addressData);

    fetch('https://script.google.com/macros/s/AKfycbxWs_mUlycyVA9FvXUti-DfAWg3AMa1CZVEDCvMimzU2je7VaoDL-TnocnVbFt21IC6/exec', {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: canvasserEmail,
        canvasser: canvasserName,
        date: new Date().toISOString(),
        csv,
        json,
        secret: "DEMOGRAPHIKON2024"
      })
    })
      .then(res => res.text())
      .then(result => {
        if (result.includes("✅")) {
          alert("✅ Report sent via Gmail!");
        } else {
          alert("⚠️ Something went wrong.\n\n" + result);
        }
      })
      .catch(err => {
        console.error("❌ Failed to send report:", err);
        alert(`❌ Error sending email.\n\nDetails: ${err.message || err}\n\nPlease check:\n- Google Apps Script URL is correct\n- The script is deployed as a Web App\n- Access is set to \"Anyone with the link\"\n- You are connected to the internet\n- The secret token matches`);
      });
  };

  const getFormSteps = () => {
    const selected = addressData.find(a => a.address === formData.address);
    const residents = selected?.residents || [];

    console.log("🧠 Matching address:", formData.address);
    console.log("✅ Found:", selected);
    console.log("👥 Residents:", residents);

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
      { name: 'notes', label: 'Notes', type: 'textarea' }
    ];
  };

  if (!loggedIn) {
    return (
      <div style={{ padding: 20 }}>
        <h1 style={titleStyle}>demographikon</h1>
        <label>Enter User ID:<br />
          <input value={userId} onChange={e => setUserId(e.target.value)} style={inputStyle} />
        </label><br /><br />
        <button onClick={handleLogin} style={buttonStyle}>Login</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h1 style={titleStyle}>demographikon</h1>
      <div>
        <label>Select Address:<br />
          <select
            value={currentAddress}
            onChange={(e) => {
              const selected = e.target.value;
              console.log("Selected address:", selected);
              setCurrentAddress(selected);
              setFormData({ address: selected });
            }}
            style={inputStyle}
          >
            <option value="">-- Choose an address --</option>
            {addressData.map((entry, idx) => (
              <option key={idx} value={entry.address}>{entry.address}{visited.includes(entry.address) ? ' (visited)' : ''}</option>
            ))}
          </select>
        </label>
      </div><br />

      {currentAddress && (
        <>
          <div style={{ marginBottom: 20 }}>
            <label style={{ ...radioLabelStyle, color: 'black' }}>
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
            <label style={{ ...radioLabelStyle, marginLeft: '20px', color: 'black' }}>
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
            <>
              {console.log("📤 Step passed to StepForm:", getFormSteps()[step])}
              <StepForm
                step={step}
                formData={formData}
                setFormData={setFormData}
                stepConfig={getFormSteps()[step]}
                onNext={() => saveResponse(formData)}
              />
            </>
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

export default App;