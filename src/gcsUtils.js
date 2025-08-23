// Google Cloud Storage utilities for fetching canvassing data

/**
 * Parse CSV text into address data format
 * Expected CSV format: First Name, Last Name, Address, other_columns...
 */
export function parseAddressCsv(csvText) {
  console.log('🔍 Parsing CSV data, length:', csvText.length);
  
  const lines = csvText.trim().split('\n');
  console.log('📊 Total lines in CSV:', lines.length);
  
  if (lines.length === 0) {
    console.error('❌ No lines found in CSV');
    return [];
  }
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  console.log('📋 ALL HEADERS:', headers);
  
  // YOUR CSV FORMAT: Name1, Name2, Address, Postcode
  // So we need to treat first two columns as names, third as address
  const firstNameIndex = 0;  // First column is first name
  const lastNameIndex = 1;   // Second column is last name  
  const addressIndex = 2;    // Third column is address
  
  console.log('📍 FIXED COLUMN INDICES:', { 
    firstNameIndex, 
    lastNameIndex, 
    addressIndex 
  });
  
  const addressMap = new Map();
  
  // Process each data row (including the header row as data!)
  for (let i = 1; i < lines.length; i++) {  // ✅ skip header
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    
    if (values.length < 3) {
      console.warn(`⚠️ Skipping row ${i}: insufficient columns`);
      continue;
    }
    
    const firstName = values[firstNameIndex] || '';
    const lastName = values[lastNameIndex] || '';
    const address = values[addressIndex] || '';
    
    if (!address) {
      console.warn(`⚠️ Skipping row ${i}: no address`);
      continue;
    }
    
    const fullName = `${firstName} ${lastName}`.trim();
    
    if (!fullName) {
      console.warn(`⚠️ Skipping row ${i}: no name data`);
      continue;
    }
    
    console.log(`👤 Row ${i}: "${fullName}" at "${address}"`);
    
    // Group by address
    if (!addressMap.has(address)) {
      addressMap.set(address, {
        address: address,
        residents: []
      });
    }
    
    const addressEntry = addressMap.get(address);
    if (!addressEntry.residents.includes(fullName)) {
      addressEntry.residents.push(fullName);
      console.log(`✅ Added resident: "${fullName}" to ${address}`);
    }
  }
  
  const result = Array.from(addressMap.values());
  console.log('📋 FINAL RESULT:', result);
  return result;
}

/**
 * Fetch address data from Google Cloud Storage with fallback
 */
export async function fetchAddressDataWithFallback(primaryUrl, fallbackUrl) {
  console.log('🔍 Fetching address data from:', primaryUrl);
  
  try {
    // Try primary URL first
    const response = await fetch(primaryUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const csvText = await response.text();
    console.log('✅ Successfully fetched from primary URL');
    
    const data = parseAddressCsv(csvText);
    
    if (data.length === 0) {
      throw new Error('No valid address data found in primary source');
    }
    
    return data;
    
  } catch (primaryError) {
    console.warn('⚠️ Primary source failed:', primaryError.message);
    console.log('🔄 Trying fallback URL:', fallbackUrl);
    
    try {
      const response = await fetch(fallbackUrl);
      if (!response.ok) {
        throw new Error(`Fallback HTTP ${response.status}: ${response.statusText}`);
      }
      
      const csvText = await response.text();
      console.log('✅ Successfully fetched from fallback URL');
      
      const data = parseAddressCsv(csvText);
      
      if (data.length === 0) {
        throw new Error('No valid address data found in fallback source');
      }
      
      return data;
      
    } catch (fallbackError) {
      console.error('❌ Both primary and fallback failed');
      throw new Error(`Failed to fetch address data: ${primaryError.message}. Fallback also failed: ${fallbackError.message}`);
    }
  }
}
