const EMAIL_BACKENDS = {
  ZAPIER: 'zapier',
  NODEJS: 'nodejs'
};

// Switch back to Zapier - it actually works!
const CURRENT_BACKEND = EMAIL_BACKENDS.ZAPIER;

const sendReport = async (reportData) => {
  switch (CURRENT_BACKEND) {
    case EMAIL_BACKENDS.ZAPIER:
      return await sendViaZapier(reportData);
    
    case EMAIL_BACKENDS.NODEJS:
      return await sendViaNodeJS(reportData);
    
    default:
      throw new Error('No email backend configured');
  }
};

const sendViaZapier = async (reportData) => {
  const webhookUrl = 'https://hooks.zapier.com/hooks/catch/24028989/u4t20am/';
  
  const now = new Date();
  const currentDate = reportData.date || now.toISOString().split('T')[0];
  const currentTime = reportData.time || now.toTimeString().split(' ')[0];
  
  const zapierData = {
    Oa21cd: 'E00062413',
    Date: currentDate,
    Time: currentTime,
    'Data JSON': reportData.dataJSON || 'No data provided',
    Canvasser: reportData.canvasser || 'Unknown User'
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    body: JSON.stringify(zapierData)
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return { success: true, message: 'Report sent via Zapier' };
};

const sendViaNodeJS = async (reportData) => {
  // This won't work because Netlify functions are broken
  throw new Error('Netlify functions are garbage');
};

export default sendReport;