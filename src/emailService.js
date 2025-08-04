const EMAIL_BACKENDS = {
  ZAPIER: 'zapier',
  NODEJS: 'nodejs'
};

// Choose your backend here - change this one line to switch
   const CURRENT_BACKEND = EMAIL_BACKENDS.NODEJS;
// const CURRENT_BACKEND = EMAIL_BACKENDS.ZAPIER;

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
  
  // Get current date/time if not provided
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
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return { success: true, provider: 'Zapier' };
};

const sendViaNodeJS = async (reportData) => {
  const backendUrl = 'https://canvass-gcs.netlify.app/.netlify/functions/send-report';
  
  // Get current date/time if not provided
  const now = new Date();
  const currentDate = reportData.date || now.toISOString().split('T')[0];
  const currentTime = reportData.time || now.toTimeString().split(' ')[0];
  
  const response = await fetch(backendUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Oa21cd: 'E00062413',
      Date: currentDate,
      Time: currentTime,
      DataJSON: reportData.dataJSON || 'No data provided',
      Canvasser: reportData.canvasser || 'Unknown User'
    })
  });

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Backend error');
  }

  return { success: true, provider: 'Node.js Backend', messageId: result.messageId };
};


export default sendReport;