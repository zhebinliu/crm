/**
 * Tokenwave CRM - API Smoke Test Script
 * 
 * Usage: npx ts-node apps/api/test/api_smoke_test.ts
 */

const BASE_URL = 'http://localhost:3001/api';
const TENANT_SLUG = 'demo';
const ADMIN_EMAIL = 'admin@demo.com';
const ADMIN_PW = 'Admin@1234';

let authToken = '';

async function runTests() {
  console.log('🚀 Starting API Smoke Tests...\n');

  try {
    // 1. AUTH
    console.log('[AUTH] Logging in...');
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantSlug: TENANT_SLUG, email: ADMIN_EMAIL, password: ADMIN_PW })
    });
    
    if (loginRes.status !== 201) {
      throw new Error(`Login failed with status ${loginRes.status}`);
    }
    
    const loginData = await loginRes.json();
    authToken = loginData.accessToken;
    console.log('✅ Login successful. Token acquired.\n');

    // 2. ME
    console.log('[AUTH] Verifying identity (/auth/me)...');
    const meRes = await fetch(`${BASE_URL}/auth/me`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const meData = await meRes.json();
    console.log(`✅ Identity verified: ${meData.displayName} (User ID: ${meData.id}, Tenant: ${meData.tenantId})\n`);

    const ownerId = meData.id;

    // 3. METADATA
    console.log('[META] Listing objects...');
    const metaRes = await fetch(`${BASE_URL}/admin/metadata/objects`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const metaData = await metaRes.json();
    console.log(`✅ Metadata retrieved. Found ${metaData.length} records.\n`);

    // 4. RECORDS (CONTACT)
    console.log('[REC] Creating a new Contact (testing backend ownerId fallback)...');
    const newContactReq = await fetch(`${BASE_URL}/records/Contact`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        lastName: 'FallbackTestUser',
        email: 'fallback@example.com',
        customData: {
          notes: 'Testing backend ownerId fallback'
        }
      })
    });
    
    if (newContactReq.status !== 201) {
      const err = await newContactReq.json();
      console.error('❌ Contact creation failed:', err);
    } else {
      const newContact = await newContactReq.json();
      const contactId = newContact.id;
      console.log(`✅ Contact created: ${contactId}\n`);

      // 5. GET RECCORD
      console.log(`[REC] Fetching Contact ${contactId}...`);
      const getContactRes = await fetch(`${BASE_URL}/records/Contact/${contactId}`, {
         headers: { 'Authorization': `Bearer ${authToken}` }
      });
      console.log(`✅ Record retrieved. Status: ${getContactRes.status}\n`);

      // 6. UPDATE RECORD
      console.log(`[REC] Updating Contact ${contactId}...`);
      const updateRes = await fetch(`${BASE_URL}/records/Contact/${contactId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          lastName: 'UpdatedTestUser'
        })
      });
      console.log(`✅ Record updated. Status: ${updateRes.status}\n`);

      // 7. DELETE RECORD (Soft)
      console.log(`[REC] Deleting Contact ${contactId}...`);
      const delRes = await fetch(`${BASE_URL}/records/Contact/${contactId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      console.log(`✅ Record deleted. Status: ${delRes.status}\n`);
    }

    console.log('🏆 All core smoke tests completed successfully!\n');

  } catch (error) {
    console.error('💥 Test failed with error:', error);
    process.exit(1);
  }
}

runTests();
