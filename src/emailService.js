// emailService.js
export default async function sendEmailReport(reportData) {
  // Always go through the Netlify function (works for local `netlify dev` and production deploys).
  const backendUrl = '/.netlify/functions/email-proxy';

  // Accept optional fields from caller:
  // - subjectOverride (optional)
  // - bodyText (optional)
  // - attachments: [{ filename, contentBase64, contentType, encoding }]
  const {
    canvasser,
    date,
    time,
    dataJSON,
    subjectOverride,
    bodyText,
    attachments, // <— optional array
  } = reportData;

  const subject =
    subjectOverride || `Canvassing Report - ${date} ${time || ''}`.trim();

  const textBody =
    bodyText ||
    `Canvasser: ${canvasser}\n\nResponses:\n${dataJSON || ''}`;

  const htmlBody =
    `<h2>Canvasser: ${canvasser}</h2>` +
    (dataJSON ? `<pre>${dataJSON}</pre>` : `<p>${textBody}</p>`);

  const emailPayload = {
    to: 'demographikon.dev.01@gmail.com',
    subject,
    text: textBody,
    html: htmlBody,
    // NEW: forward attachments if provided
    // Each item: { filename, contentBase64, contentType, encoding: 'base64' }
    ...(attachments?.length ? { attachments } : {}),
  };

  let res;
  try {
    res = await fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailPayload),
    });
  } catch (err) {
    throw new Error(`Email send failed (network): ${err.message}. Ensure you are running via "netlify dev" so functions are available.`);
  }

  const bodyTextRes = await res.text();

  if (!res.ok) {
    try {
      const err = JSON.parse(bodyTextRes);
      throw new Error(err.details || err.error || 'Unknown error sending email (proxy)');
    } catch {
      throw new Error(`Email send failed: ${bodyTextRes || res.statusText}`);
    }
  }

  try {
    return JSON.parse(bodyTextRes);
  } catch {
    throw new Error('Invalid JSON in success response');
  }
}
