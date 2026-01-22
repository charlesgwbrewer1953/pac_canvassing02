// src/components/StepForm.js
import React from 'react';

// Local copies of the styles used by StepForm (same values as in App.js)
const inputStyle = { width: '40ch', fontSize: '18px', padding: '10px', marginBottom: '10px' };
const buttonStyle = { padding: '10px 20px', fontSize: '16px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '6px', marginTop: '10px' };
const radioLabelStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: '20px',
  padding: '12px 18px',
  backgroundColor: '#e8e8e8',
  borderRadius: '8px',
  border: '2px solid #ccc', // ← fixed quotes
  cursor: 'pointer'
};
const radioInputStyle = { width: '36px', height: '36px', marginRight: '14px', cursor: 'pointer' };

export default function StepForm({ step, formData, setFormData, stepConfig, onNext }) {
  if (!stepConfig) return null;

  const { name, label, type, options } = stepConfig;

  const handleChange = (value) => {
    setFormData({ ...formData, [name]: value });
  };

  const renderInput = () => {
    switch (type) {
      case 'checkbox':
        return (
          <div>
            {options.map((option, idx) => (
              <label key={idx} style={{ display: 'block', margin: '10px 0' }}>
                <input
                  type="checkbox"
                  checked={(formData[name] || []).includes(option)}
                  onChange={(e) => {
                    const current = formData[name] || [];
                    const updated = e.target.checked
                      ? [...current, option]
                      : current.filter(item => item !== option);
                    handleChange(updated);
                  }}
                  style={{ width: '28px', height: '28px', marginRight: '12px', cursor: 'pointer' }}
                />
                {option}
              </label>
            ))}
          </div>
        );

      case 'radio':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {options.map((option, idx) => {
              const optionValue = typeof option === 'string' ? option : option.value;
              const optionLabel = typeof option === 'string' ? option : option.label;
              const optionColor = typeof option === 'string' ? '#000' : (option.color || '#000');

              const isSelected = formData[name] === optionValue;

              const textForBackground = (hex) => {
                // Simple luminance check to choose readable text color
                const h = String(hex || '').replace('#', '');
                if (h.length !== 6) return '#fff';
                const r = parseInt(h.slice(0, 2), 16);
                const g = parseInt(h.slice(2, 4), 16);
                const b = parseInt(h.slice(4, 6), 16);
                const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                return luminance > 0.6 ? '#000' : '#fff';
              };

              const selectedTextColor =
                typeof option === 'string'
                  ? '#fff'
                  : (option.textColor || textForBackground(optionColor));

              return (
                <label
                  key={idx}
                  style={{
                    ...radioLabelStyle,
                    backgroundColor: isSelected ? optionColor : '#e8e8e8',
                    color: isSelected ? selectedTextColor : '#000',
                    margin: '0',
                    display: 'flex',
                    width: '100%'
                  }}
                >
                  <input
                    type="radio"
                    name={name}
                    value={optionValue}
                    checked={formData[name] === optionValue}
                    onChange={() => handleChange(optionValue)}
                    style={radioInputStyle}
                  />
                  {optionLabel}
                </label>
              );
            })}
          </div>
        );

      case 'select':
        return (
          <select
            value={formData[name] || ''}
            onChange={(e) => handleChange(e.target.value)}
            style={{ ...inputStyle, width: '100%' }}
          >
            <option value="">-- Select an option --</option>
            {options.map((option, idx) => (
              <option key={idx} value={option}>
                {option}
              </option>
            ))}
          </select>
        );

      case 'textarea':
        return (
          <textarea
            value={formData[name] || ''}
            onChange={(e) => handleChange(e.target.value)}
            style={{ ...inputStyle, height: '100px', resize: 'none' }}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ marginTop: 20, padding: 20, borderRadius: '8px', border: '1px solid #ccc', backgroundColor: '#f9f9f9' }}>
      <div style={{ marginBottom: 10, fontSize: '18px', fontWeight: 'bold' }}>{label}</div>
      {renderInput()}
      <div style={{ marginTop: 10, textAlign: 'right' }}>
        <button onClick={onNext} style={{ ...buttonStyle, width: '100px' }}>
          Next
        </button>
      </div>
    </div>
  );
}
