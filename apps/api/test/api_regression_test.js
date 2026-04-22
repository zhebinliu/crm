const BASE_URL = 'http://localhost:3001/api';

async function testRegression() {
  console.log('🧪 Starting Phase 2: Deep-Dive Regression Tests...\n');

  let adminToken, repToken;

  // 0. AUTH setup
  try {
    const adminLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantSlug: 'demo', email: 'admin@demo.com', password: 'Admin@1234' })
    });
    adminToken = (await adminLogin.json()).accessToken;

    const repLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantSlug: 'demo', email: 'rep@demo.com', password: 'Admin@1234' })
    });
    repToken = (await repLogin.json()).accessToken;

    console.log('✅ Auth tokens acquired for Admin and Rep.\n');
  } catch (e) {
    console.error('❌ Auth failed. Ensure server is running on 3001.\n', e);
    return;
  }

  // 1. RBAC Check (Scenario C)
  console.log('[RBAC] Testing Sales Rep trying to access Admin Metadata...');
  const rbacRes = await fetch(`${BASE_URL}/admin/metadata/objects`, {
    headers: { 'Authorization': `Bearer ${repToken}` }
  });
  if (rbacRes.status === 403) {
    console.log('✅ PASS: Access denied for Sales Rep as expected.\n');
  } else {
    console.log(`❌ FAIL: Expected 403 but got ${rbacRes.status}\n`);
  }

  // 2. Validation Rules (Scenario A)
  console.log('[VALIDATION] Testing vr-opp-amount (Negative value)...');
  const valRes = await fetch(`${BASE_URL}/records/opportunity`, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Invalid Amount Opp',
      amount: -500,
      closeDate: new Date('2026-12-31').toISOString(),
      stage: 'Prospecting'
    })
  });
  const valData = await valRes.json();
  const errors = valData.errors || valData.error?.errors || [];
  if (valRes.status === 400 && errors.some(e => e.message === '商机金额必须大于 0')) {
    console.log('✅ PASS: Validation rule correctly blocked negative amount.\n');
  } else {
    console.log(`❌ FAIL: Expected 400 with validation message, got ${valRes.status}`, JSON.stringify(errors, null, 2), '\n');
  }

  // 3. Workflow Trigger (Scenario B)
  console.log('[WORKFLOW] Testing wf-opp-large-deal (Auto-Task creation)...');
  
  // Find an account first
  const accListRes = await fetch(`${BASE_URL}/records/account`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const accounts = await accListRes.json();
  const accountId = accounts[0]?.id || 'demo-account-1';

  const largeOppName = `Large Deal ${Date.now()}`;
  const body = JSON.stringify({
    name: largeOppName,
    amount: 150000,
    accountId: accountId,
    closeDate: new Date('2026-12-31').toISOString(),
    stage: 'Prospecting'
  });

  const oppRes = await fetch(`${BASE_URL}/records/opportunity`, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body
  });
  const oppData = await oppRes.json();

  if (oppRes.status === 201 || oppRes.status === 200) {
    const oppId = oppData.id;
    console.log(`✅ Record created: ${oppId}. Waiting for background workflow...`);
    
    // Workflows are async (runSync: false in seed). Wait 3s.
    await new Promise(r => setTimeout(r, 3000));

    // Check Activities (Tasks)
    const taskRes = await fetch(`${BASE_URL}/records/activity`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const taskResult = await taskRes.json();
    const tasks = taskResult.data || taskResult; // Handle both paginated and flat array
    const taskFound = tasks.some(t => t.subject === `大单商机跟进 - ${largeOppName}`);
    
    if (taskFound) {
      console.log('✅ PASS: Background task was automatically created by workflow rule.\n');
    } else {
      console.log('❌ FAIL: Automated task not found in Activities.');
      console.log('DEBUG: Last 5 subjects in DB:');
      tasks.slice(0, 5).forEach(t => console.log(`  - "${t.subject}"`));
      console.log('');
    }
  } else {
    const errs = oppData.errors || oppData.error?.errors || [];
    console.log('❌ FAIL: Could not create large opportunity record.', JSON.stringify(errs, null, 2), '\n');
  }

  // 4. Lead Convert (Scenario D)
  console.log('[LOGIC] Testing Lead Conversion (/convert)...');
  // Find an unconverted lead
  const leadListRes = await fetch(`${BASE_URL}/leads?isConverted=false`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const leads = await leadListRes.json();
  const leadId = leads.data?.[0]?.id || 'demo-lead-1';

  const convRes = await fetch(`${BASE_URL}/leads/${leadId}/convert`, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      accountName: 'Converted Mega Corp',
      opportunityInput: { name: 'Converted Opportunity', amount: 50000 }
    })
  });
  const convData = await convRes.json();
  if (convRes.status === 200 && convData.accountId && convData.contactId) {
    console.log('✅ PASS: Lead successfully converted to Account/Contact/Opportunity.\n');
  } else {
    console.log(`❌ FAIL: Lead conversion failed with status ${convRes.status}`, convData, '\n');
  }

  console.log('🏆 Regression Suite Complete.');
}

testRegression();
