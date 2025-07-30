// Google Cloud Storage utilities for fetching canvassing data

/**
 * Parse CSV text into address data format
 * Expected CSV format: name, address, other_columns...
 */
function parseCSVToAddressData(csvText) {
  console.log('🔍 Parsing CSV data, length:', csvText.length);
  console.log('📄 First 500 characters:', csvText.substring(0, 500));
  
  const lines = csvText.trim().split('\n');
  console.log('📊 Total lines in CSV:', lines.length);
  
  if (lines.length === 0) {
    console.error('❌ No lines found in CSV');
    return [];
  }
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  console.log('📋 Headers found:', headers);
  
  // Find name and address column indices - be more flexible with column names
  const firstNameIndex = headers.findIndex(h => {
    const lower = h.toLowerCase();
    return lower.includes('first') && lower.includes('name');
  });
  
  const lastNameIndex = headers.findIndex(h => {
    const lower = h.toLowerCase();
    return lower.includes('last') && lower.includes('name');
  });
  
  const nameIndex = headers.findIndex(h => {
    const lower = h.toLowerCase();
    return lower.includes('name') || 
           lower.includes('resident') || 
           lower.includes('person') ||
           lower.includes('voter');
  });
  
  const addressIndex = headers.findIndex(h => {
    const lower = h.toLowerCase();
    return lower.includes('address') || 
           lower.includes('addr') ||
           lower.includes('street') ||
           lower.includes('house');
  });

  console.log('🔍 Column indices - FirstName:', firstNameIndex, 'LastName:', lastNameIndex, 'Name:', nameIndex, 'Address:', addressIndex);

  // Use combined first+last name if available, otherwise fall back to name column
  const useFirstLastNames = firstNameIndex >= 0 && lastNameIndex >= 0;
  
  if (!useFirstLastNames && nameIndex === -1) {
    console.warn('⚠️ Could not find name columns in CSV');
  }
  
  if (addressIndex === -1) {
    console.warn('⚠️ Could not find address column in CSV');
    console.log('Available headers:', headers);
    // Try to use a column that might contain address-like data
    const possibleAddressIndex = headers.findIndex(h => h.toLowerCase().includes('road') || h.toLowerCase().includes('street'));
    if (possibleAddressIndex >= 0) {
      console.log('🔄 Using possible address column:', headers[possibleAddressIndex]);
      return parseWithIndices(lines, headers, useFirstLastNames ? [firstNameIndex, lastNameIndex] : [nameIndex], possibleAddressIndex);
    }
    // Use second column as fallback
    console.log('🔄 Using fallback address column: 2');
    return parseWithIndices(lines, headers, useFirstLastNames ? [firstNameIndex, lastNameIndex] : [0], 2);
  }

  return parseWithIndices(lines, headers, useFirstLastNames ? [firstNameIndex, lastNameIndex] : [nameIndex], addressIndex);
}

function parseWithIndices(lines, headers, nameIndices, addressIndex) {
  const addressMap = {};
  let processedRows = 0;

  // Skip header row, process data rows
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map(cell => cell.trim().replace(/"/g, ''));
    
    const maxIndex = Math.max(...(Array.isArray(nameIndices) ? nameIndices : [nameIndices]), addressIndex);
    if (row.length < maxIndex + 1) {
      continue; // Skip malformed rows
    }

    let name = '';
    if (Array.isArray(nameIndices) && nameIndices.length === 2) {
      // Combine first and last name
      const firstName = nameIndices[0] >= 0 ? row[nameIndices[0]] : '';
      const lastName = nameIndices[1] >= 0 ? row[nameIndices[1]] : '';
      name = `${firstName} ${lastName}`.trim();
    } else {
      // Single name column
      const nameIndex = Array.isArray(nameIndices) ? nameIndices[0] : nameIndices;
      name = nameIndex >= 0 ? row[nameIndex] : '';
    }
    
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
      processedRows++;
    }
  }

  console.log('✅ Processed', processedRows, 'rows into', Object.keys(addressMap).length, 'unique addresses');
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

    console.log('📡 GCS Response status:', response.status, response.statusText);

    if (!response.ok) {
      // Check if it's an authentication issue
      if (response.status === 401 || response.status === 403) {
        throw new Error(`Authentication required - bucket may not be public (${response.status})`);
      }
      throw new Error(`Failed to fetch GCS data: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('Content-Type') || '';
    console.log('📄 Content-Type:', contentType);

    const responseText = await response.text();
    console.log('📄 Response received, size:', responseText.length, 'characters');
    
    // Check if we got HTML instead of CSV (sign-in page)
    if (responseText.includes('<html') || responseText.includes('Sign in')) {
      throw new Error('Received HTML instead of CSV - authentication required or bucket not public');
    }
    
    const addressData = parseCSVToAddressData(responseText);
    console.log('🏠 Parsed', addressData.length, 'addresses from GCS');
    
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
      
      // Check if fallback is CSV or JSON
      const contentType = response.headers.get('Content-Type') || '';
      const isCSV = fallbackUrl.endsWith('.csv') || contentType.includes('text/csv');
      
      if (isCSV) {
        const csvText = await response.text();
        const data = parseCSVToAddressData(csvText);
        console.log('💾 Using fallback CSV data:', data.length, 'addresses');
        return data;
      } else {
        const data = await response.json();
        console.log('💾 Using fallback JSON data:', data.length, 'addresses');
        return data;
      }
    } catch (fallbackError) {
      console.error('❌ Both GCS and fallback failed:', fallbackError);
      throw new Error('Unable to load address data from any source');
    }
  }
}
