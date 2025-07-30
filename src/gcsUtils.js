// Google Cloud Storage utilities for fetching canvassing data

/**
 * Parse CSV text into address data format
 * Expected CSV format: name, address, other_columns...
 */
function parseCSVToAddressData(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  
  // Find name and address column indices
  const nameIndex = headers.findIndex(h => 
    h.toLowerCase().includes('name') || 
    h.toLowerCase().includes('resident')
  );
  const addressIndex = headers.findIndex(h => 
    h.toLowerCase().includes('address') || 
    h.toLowerCase().includes('addr')
  );

  if (nameIndex === -1 || addressIndex === -1) {
    console.warn('Could not find name or address columns in CSV');
    console.log('Headers found:', headers);
  }

  const addressMap = {};

  // Skip header row, process data rows
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map(cell => cell.trim().replace(/"/g, ''));
    
    if (row.length < Math.max(nameIndex + 1, addressIndex + 1)) {
      continue; // Skip malformed rows
    }

    const name = nameIndex >= 0 ? row[nameIndex] : '';
    const address = addressIndex >= 0 ? row[addressIndex] : '';

    if (name && address) {
      if (!addressMap[address]) {
        addressMap[address] = {
          address: address,
          residents: []
        };
      }
      
      if (!addressMap[address].residents.includes(name)) {
        addressMap[address].residents.push(name);
      }
    }
  }

  return Object.values(addressMap);
}

/**
 * Fetch data from Google Cloud Storage CSV
 * @param {string} bucketUrl - Full GCS URL to the CSV file
 * @returns {Promise<Array>} - Array of address objects
 */
export async function fetchGCSAddressData(bucketUrl) {
  try {
    console.log('🌍 Fetching data from GCS:', bucketUrl);
    
    const response = await fetch(bucketUrl, {
      method: 'GET',
      mode: 'cors',
      headers: {
        'Accept': 'text/csv,text/plain,*/*'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch GCS data: ${response.status} ${response.statusText}`);
    }

    const csvText = await response.text();
    console.log('📄 CSV data fetched, size:', csvText.length, 'characters');
    
    const addressData = parseCSVToAddressData(csvText);
    console.log('🏠 Parsed', addressData.length, 'addresses');
    
    return addressData;

  } catch (error) {
    console.error('❌ Error fetching GCS data:', error);
    throw error;
  }
}

/**
 * Fallback to local data if GCS fails
 */
export async function fetchAddressDataWithFallback(gcsUrl, fallbackUrl = '/address_data.json') {
  try {
    // Try GCS first
    return await fetchGCSAddressData(gcsUrl);
  } catch (gcsError) {
    console.warn('⚠️ GCS fetch failed, falling back to local data:', gcsError.message);
    
    try {
      const response = await fetch(fallbackUrl);
      if (!response.ok) {
        throw new Error(`Fallback fetch failed: ${response.status}`);
      }
      const data = await response.json();
      console.log('💾 Using fallback data:', data.length, 'addresses');
      return data;
    } catch (fallbackError) {
      console.error('❌ Both GCS and fallback failed:', fallbackError);
      throw new Error('Unable to load address data from any source');
    }
  }
}
