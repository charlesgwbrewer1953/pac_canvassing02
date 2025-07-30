exports.handler = async (event, context) => {
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
    const { canvasser, canvasserEmail, date, json } = JSON.parse(event.body);
    
    if (!process.env.BREVO_API_KEY) {
      throw new Error('BREVO_API_KEY not configured');
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

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify(emailData)
    });

    const result = await response.json();
    
    if (response.ok) {
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ success: true, messageId: result.messageId })
      };
    } else {
      throw new Error(`Brevo API error: ${result.message}`);
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};
