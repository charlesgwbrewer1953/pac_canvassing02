const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  console.log('=== FUNCTION START ===');
  console.log('Method:', event.httpMethod);
  
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    console.log('=== PARSING REQUEST ===');
    console.log('Request body:', event.body);
    
    const { canvasser, canvasserEmail, date, json } = JSON.parse(event.body);
    
    console.log('Parsed data:');
    console.log('- Canvasser:', canvasser);
    console.log('- Email:', canvasserEmail);
    console.log('- Date:', date);
    console.log('- JSON entries:', json?.length || 0);
    
    console.log('=== CHECKING API KEY ===');
    console.log('Has BREVO_API_KEY_PROD:', !!process.env.BREVO_API_KEY_PROD);
    console.log('Key length:', process.env.BREVO_API_KEY_PROD?.length || 0);
    
    if (!process.env.BREVO_API_KEY_PROD) {
      console.error('BREVO_API_KEY_PROD not found in environment');
      throw new Error('BREVO_API_KEY_PROD not configured');
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif;">
          <h1>📊 Demographikon Canvassing Report</h1>
          <p><strong>Date:</strong> ${new Date(date).toLocaleString()}</p>
          <p><strong>Canvasser:</strong> ${canvasser}</p>
          <p><strong>Email:</strong> ${canvasserEmail}</p>
          <p><strong>Addresses Visited:</strong> ${json.length}</p>
          <pre>${JSON.stringify(json, null, 2)}</pre>
        </body>
      </html>
    `;

    const emailData = {
      sender: { name: "Demographikon App", email: "noreply@demographikon.app" },
      to: [{ email: "demographikon.dev.01@gmail.com", name: "Demographikon Admin" }],
      subject: `📊 Canvassing Report from ${canvasser}`,
      htmlContent: htmlContent
    };

    console.log('=== CALLING BREVO API ===');
    console.log('Email data being sent:', JSON.stringify(emailData, null, 2));
    
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY_PROD,
        'content-type': 'application/json'
      },
      body: JSON.stringify(emailData)
    });

    console.log('=== BREVO RESPONSE ===');
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    console.log('Headers:', Object.fromEntries(response.headers));
    
    const responseText = await response.text();
    console.log('Raw response body:', responseText);
    
    let result;
    try {
      result = JSON.parse(responseText);
      console.log('Parsed response:', JSON.stringify(result, null, 2));
    } catch (parseError) {
      console.error('Failed to parse JSON response:', parseError);
      result = { error: 'Invalid JSON response', rawResponse: responseText };
    }
    
    if (response.ok) {
      console.log('=== EMAIL SENT SUCCESSFULLY ===');
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ success: true, messageId: result.messageId })
      };
    } else {
      console.error('=== BREVO API ERROR ===');
      console.error('Status Code:', response.status);
      console.error('Error Response:', JSON.stringify(result, null, 2));
      console.error('Request Data:', JSON.stringify(emailData, null, 2));
      
      const errorMessage = result.message || result.error || result.code || 'Unknown Brevo error';
      const fullError = `Brevo API error (${response.status}): ${errorMessage}. Full response: ${JSON.stringify(result)}`;
      
      throw new Error(fullError);
    }
  } catch (error) {
    console.error('=== FUNCTION ERROR ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
        success: false, 
        error: error.message,
        errorType: error.constructor.name
      })
    };
  }
};