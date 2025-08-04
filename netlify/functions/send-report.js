const { Storage } = require('@google-cloud/storage');

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { Oa21cd, Date, Time, DataJSON, Canvasser } = JSON.parse(event.body);

    // Initialize Google Cloud Storage using environment variables
    const storage = new Storage({
      projectId: 'politicalMaps',
      credentials: JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS_BASE64, 'base64').toString())
    });

    const bucketName = 'canvass_output';
    const bucket = storage.bucket(bucketName);

    // Create filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `canvassing-report-${Canvasser}-${Date}-${timestamp}.json`;

    // Prepare data to upload
    const reportData = {
      Oa21cd,
      Date,
      Time,
      Canvasser,
      DataJSON: JSON.parse(DataJSON),
      uploadedAt: new Date().toISOString()
    };

    // Upload to Google Cloud Storage
    const file = bucket.file(fileName);
    await file.save(JSON.stringify(reportData, null, 2), {
      metadata: {
        contentType: 'application/json',
      },
    });

    console.log(`✅ File uploaded to gs://${bucketName}/${fileName}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        fileName: fileName,
        bucketName: bucketName,
        message: 'Report uploaded to Google Cloud Storage successfully'
      })
    };

  } catch (error) {
    console.error('❌ Upload failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: error.message 
      })
    };
  }
};// Updated credentials
