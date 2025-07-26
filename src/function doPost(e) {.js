function doPost(e) {
  try {
    Logger.log("=== Incoming POST ===");

    // Check if postData exists
    if (!e.postData || !e.postData.contents) {
      Logger.log("❌ No post data received");
      return createCorsHtmlResponse("❌ No post data received");
    }

    Logger.log("Headers: " + JSON.stringify(e.headers));
    Logger.log("Post Data: " + e.postData.contents);

    var data = JSON.parse(e.postData.contents);
    Logger.log("Parsed Data: " + JSON.stringify(data));

    if (!data.secret || data.secret !== "DEMOGRAPHIKON2024") {
      Logger.log("❌ Invalid secret: " + data.secret);
      return createCorsHtmlResponse("❌ Invalid secret");
    }

    var recipient = "demographikon.dev.01@gmail.com";
    var subject = "Canvassing Report from " + (data.canvasser || "Unknown") +
                  " (" + (data.to || "No email") + ")";

    var jsonContent = typeof data.json === "object"
      ? JSON.stringify(data.json, null, 2)
      : "No valid JSON provided";

    var body = "Date: " + (data.date || "Unknown") +
               "\nCanvasser: " + (data.canvasser || "Unknown") +
               "\n\nJSON Data:\n" + jsonContent;

    Logger.log("Email subject: " + subject);
    Logger.log("Email body: " + body);

    MailApp.sendEmail({
      to: recipient,
      subject: subject,
      body: body
    });

    Logger.log("✅ Email sent to: " + recipient);
    return createCorsHtmlResponse("✅ Email sent");

  } catch (err) {
    Logger.log("❌ Error: " + err.message);
    Logger.log("❌ Stack: " + err.stack);
    return createCorsHtmlResponse("❌ Error: " + err.message);
  }
}

function doGet(e) {
  Logger.log("=== Incoming GET ===");
  return createCorsHtmlResponse("GET endpoint active");
}

function doOptions(e) {
  Logger.log("=== Incoming OPTIONS ===");
  return createCorsHtmlResponse(""); // Preflight requests need a 200 OK with headers
}

// CORS-compatible response using HTML meta tags
function createCorsHtmlResponse(message) {
  var htmlContent = `
    <html>
      <head>
        <meta http-equiv="Access-Control-Allow-Origin" content="*" />
        <meta http-equiv="Access-Control-Allow-Methods" content="GET, POST, OPTIONS" />
        <meta http-equiv="Access-Control-Allow-Headers" content="Content-Type" />
      </head>
      <body>
        <pre>${message}</pre>
      </body>
    </html>
  `;
  return HtmlService.createHtmlOutput(htmlContent);
}