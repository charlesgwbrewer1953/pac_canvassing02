# GCS Authentication & Security Configuration

## Current Implementation

The app now fetches address data from Google Cloud Storage using a public URL with fallback to local data.

### GCS URL Configuration
- **Current URL**: `https://storage.cloud.google.com/pac20_oa_canvass/Runcorn%20and%20Helsby_E00062413.csv?authuser=2`
- **Bucket**: `pac20_oa_canvass`
- **File**: `Runcorn and Helsby_E00062413.csv`

## Authentication File Security

### ❌ NEVER Store Auth Files In:
- `public/` folder (publicly accessible)
- `src/` folder (bundled with client code)
- Root directory (might be exposed in builds)

### ✅ Secure Authentication Options:

#### Option 1: Environment Variables (Current Recommended)
```bash
# In .env.local (add to .gitignore)
REACT_APP_GCS_BUCKET_URL=https://storage.cloud.google.com/pac20_oa_canvass/Runcorn%20and%20Helsby_E00062413.csv
```

#### Option 2: Server-Side Proxy (Most Secure)
Create a backend service that:
1. Stores service account keys securely
2. Proxies requests to GCS
3. Authenticates users before serving data

#### Option 3: Public Bucket with CORS (Current)
- Make bucket publicly readable
- Configure CORS for your domain
- No authentication files needed

## Production Security Recommendations

### For Backend Service:
```
/server/
  ├── config/
  │   └── gcs-service-account.json  # Server-side only
  ├── routes/
  │   └── address-data.js
  └── middleware/
      └── auth.js
```

### For Client-Side (Current):
- Use public URLs or environment variables
- No sensitive credentials in client code
- Implement proper CORS policies

## Implementation Details

### Current Flow:
1. App tries to fetch from GCS URL
2. If fails, falls back to local `/address_data.json`
3. CSV is parsed and converted to address format
4. Data is cached in component state

### CSV Format Expected:
```csv
name,address,other_columns...
"John Smith","123 Main St",additional_data...
"Jane Doe","123 Main St",additional_data...
```

### Parsed Output:
```json
[
  {
    "address": "123 Main St",
    "residents": ["John Smith", "Jane Doe"]
  }
]
```

## Next Steps for Enhanced Security

1. **Set up service account**: Create GCS service account with minimal permissions
2. **Backend proxy**: Create Express.js/Node.js backend to handle GCS auth
3. **Environment config**: Move URLs to environment variables
4. **CORS setup**: Configure proper CORS policies on GCS bucket
5. **Error monitoring**: Add better error handling and user notifications
