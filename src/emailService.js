// emailService.js
export default async function sendEmailReport(reportData) {
  const backendUrl =
    window.location.hostname === 'localhost'
      ? 'https://email-server-backend-production.up.railway.app/api/gmail/send'
      : 'https://email-server-backend-production.up.railway.app/api/gmail/send';

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
    to: 'charles.brewer.junk@gmail.com',
    subject,
    text: textBody,
    html: htmlBody,
    // NEW: forward attachments if provided
    // Each item: { filename, contentBase64, contentType, encoding: 'base64' }
    ...(attachments?.length ? { attachments } : {}),
  };

  const res = await fetch(backendUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(emailPayload),
  });

  const bodyTextRes = await res.text();

  if (!res.ok) {
    try {
      const err = JSON.parse(bodyTextRes);
      throw new Error(err.details || err.error || 'Unknown error sending email');
    } catch {
      throw new Error(bodyTextRes);
    }
  }

  try {
    return JSON.parse(bodyTextRes);
  } catch {
    throw new Error('Invalid JSON in success response');
  }
}