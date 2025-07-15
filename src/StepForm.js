// StepForm.js
import React from 'react';

function StepForm({ step, stepConfig, formData, setFormData, onNext }) {
  const { name, label, type, options } = stepConfig;

  const handleChange = (e) => {
    const { value, checked } = e.target;

    if (type === 'checkbox') {
      const prev = formData[name] || [];
      const updated = checked
        ? [...prev, value]
        : prev.filter((item) => item !== value);

      setFormData({ ...formData, [name]: updated });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  return (
    <div>
      <h3>{label}</h3>

      {type === 'text' && (
        <input
          name={name}
          value={formData[name] || ''}
          onChange={handleChange}
          style={inputStyle}
        />
      )}

      {type === 'textarea' && (
        <textarea
          name={name}
          value={formData[name] || ''}
          onChange={handleChange}
          style={inputStyle}
        />
      )}

      {type === 'select' && (
        <select
          name={name}
          value={formData[name] || ''}
          onChange={handleChange}
          style={inputStyle}
        >
          <option value="">-- Select --</option>
          {options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}

      {type === 'radio' && options.map(opt => (
        <div key={opt.value || opt}>
          <label style={{ color: opt.color || 'black', fontSize: '18px' }}>
            <input
              type="radio"
              name={name}
              value={opt.value || opt}
              checked={formData[name] === (opt.value || opt)}
              onChange={handleChange}
            />
            {' '}{opt.label || opt}
          </label>
        </div>
      ))}

      {type === 'checkbox' && options.map(opt => (
        <div key={opt}>
          <label style={{ fontSize: '18px' }}>
            <input
              type="checkbox"
              name={name}
              value={opt}
              checked={(formData[name] || []).includes(opt)}
              onChange={handleChange}
            />
            {' '}{opt}
          </label>
        </div>
      ))}

      <br />
      <button onClick={onNext} style={buttonStyle}>Next</button>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  fontSize: '18px',
  padding: '10px',
  marginBottom: '20px'
};

const buttonStyle = {
  padding: '10px 20px',
  fontSize: '16px',
  backgroundColor: '#28a745',
  color: '#fff',
  border: 'none',
  borderRadius: '6px'
};

export default StepForm;