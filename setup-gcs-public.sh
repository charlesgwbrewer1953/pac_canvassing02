#!/bin/bash
# GCS Bucket Public Access Setup Script

# Replace with your actual bucket name
BUCKET_NAME="pac20_oa_canvass"

echo "🔧 Setting up public access for GCS bucket: $BUCKET_NAME"

# Make the bucket publicly readable
echo "📂 Making bucket publicly readable..."
gsutil iam ch allUsers:objectViewer gs://$BUCKET_NAME

# Set CORS policy for web access
echo "🌐 Setting CORS policy..."
cat > cors.json << EOF
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"],
    "maxAgeSeconds": 3600
  }
]
EOF

gsutil cors set cors.json gs://$BUCKET_NAME

echo "✅ Bucket setup complete!"
echo "📋 Test URL: https://storage.googleapis.com/$BUCKET_NAME/Runcorn%20and%20Helsby_E00062413.csv"

# Clean up
rm cors.json
