// Milestone 3B — Device Logic: PO creation from structured hwItems (with legacy
// HTML fallback), Purchase Order / Device Registry arrival flow, Device/PO
// audit logging, and Device Registry soft delete.
//
// Loads app.js then views/device.js into the same VM context (mirroring
// index.html's real script load order and tests/license.test.js's pattern)
// so device.js's references to app.js globals (currentUser, checkSupa,
// supaFetch, esc, shortDate, voidMemoAsync, memoHasIrreversibleDownstreamRecords)
// resolve exactly as they do in the browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const deviceCode = fs.readFileSync(path.join(root, 'views/device.js'), 'utf8');

const DEVICE_STORAGE_KEY = 'orbit-pmo-devices-v1'; // mirrors views/device.js's DEVICE_KEY

// Minimal HTML-table parser standing in for the browser's DOMParser — just
// enough to support createPurchaseOrdersFromMemo()'s legacy HTML-scrape
// fallback path against test-authored fixture markup. Not a general parser;
// it only understands <tbody><tr><td>...</td></tr></tbody>.
class FakeDOMParser {
  parseFromString(html) {
    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    const scope = tbodyMatch ? tbodyMatch[1] : html;
    const rows = [...scope.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(rm => {
      const cells = [...rm[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map(cm => ({ textContent: cm[1].trim() }));
      return { querySelectorAll: sel => sel === 'td' ? cells : [] };
    });
    return { querySelectorAll: sel => sel === 'tbody tr' ? rows : [] };
  }
}

function createDeviceContext() {
  const storage = new Map();
  const userButton = { dataset: { profileId: '3', isPmo: 'true' } };
  const elements = {
    'sb-user-btn': userButton,
    'sb-uname': { textContent: 'PMO Admin' },
    'sb-urole': { textContent: 'PMO' },
  };
  // Lazily auto-vivify any DOM id not explicitly seeded — device.js's render
  // functions (_renderDeviceTable, renderDeviceSummaries, etc.) touch many
  // ids we don't care about asserting on; a generic reusable stub keeps them
  // from throwing without enumerating every element by hand.
  const getElementById = id => {
    if (!elements[id]) {
      elements[id] = { value:'', style:{}, textContent:'', innerHTML:'', dataset:{}, appendChild(){}, click(){}, remove(){} };
    }
    return elements[id];
  };
  const context = {
    console, Date, Intl, URL, Blob, AbortController,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    alert: () => {}, confirm: () => true, prompt: () => null,
    DOMParser: FakeDOMParser,
    fetch: async () => ({ ok:true, text: async () => '[]', blob: async () => new Blob() }),
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    document: {
      getElementById,
      // val() (app.js) reads filter dropdowns via document.querySelector('#id')
      // rather than getElementById — resolve simple #id selectors through the
      // same auto-vivifying element map so filter-dependent code under test
      // (e.g. _filteredDevices()) sees values set via getElementById(id).value.
      querySelector: sel => (typeof sel === 'string' && sel.startsWith('#')) ? getElementById(sel.slice(1)) : null,
      querySelectorAll: () => [],
      createElement: () => ({ style:{}, click(){}, remove(){}, appendChild(){} }),
      body: { appendChild(){}, removeChild(){}, classList: { add(){}, remove(){} } },
      addEventListener: () => {},
    },
    window: {},
    location: { reload(){} },
  };
  context.window = context; // so `window._x = ...` (if any) lands on context too
  vm.createContext(context);
  vm.runInContext(appCode, context, { filename: 'app.js' });
  vm.runInContext(deviceCode, context, { filename: 'views/device.js' });
  // Default to offline/local-only persistence — tests that specifically
  // exercise the Supabase retry/fallback pattern override checkSupa/supaFetch.
  context.checkSupa = async () => false;
  return {
    context,
    storage,
    userButton,
    setForm: values => { Object.entries(values).forEach(([id, v]) => { elements[id] = { value: v }; }); },
  };
}

// ══════════════════════════════════════════════════════════════════
// Task 1 — PO creation from structured hwItems, with legacy HTML fallback
// ══════════════════════════════════════════════════════════════════

test('createPurchaseOrdersFromMemo creates one PO per structured hwItems line', () => {
  const { context } = createDeviceContext();
  const memo = {
    type: 'hw', status: 'completed', memoNo: 'HW-100', project: 'AOA-MP',
    hwItems: [{ name: 'Laptop', price: 30000, qty: 2 }, { name: 'Monitor', price: 5000, qty: 3 }],
  };
  context.createPurchaseOrdersFromMemo(memo);
  const pos = context.loadPurchaseOrders();
  assert.equal(pos.length, 2);
  const laptop = pos.find(p => p.itemName === 'Laptop');
  const monitor = pos.find(p => p.itemName === 'Monitor');
  assert.equal(laptop.orderedQty, 2);
  assert.equal(monitor.orderedQty, 3);
  assert.equal(laptop.memoNo, 'HW-100');
  assert.equal(laptop.status, 'pending_order');
});

test('createPurchaseOrdersFromMemo prefers hwItems and ignores the legacy HTML section when both are present', () => {
  const { context } = createDeviceContext();
  const memo = {
    type: 'hw', status: 'completed', memoNo: 'HW-101', project: 'AOA-MP',
    hwItems: [{ name: 'Keyboard', price: 1000, qty: 1 }],
    sections: [{ title: 'รายการ Hardware', html: '<table><tbody><tr><td>1</td><td>Should Not Be Used</td><td>1</td><td>99</td></tr></tbody></table>' }],
  };
  context.createPurchaseOrdersFromMemo(memo);
  const pos = context.loadPurchaseOrders();
  assert.equal(pos.length, 1);
  assert.equal(pos[0].itemName, 'Keyboard');
});

test('createPurchaseOrdersFromMemo falls back to legacy HTML scraping when hwItems is missing (memo predates the Memo Detail Restore hotfix)', () => {
  const { context } = createDeviceContext();
  const memo = {
    type: 'hw', status: 'completed', memoNo: 'HW-102', project: 'Geo9',
    sections: [{ title: 'รายการ Hardware', html:
      '<table><thead><tr><th>#</th><th>ชื่ออุปกรณ์</th><th>ราคา/ชิ้น</th><th>จำนวน</th><th>รวม</th></tr></thead>' +
      '<tbody><tr><td>1</td><td>Legacy Laptop</td><td>30000</td><td>4</td><td>120000</td></tr></tbody></table>' }],
  };
  context.createPurchaseOrdersFromMemo(memo);
  const pos = context.loadPurchaseOrders();
  assert.equal(pos.length, 1);
  assert.equal(pos[0].itemName, 'Legacy Laptop');
  assert.equal(pos[0].orderedQty, 4);
  assert.equal(pos[0].memoNo, 'HW-102');
});

test('createPurchaseOrdersFromMemo falls back to legacy HTML scraping when hwItems is an empty array', () => {
  const { context } = createDeviceContext();
  const memo = {
    type: 'hw', status: 'completed', memoNo: 'HW-103', project: 'Geo9', hwItems: [],
    sections: [{ title: 'รายการ Hardware', html: '<table><tbody><tr><td>1</td><td>Empty hwItems Laptop</td><td>10000</td><td>2</td></tr></tbody></table>' }],
  };
  context.createPurchaseOrdersFromMemo(memo);
  const pos = context.loadPurchaseOrders();
  assert.equal(pos.length, 1);
  assert.equal(pos[0].itemName, 'Empty hwItems Laptop');
});

test('createPurchaseOrdersFromMemo dedupes by memoNo + item name and does not recreate an existing PO', () => {
  const { context } = createDeviceContext();
  const memo = { type: 'hw', status: 'completed', memoNo: 'HW-104', project: 'AOA-MP', hwItems: [{ name: 'Laptop', price: 30000, qty: 2 }] };
  context.createPurchaseOrdersFromMemo(memo);
  context.createPurchaseOrdersFromMemo(memo); // simulate the two independent app.js call sites both firing
  assert.equal(context.loadPurchaseOrders().length, 1, 'dedup by memoNo + itemName must prevent a duplicate PO');
});

test('createPurchaseOrdersFromMemo creates a separate PO for each line item even when two lines share the same item name', () => {
  const { context } = createDeviceContext();
  const memo = {
    type: 'hw', status: 'completed', memoNo: 'HW-106', project: 'AOA-MP',
    hwItems: [
      { name: 'iPhone 13', price: 25000, qty: 3 },
      { name: 'iPhone 13', price: 27000, qty: 2 },
    ],
  };
  context.createPurchaseOrdersFromMemo(memo);
  const pos = context.loadPurchaseOrders().filter(p => p.memoNo === 'HW-106');
  assert.equal(pos.length, 2, 'both duplicate-named lines must each produce their own PO');
  assert.deepEqual(Array.from(pos.map(p => p.orderedQty)).sort(), [2, 3], 'neither line\'s quantity may be dropped');
  assert.equal(new Set(pos.map(p => p.id)).size, 2, 'each PO must have a unique id, not a collision on memoNo+itemName');

  // Re-running (simulating the two independent app.js call sites both firing) must still dedupe
  // per-line, not recreate or drop either PO.
  context.createPurchaseOrdersFromMemo(memo);
  assert.equal(context.loadPurchaseOrders().filter(p => p.memoNo === 'HW-106').length, 2);
});

test('createPurchaseOrdersFromMemo does nothing for a non-hw memo or a memo not yet completed', () => {
  const { context } = createDeviceContext();
  context.createPurchaseOrdersFromMemo({ type: 'sl', status: 'completed', memoNo: 'SL-1', hwItems: [{ name: 'x', qty: 1 }] });
  context.createPurchaseOrdersFromMemo({ type: 'hw', status: 'pending', memoNo: 'HW-105', hwItems: [{ name: 'x', qty: 1 }] });
  assert.equal(context.loadPurchaseOrders().length, 0);
});

// ══════════════════════════════════════════════════════════════════
// Task 4 — Partial arrival / Device Registry creation per physical unit
// ══════════════════════════════════════════════════════════════════

test('markArrived: 5 ordered -> 3 arrive -> 2 arrive later (SYSTEM_STATE_MACHINE.md §8 example)', async () => {
  const { context } = createDeviceContext();
  context.storePurchaseOrders([{
    id: 'po-500', memoNo: 'HW-500', project: 'AOA-MP', itemName: 'Laptop',
    orderedQty: 5, arrivedQty: 0, status: 'awaiting', note: '',
    createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
  }]);

  await context.markArrived('po-500', 3, ['SN1', 'SN2', 'SN3']);
  let po = context.loadPurchaseOrders().find(p => p.id === 'po-500');
  assert.equal(po.arrivedQty, 3);
  assert.equal(po.status, 'partial_arrived');
  let devices = context.loadDevices().filter(d => d.memoNo === 'HW-500');
  assert.equal(devices.length, 3, 'one device record per physical unit arrived');
  assert.deepEqual(Array.from(devices, d => d.serial).sort(), ['SN1', 'SN2', 'SN3']);

  await context.markArrived('po-500', 2, ['SN4', 'SN5']);
  po = context.loadPurchaseOrders().find(p => p.id === 'po-500');
  assert.equal(po.arrivedQty, 5);
  assert.equal(po.status, 'fulfilled');
  devices = context.loadDevices().filter(d => d.memoNo === 'HW-500');
  assert.equal(devices.length, 5, 'all 5 physical units now have device records');
});

test('markArrived clamps arrival quantity to the remaining balance', async () => {
  const { context } = createDeviceContext();
  context.storePurchaseOrders([{ id: 'po-501', memoNo: 'HW-501', itemName: 'Monitor', orderedQty: 2, arrivedQty: 0, status: 'awaiting' }]);
  await context.markArrived('po-501', 10, ['SN1', 'SN2']); // over-reported arrival
  const po = context.loadPurchaseOrders().find(p => p.id === 'po-501');
  assert.equal(po.arrivedQty, 2);
  assert.equal(po.status, 'fulfilled');
  assert.equal(context.loadDevices().filter(d => d.memoNo === 'HW-501').length, 2);
});

test('markArrived refuses to run on a PO that is not awaiting/partial_arrived', async () => {
  const { context } = createDeviceContext();
  context.storePurchaseOrders([{ id: 'po-502', memoNo: 'HW-502', itemName: 'Laptop', orderedQty: 1, arrivedQty: 0, status: 'pending_order' }]);
  await context.markArrived('po-502', 1, ['SN1']);
  const po = context.loadPurchaseOrders().find(p => p.id === 'po-502');
  assert.equal(po.arrivedQty, 0, 'no arrival should be recorded for a PO still pending_order');
  assert.equal(context.loadDevices().length, 0);
});

// ══════════════════════════════════════════════════════════════════
// Task 2 — Device / PO audit logging
// ══════════════════════════════════════════════════════════════════

test('markArrived writes an audit entry on the PO and on each newly created device', async () => {
  const { context } = createDeviceContext();
  context.storePurchaseOrders([{ id: 'po-600', memoNo: 'HW-600', itemName: 'Tablet', orderedQty: 2, arrivedQty: 0, status: 'awaiting' }]);
  await context.markArrived('po-600', 2, ['SN1', 'SN2']);

  const po = context.loadPurchaseOrders().find(p => p.id === 'po-600');
  const poEntry = po.auditLog.at(-1);
  assert.equal(poEntry.action, 'Marked arrived');
  assert.equal(poEntry.statusBefore, 'awaiting');
  assert.equal(poEntry.statusAfter, 'fulfilled');
  assert.ok(poEntry.actor);
  assert.ok(poEntry.timestamp);

  const devices = context.loadDevices().filter(d => d.memoNo === 'HW-600');
  assert.equal(devices.length, 2);
  devices.forEach(d => {
    const entry = d.auditLog.at(-1);
    assert.equal(entry.action, 'Created from PO arrival');
    assert.match(entry.comment, /po-600/);
  });
});

test('advancePOStatus writes a statusBefore/statusAfter audit entry', () => {
  const { context } = createDeviceContext();
  context.storePurchaseOrders([{ id: 'po-601', memoNo: 'HW-601', itemName: 'Router', orderedQty: 1, arrivedQty: 0, status: 'pending_order' }]);
  context.advancePOStatus('po-601', 'ordered');
  const po = context.loadPurchaseOrders().find(p => p.id === 'po-601');
  const entry = po.auditLog.at(-1);
  assert.equal(entry.action, 'Status changed');
  assert.equal(entry.statusBefore, 'pending_order');
  assert.equal(entry.statusAfter, 'ordered');
});

test('saveDevice() (manual Add) writes a Created audit entry', () => {
  const { context, setForm } = createDeviceContext();
  setForm({ 'dev-name': 'Test Phone', 'dev-serial': 'SN-NEW-1', 'dev-status': 'available' });
  context.saveDevice();
  const device = context.loadDevices().find(d => d.name === 'Test Phone');
  assert.ok(device);
  assert.equal(device.auditLog.length, 1);
  assert.equal(device.auditLog[0].action, 'Created');
  assert.ok(device.auditLog[0].actor);
});

test('saveDevice() (manual Edit) writes an Edited audit entry and preserves prior history', () => {
  const { context, setForm } = createDeviceContext();
  setForm({ 'dev-name': 'Edit Target', 'dev-serial': 'SN-EDIT-1' });
  context.saveDevice();
  const created = context.loadDevices().find(d => d.name === 'Edit Target');

  setForm({ 'dev-edit-id': created.id, 'dev-name': 'Edit Target', 'dev-serial': 'SN-EDIT-1', 'dev-status': 'in-use' });
  context.saveDevice();
  const updated = context.loadDevices().find(d => String(d.id) === String(created.id));
  assert.equal(updated.auditLog.length, 2);
  assert.equal(updated.auditLog[0].action, 'Created');
  assert.equal(updated.auditLog[1].action, 'Edited');
  assert.equal(updated.auditLog[1].statusAfter, 'in-use');
});

test('saveDeviceAsync retries without audit_log when Supabase schema cache returns PGRST204 (new device / POST path)', async () => {
  const { context } = createDeviceContext();
  const payloads = [];
  context.checkSupa = async () => true;
  context.supaFetch = async (_table, _method, body) => {
    payloads.push(body);
    if (payloads.length === 1) {
      const error = new Error('PGRST204 Could not find the audit_log column in the schema cache');
      error.code = 'PGRST204';
      throw error;
    }
    return [{ id: 123 }];
  };
  const device = { id: 'dev-schema-1', name: 'Schema Lag Phone', serial: 'SN-SCHEMA-1', auditLog: [{ action: 'Created', actor: 'x', timestamp: 't' }] };
  await context.saveDeviceAsync(device);
  assert.equal(payloads.length, 2);
  assert.ok(Array.isArray(payloads[0].audit_log));
  assert.equal(Object.hasOwn(payloads[1], 'audit_log'), false);
});

test('savePurchaseOrderAsync retries without audit_log when Supabase schema cache returns PGRST204 (update path)', async () => {
  const { context } = createDeviceContext();
  const payloads = [];
  context.checkSupa = async () => true;
  context.supaFetch = async (table, method, body) => {
    if (table === 'purchase_orders' && method === 'GET') return [{ id: 'po-schema-1' }]; // existing row -> PATCH branch
    payloads.push(body);
    if (payloads.length === 1) {
      const error = new Error('PGRST204 Could not find the audit_log column in the schema cache');
      error.code = 'PGRST204';
      throw error;
    }
    return [body];
  };
  const po = { id: 'po-schema-1', memoNo: 'HW-800', itemName: 'Laptop', orderedQty: 1, arrivedQty: 0, status: 'ordered', auditLog: [{ action: 'Status changed', actor: 'x', timestamp: 't' }] };
  await context.savePurchaseOrderAsync(po);
  assert.equal(payloads.length, 2);
  assert.ok(Array.isArray(payloads[0].audit_log));
  assert.equal(Object.hasOwn(payloads[1], 'audit_log'), false);
});

test('saveDeviceAsync does not block local persistence on an unrelated Supabase failure', async () => {
  const { context } = createDeviceContext();
  context.checkSupa = async () => true;
  context.supaFetch = async () => { throw new Error('PGRST204 Could not find a different column in the schema cache'); };
  const device = { id: 'dev-fail-1', name: 'Should still save locally', auditLog: [] };
  await context.saveDeviceAsync(device); // device.js's existing convention: warn, never throw, to the caller
  assert.ok(context.loadDevices().find(d => d.id === 'dev-fail-1'));
});

// ══════════════════════════════════════════════════════════════════
// Task 3 — Device Registry soft delete
// ══════════════════════════════════════════════════════════════════

test('deleteDeviceAsync soft-deletes: device disappears from loadDevices() but stays in persistence', async () => {
  const { context, storage, setForm } = createDeviceContext();
  setForm({ 'dev-name': 'Delete Me', 'dev-serial': 'SN-DEL-1' });
  context.saveDevice();
  const created = context.loadDevices().find(d => d.name === 'Delete Me');
  assert.ok(created);

  await context.deleteDeviceAsync(created.id);

  assert.equal(context.loadDevices().find(d => String(d.id) === String(created.id)), undefined, 'soft-deleted device must disappear from the normal read path');

  const raw = JSON.parse(storage.get(DEVICE_STORAGE_KEY));
  const rawRecord = raw.find(d => String(d.id) === String(created.id));
  assert.ok(rawRecord, 'soft-deleted device must remain in persistence, not physically removed');
  assert.equal(rawRecord.deleted, true);
  assert.ok(rawRecord.deletedAt);
  assert.equal(rawRecord.deletedBy, 'PMO Admin');
  assert.equal(rawRecord.auditLog.at(-1).action, 'Deleted');
});

test('deleteDeviceAsync retries without audit_log on PGRST204 but still persists the delete flag remotely', async () => {
  const { context, setForm } = createDeviceContext();
  setForm({ 'dev-name': 'Schema Lag Delete', 'dev-serial': 'SN-SCHEMA-DEL' });
  context.saveDevice();
  const created = context.loadDevices().find(d => d.name === 'Schema Lag Delete');
  created._supaId = 999; // simulate a device already synced to Supabase

  const payloads = [];
  context.checkSupa = async () => true;
  context.supaFetch = async (_table, _method, body) => {
    payloads.push(body);
    if (payloads.length === 1) {
      const error = new Error('PGRST204 Could not find the audit_log column in the schema cache');
      error.code = 'PGRST204';
      throw error;
    }
    return [body];
  };
  await context.deleteDeviceAsync(created.id);
  assert.equal(payloads.length, 2);
  assert.equal(payloads[0].deleted, true);
  assert.ok(Array.isArray(payloads[0].audit_log));
  assert.equal(Object.hasOwn(payloads[1], 'audit_log'), false);
  assert.equal(payloads[1].deleted, true, 'the retry must still carry the deleted flag, dropping only audit_log');
});

test("a soft-deleted device's serial number can be reused by a new device", async () => {
  const { context, setForm } = createDeviceContext();
  setForm({ 'dev-name': 'Old Phone', 'dev-serial': 'SN-REUSE-1' });
  context.saveDevice();
  const original = context.loadDevices().find(d => d.name === 'Old Phone');
  await context.deleteDeviceAsync(original.id);

  setForm({ 'dev-edit-id': '', 'dev-name': 'New Phone', 'dev-serial': 'SN-REUSE-1' });
  context.saveDevice(); // must NOT be flagged as a duplicate of the soft-deleted original

  const active = context.loadDevices();
  assert.equal(active.length, 1, 'the soft-deleted original must not appear alongside the new device');
  assert.equal(active[0].name, 'New Phone');
  assert.equal(active[0].serial, 'SN-REUSE-1');
});

test('a soft-deleted device does not block the memo Void downstream guard', async () => {
  const { context } = createDeviceContext();
  vm.runInContext(`_memCache = [${JSON.stringify({
    memoNo: 'HW-700', type: 'hw', status: 'completed',
    requesterProfileId: 3, requesterName: 'PMO Admin', approvers: [], auditLog: [],
  })}]`, context);
  context.storeDevices([{ id: 'dev-700', memoNo: 'HW-700', deleted: true, deletedAt: '2026-07-03T00:00:00.000Z', deletedBy: 'PMO Admin', auditLog: [] }]);

  const result = await context.voidMemoAsync('HW-700', 'no longer needed');
  assert.equal(result.ok, true);
  assert.equal(result.memo.status, 'voided');
});

test('an active (non-deleted) memo-linked device still blocks the memo Void downstream guard', async () => {
  const { context } = createDeviceContext();
  vm.runInContext(`_memCache = [${JSON.stringify({
    memoNo: 'HW-701', type: 'hw', status: 'completed',
    requesterProfileId: 3, requesterName: 'PMO Admin', approvers: [], auditLog: [],
  })}]`, context);
  context.storeDevices([{ id: 'dev-701', memoNo: 'HW-701', deleted: false, auditLog: [] }]);

  const result = await context.voidMemoAsync('HW-701', 'reason');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'downstream_blocked');
});

// ══════════════════════════════════════════════════════════════════
// Post-3B acceptance review — device delete UI refresh, delete scope, and
// Device Registry name mapping after Mark Arrived
// ══════════════════════════════════════════════════════════════════

test('deleteDevice() hides the row immediately, without a stale Supabase re-fetch racing the soft delete back into view', async () => {
  const { context, setForm } = createDeviceContext();
  setForm({ 'dev-name': 'Race Test Phone', 'dev-serial': 'SN-RACE-1' });
  context.saveDevice();
  const created = context.loadDevices().find(d => d.name === 'Race Test Phone');

  context.checkSupa = async () => true;
  context.supaFetch = async (table, method) => {
    if (table === 'devices' && method === 'GET') {
      // Simulates the real-world race: a full-table re-fetch that hasn't yet
      // seen the delete PATCH land server-side would return this device as
      // still active. If deleteDevice() still triggered this async reload
      // path (the pre-fix bug), this stale response would resurrect the
      // device in the local cache/UI.
      return [{ id: created.id, name: created.name, deleted: false, audit_log: [] }];
    }
    return [{}];
  };

  context.deleteDevice(created.id);
  await new Promise(r => setTimeout(r, 20)); // flush the delete's pending async work

  assert.equal(
    context.loadDevices().find(d => String(d.id) === String(created.id)),
    undefined,
    'the device must stay hidden immediately after delete, not reappear from a stale re-fetch'
  );
});

test('deleteDeviceAsync only soft-deletes the selected device, not siblings from the same memo/PO', async () => {
  const { context } = createDeviceContext();
  context.storePurchaseOrders([{ id: 'po-900', memoNo: 'HW-900', itemName: 'Laptop', orderedQty: 3, arrivedQty: 0, status: 'awaiting' }]);
  await context.markArrived('po-900', 3, ['SN1', 'SN2', 'SN3']);
  const siblings = context.loadDevices().filter(d => d.memoNo === 'HW-900');
  assert.equal(siblings.length, 3, 'sanity check: all 3 siblings were created');

  const target = siblings.find(d => d.serial === 'SN2');
  await context.deleteDeviceAsync(target.id);

  const remaining = context.loadDevices().filter(d => d.memoNo === 'HW-900');
  assert.equal(remaining.length, 2, 'only the targeted device should be hidden, not the whole memo/PO batch');
  assert.deepEqual(Array.from(remaining, d => d.serial).sort(), ['SN1', 'SN3']);
  assert.equal(context.loadDevices().find(d => String(d.id) === String(target.id)), undefined);
});

test('_renderDeviceTable() quotes device ids in onclick handlers, so a non-numeric (pre-sync) device id does not break Delete/Edit/View', () => {
  const { context, setForm } = createDeviceContext();
  setForm({ 'dev-name': 'Fresh Unsynced Device', 'dev-serial': 'SN-FRESH-1' });
  context.saveDevice(); // creates a device with a string `dev_...` id, not yet synced to Supabase
  const created = context.loadDevices().find(d => d.name === 'Fresh Unsynced Device');
  assert.equal(typeof created.id, 'string');

  context._renderDeviceTable();
  const rowsHtml = context.document.getElementById('dev-table-body').innerHTML;
  assert.match(rowsHtml, new RegExp(`openDeviceDetail\\('${created.id}'\\)`), 'row click must pass the id as a quoted string');
  assert.match(rowsHtml, new RegExp(`openDeviceModal\\('${created.id}'\\)`), 'Edit button must pass the id as a quoted string');
  assert.match(rowsHtml, new RegExp(`deleteDevice\\('${created.id}'\\)`), 'Delete button must pass the id as a quoted string');
});

test('openDeviceModal() and openDeviceDetail() correctly resolve a device whose id is a non-numeric string, without throwing', () => {
  const { context, setForm } = createDeviceContext();
  setForm({ 'dev-name': 'Lookup Target', 'dev-serial': 'SN-LOOKUP-1' });
  context.saveDevice();
  const created = context.loadDevices().find(d => d.name === 'Lookup Target');

  assert.doesNotThrow(() => context.openDeviceModal(created.id));
  assert.equal(context.document.getElementById('dev-edit-id').value, created.id);

  assert.doesNotThrow(() => context.openDeviceDetail(created.id));
  const detailHtml = context.document.getElementById('dev-detail-modal').innerHTML;
  assert.match(detailHtml, /Lookup Target/);
});

test('a device created via Mark Arrived preserves the item name all the way from memo.hwItems -> PO -> device (never the memo number)', async () => {
  const { context } = createDeviceContext();
  const memo = { type: 'hw', status: 'completed', memoNo: 'HW-950', project: 'AOA-MP', hwItems: [{ name: 'iPhone 13', price: 25000, qty: 1 }] };
  context.createPurchaseOrdersFromMemo(memo);
  const po = context.loadPurchaseOrders().find(p => p.memoNo === 'HW-950');
  assert.equal(po.itemName, 'iPhone 13');
  context.advancePOStatus(po.id, 'awaiting'); // realistic PO lifecycle: pending_order -> ... -> awaiting, then arrive

  await context.markArrived(po.id, 1, ['']); // blank serial, matching the reported scenario
  const device = context.loadDevices().find(d => d.memoNo === 'HW-950');
  assert.ok(device);
  assert.equal(device.name, 'iPhone 13', 'device name must be the hardware item name, not the memo number');
  assert.notEqual(device.name, memo.memoNo);
  assert.equal(device.serial, '', 'a blank serial at arrival is acceptable...');
  assert.equal(device.name, 'iPhone 13', '...but the item/model name must still be correct');
});

test('a device created via Mark Arrived from the legacy HTML fallback also preserves the real item name, not the memo number', async () => {
  const { context } = createDeviceContext();
  const memo = {
    type: 'hw', status: 'completed', memoNo: 'HW-951', project: 'Geo9',
    sections: [{ title: 'รายการ Hardware', html: '<table><thead><tr><th>#</th><th>ชื่ออุปกรณ์</th><th>ราคา/ชิ้น</th><th>จำนวน</th><th>รวม</th></tr></thead><tbody><tr><td>1</td><td>MacBook Pro</td><td>฿60,000</td><td>1</td><td>฿60,000</td></tr></tbody></table>' }],
  };
  context.createPurchaseOrdersFromMemo(memo);
  const po = context.loadPurchaseOrders().find(p => p.memoNo === 'HW-951');
  assert.equal(po.itemName, 'MacBook Pro');
  context.advancePOStatus(po.id, 'awaiting');

  await context.markArrived(po.id, 1, []); // no serial supplied at all
  const device = context.loadDevices().find(d => d.memoNo === 'HW-951');
  assert.equal(device.name, 'MacBook Pro');
  assert.equal(device.serial, '', 'blank serial is acceptable');
  assert.notEqual(device.name, memo.memoNo);
});

test('markArrived falls back to a generic placeholder (never the memo number) if a PO somehow has no itemName', async () => {
  const { context } = createDeviceContext();
  context.storePurchaseOrders([{ id: 'po-952', memoNo: 'HW-952', itemName: '', orderedQty: 1, arrivedQty: 0, status: 'awaiting' }]);
  await context.markArrived('po-952', 1, ['']);
  const device = context.loadDevices().find(d => d.memoNo === 'HW-952');
  assert.ok(device.name, 'device name must never be blank');
  assert.notEqual(device.name, 'HW-952', 'device name must never fall back to the memo number');
});

// ══════════════════════════════════════════════════════════════════
// Functional audit fixes
// ══════════════════════════════════════════════════════════════════

test('openDeviceModal populates "Link HW Memo" from the canonical memoNo field, not the stale/removed memoRef field', () => {
  const { context } = createDeviceContext();
  context.storeDevices([{ id: 'dev-800', name: 'iPhone 13', memoNo: 'HW-800', status: 'available', auditLog: [] }]);
  context.openDeviceModal('dev-800');
  assert.equal(context.document.getElementById('dev-memo-ref').value, 'HW-800');
});

test('saveDevice() edit round-trip preserves memoNo (previously blanked on every edit because the modal read a stale memoRef field)', () => {
  const { context } = createDeviceContext();
  context.storeDevices([{ id: 'dev-801', name: 'iPad', memoNo: 'HW-801', status: 'available', auditLog: [] }]);
  context.openDeviceModal('dev-801'); // populates the edit form, including dev-memo-ref
  context.saveDevice();
  const device = context.loadDevices().find(d => d.id === 'dev-801');
  assert.equal(device.memoNo, 'HW-801', 'editing a device through the modal must not blank its memoNo link');
});

test('a device whose memoNo survives editing still correctly blocks the memo Void downstream guard', async () => {
  const { context } = createDeviceContext();
  vm.runInContext(`_memCache = [${JSON.stringify({
    memoNo: 'HW-802', type: 'hw', status: 'completed',
    requesterProfileId: 3, requesterName: 'PMO Admin', approvers: [], auditLog: [],
  })}]`, context);
  context.storeDevices([{ id: 'dev-802', name: 'iPad', memoNo: 'HW-802', status: 'available', auditLog: [] }]);
  context.openDeviceModal('dev-802');
  context.saveDevice(); // a routine edit (e.g. filling in owner) must not sever the memo link
  const result = await context.voidMemoAsync('HW-802', 'reason');
  assert.equal(result.ok, false, 'the device is still linked to HW-802 after editing, so Void must remain blocked');
});

test('exportDeviceCsv exports only the currently filtered/searched devices, matching the on-screen table (MASTER_SPEC.md Export Rules)', () => {
  const { context } = createDeviceContext();
  context.storeDevices([
    { id: 'dev-900', name: 'Alpha Laptop', project: 'AOA-MP', status: 'available', auditLog: [] },
    { id: 'dev-901', name: 'Beta Laptop', project: 'Geo9', status: 'available', auditLog: [] },
  ]);
  context.document.getElementById('dev-filter-project').value = 'AOA-MP';
  let downloaded = null;
  context._downloadCSV = (name, headers, rows) => { downloaded = { name, headers, rows }; };
  context.exportDeviceCsv();
  assert.ok(downloaded, 'export must produce a CSV');
  assert.equal(downloaded.rows.length, 1, 'export must respect the active project filter, not export every device');
  assert.equal(downloaded.rows[0][3], 'Alpha Laptop');
});

test('markArrived is blocked once the source Hardware memo has been Voided, even though a PO still exists with no arrivals yet', async () => {
  const { context } = createDeviceContext();
  vm.runInContext(`_memCache = [${JSON.stringify({
    memoNo: 'HW-960', type: 'hw', status: 'voided', voidedAt: '2026-07-05T00:00:00.000Z', voidedBy: 'PMO Admin',
  })}]`, context);
  context.storePurchaseOrders([{ id: 'po-960', memoNo: 'HW-960', itemName: 'Laptop', orderedQty: 2, arrivedQty: 0, status: 'awaiting' }]);

  await context.markArrived('po-960', 2, ['SN1', 'SN2']);

  const po = context.loadPurchaseOrders().find(p => p.id === 'po-960');
  assert.equal(po.arrivedQty, 0, 'a voided memo\'s PO must not advance');
  assert.equal(context.loadDevices().filter(d => d.memoNo === 'HW-960').length, 0, 'no new Device Registry records may be created against a voided memo');
});

test('markArrived still works normally for a PO whose source memo is completed (not voided/rejected/cancelled) — no false-positive block', async () => {
  const { context } = createDeviceContext();
  vm.runInContext(`_memCache = [${JSON.stringify({ memoNo: 'HW-961', type: 'hw', status: 'completed' })}]`, context);
  context.storePurchaseOrders([{ id: 'po-961', memoNo: 'HW-961', itemName: 'Monitor', orderedQty: 1, arrivedQty: 0, status: 'awaiting' }]);

  await context.markArrived('po-961', 1, ['SN1']);

  const po = context.loadPurchaseOrders().find(p => p.id === 'po-961');
  assert.equal(po.arrivedQty, 1);
  assert.equal(context.loadDevices().filter(d => d.memoNo === 'HW-961').length, 1);
});

// ══════════════════════════════════════════════════════════════════
// Final Audit Follow-up — Device Registry source memo linkage
// ══════════════════════════════════════════════════════════════════

test('openDeviceModal() makes Link HW Memo read-only and shows View Source Memo for a device created from a PO/Hardware Memo (source: "memo")', () => {
  const { context } = createDeviceContext();
  context.storeDevices([{ id: 'dev-990', name: 'iPhone 13', memoNo: 'HW-990', source: 'memo', status: 'available', auditLog: [] }]);
  context.openDeviceModal('dev-990');
  const memoInput = context.document.getElementById('dev-memo-ref');
  const viewBtn = context.document.getElementById('dev-view-source-memo-btn');
  assert.equal(memoInput.readOnly, true);
  assert.equal(viewBtn.style.display, '');
  assert.equal(viewBtn.dataset.memoNo, 'HW-990');
});

test('openDeviceModal() keeps Link HW Memo editable for a manually-added device and hides View Source Memo', () => {
  const { context } = createDeviceContext();
  context.storeDevices([{ id: 'dev-991', name: 'iPad', memoNo: 'HW-991', source: 'manual', status: 'available', auditLog: [] }]);
  context.openDeviceModal('dev-991');
  const memoInput = context.document.getElementById('dev-memo-ref');
  const viewBtn = context.document.getElementById('dev-view-source-memo-btn');
  assert.equal(memoInput.readOnly, false);
  assert.equal(viewBtn.style.display, 'none');
});

test('opening Add Device (no id) resets Link HW Memo to editable and hides View Source Memo, even right after a prior memo-sourced Edit', () => {
  const { context } = createDeviceContext();
  context.storeDevices([{ id: 'dev-993', name: 'iPhone 13', memoNo: 'HW-993', source: 'memo', status: 'available', auditLog: [] }]);
  context.openDeviceModal('dev-993'); // leaves memo-ref read-only
  context.openDeviceModal(); // Add Device
  const memoInput = context.document.getElementById('dev-memo-ref');
  const viewBtn = context.document.getElementById('dev-view-source-memo-btn');
  assert.equal(memoInput.readOnly, false);
  assert.equal(viewBtn.style.display, 'none');
});

test('saveDevice() preserves source across an edit, so a memo-sourced device does not silently become "manual" and lose its read-only guard', () => {
  const { context } = createDeviceContext();
  context.storeDevices([{ id: 'dev-992', name: 'iPhone 13', memoNo: 'HW-992', source: 'memo', status: 'available', auditLog: [] }]);
  context.openDeviceModal('dev-992');
  context.saveDevice(); // routine re-save (no field changes) must not flip source to 'manual'
  const device = context.loadDevices().find(d => d.id === 'dev-992');
  assert.equal(device.source, 'memo');
  assert.equal(device.memoNo, 'HW-992');
});

// ══════════════════════════════════════════════════════════════════
// Final Audit Follow-up — Voided Hardware Memo downstream PO handling
// ══════════════════════════════════════════════════════════════════

test('voidMemoAsync marks the related Purchase Order as voided_source (never deletes it) and records the void reason on the PO audit trail', async () => {
  const { context } = createDeviceContext();
  vm.runInContext(`_memCache = [${JSON.stringify({
    memoNo: 'HW-970', type: 'hw', status: 'completed',
    requesterProfileId: 3, requesterName: 'PMO Admin', approvers: [], auditLog: [],
  })}]`, context);
  context.storePurchaseOrders([{ id: 'po-970', memoNo: 'HW-970', itemName: 'Laptop', orderedQty: 2, arrivedQty: 0, status: 'awaiting', auditLog: [] }]);

  const result = await context.voidMemoAsync('HW-970', 'wrong vendor pricing');
  assert.equal(result.ok, true);

  const pos = context.loadPurchaseOrders();
  assert.equal(pos.length, 1, 'PO must be preserved, never deleted');
  const po = pos[0];
  assert.equal(po.status, 'voided_source');
  const entry = po.auditLog.at(-1);
  assert.equal(entry.action, 'Voided (source memo voided)');
  assert.equal(entry.comment, 'wrong vendor pricing');
  assert.equal(entry.statusBefore, 'awaiting');
  assert.equal(entry.statusAfter, 'voided_source');
});

test('voidMemoAsync cascades to every open PO for the memo, leaving an unrelated memo\'s fulfilled PO untouched', async () => {
  const { context } = createDeviceContext();
  vm.runInContext(`_memCache = [${JSON.stringify({
    memoNo: 'HW-971', type: 'hw', status: 'completed',
    requesterProfileId: 3, requesterName: 'PMO Admin', approvers: [], auditLog: [],
  })}]`, context);
  context.storePurchaseOrders([
    { id: 'po-971a', memoNo: 'HW-971', itemName: 'Laptop', orderedQty: 2, arrivedQty: 0, status: 'pending_order', auditLog: [] },
    { id: 'po-971b', memoNo: 'HW-971', itemName: 'Monitor', orderedQty: 1, arrivedQty: 0, status: 'ordered', auditLog: [] },
    { id: 'po-other', memoNo: 'HW-999', itemName: 'Keyboard', orderedQty: 1, arrivedQty: 1, status: 'fulfilled', auditLog: [] },
  ]);

  await context.voidMemoAsync('HW-971', 'duplicate request');

  const pos = context.loadPurchaseOrders();
  assert.equal(pos.find(p => p.id === 'po-971a').status, 'voided_source');
  assert.equal(pos.find(p => p.id === 'po-971b').status, 'voided_source');
  assert.equal(pos.find(p => p.id === 'po-other').status, 'fulfilled', "an unrelated memo's PO must not be touched");
});

test('markArrived remains blocked for a PO already flagged voided_source by the void cascade', async () => {
  const { context } = createDeviceContext();
  vm.runInContext(`_memCache = [${JSON.stringify({
    memoNo: 'HW-972', type: 'hw', status: 'voided', voidedAt: '2026-07-05T00:00:00.000Z', voidedBy: 'PMO Admin',
  })}]`, context);
  context.storePurchaseOrders([{ id: 'po-972', memoNo: 'HW-972', itemName: 'Laptop', orderedQty: 1, arrivedQty: 0, status: 'voided_source', auditLog: [] }]);
  await context.markArrived('po-972', 1, ['SN1']);
  const po = context.loadPurchaseOrders().find(p => p.id === 'po-972');
  assert.equal(po.arrivedQty, 0);
  assert.equal(context.loadDevices().filter(d => d.memoNo === 'HW-972').length, 0);
});

// ══════════════════════════════════════════════════════════════════
// Final Audit Follow-up (round 2) — Hardware memo Void rule clarification
// ══════════════════════════════════════════════════════════════════

test('Void rule: a Partial Arrival (partial_arrived PO) implies real Device Registry records, so Void must be blocked end-to-end', async () => {
  const { context } = createDeviceContext();
  vm.runInContext(`_memCache = [${JSON.stringify({
    memoNo: 'HW-980', type: 'hw', status: 'completed',
    requesterProfileId: 3, requesterName: 'PMO Admin', approvers: [], auditLog: [],
  })}]`, context);
  context.storePurchaseOrders([{ id: 'po-980', memoNo: 'HW-980', itemName: 'Laptop', orderedQty: 5, arrivedQty: 0, status: 'awaiting', auditLog: [] }]);

  await context.markArrived('po-980', 3, ['SN1', 'SN2', 'SN3']); // 3 of 5 arrive -> partial_arrived + 3 device records
  const po = context.loadPurchaseOrders().find(p => p.id === 'po-980');
  assert.equal(po.status, 'partial_arrived');
  assert.equal(context.loadDevices().filter(d => d.memoNo === 'HW-980').length, 3);

  const result = await context.voidMemoAsync('HW-980', 'reason');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'downstream_blocked');
  assert.equal(context.loadPurchaseOrders().find(p => p.id === 'po-980').status, 'partial_arrived', 'a blocked void must not cascade/alter the PO');
});

test('Void rule: a fully Fulfilled PO implies real Device Registry records, so Void must be blocked end-to-end', async () => {
  const { context } = createDeviceContext();
  vm.runInContext(`_memCache = [${JSON.stringify({
    memoNo: 'HW-981', type: 'hw', status: 'completed',
    requesterProfileId: 3, requesterName: 'PMO Admin', approvers: [], auditLog: [],
  })}]`, context);
  context.storePurchaseOrders([{ id: 'po-981', memoNo: 'HW-981', itemName: 'Monitor', orderedQty: 2, arrivedQty: 0, status: 'awaiting', auditLog: [] }]);

  await context.markArrived('po-981', 2, ['SN1', 'SN2']); // full arrival -> fulfilled + 2 device records
  assert.equal(context.loadPurchaseOrders().find(p => p.id === 'po-981').status, 'fulfilled');

  const result = await context.voidMemoAsync('HW-981', 'reason');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'downstream_blocked');
  assert.equal(context.loadPurchaseOrders().find(p => p.id === 'po-981').status, 'fulfilled', 'a blocked void must not cascade/alter the PO');
});

test('Void rule: PO-only downstream (no arrivals yet) never blocks Void, and the PO itself cascades to voided_source — the "usually blocked" cases above are specifically about device arrival, not PO existence', async () => {
  const { context } = createDeviceContext();
  vm.runInContext(`_memCache = [${JSON.stringify({
    memoNo: 'HW-982', type: 'hw', status: 'completed',
    requesterProfileId: 3, requesterName: 'PMO Admin', approvers: [], auditLog: [],
  })}]`, context);
  context.storePurchaseOrders([{ id: 'po-982', memoNo: 'HW-982', itemName: 'Laptop', orderedQty: 3, arrivedQty: 0, status: 'ordered', auditLog: [] }]);

  const result = await context.voidMemoAsync('HW-982', 'reason');
  assert.equal(result.ok, true, 'a PO with zero arrivals must never block Void');
  assert.equal(context.loadPurchaseOrders().find(p => p.id === 'po-982').status, 'voided_source');
});

test('Void rule: once the only device(s) tied to a memo are soft-deleted, Void is allowed again (soft-deleted devices never block Void)', async () => {
  const { context } = createDeviceContext();
  vm.runInContext(`_memCache = [${JSON.stringify({
    memoNo: 'HW-983', type: 'hw', status: 'completed',
    requesterProfileId: 3, requesterName: 'PMO Admin', approvers: [], auditLog: [],
  })}]`, context);
  context.storePurchaseOrders([{ id: 'po-983', memoNo: 'HW-983', itemName: 'Tablet', orderedQty: 1, arrivedQty: 0, status: 'awaiting', auditLog: [] }]);

  await context.markArrived('po-983', 1, ['SN1']);
  const device = context.loadDevices().find(d => d.memoNo === 'HW-983');
  assert.ok(device, 'sanity check: arrival created a real device record');

  // Still blocked while the device is active.
  let result = await context.voidMemoAsync('HW-983', 'reason');
  assert.equal(result.ok, false);

  await context.deleteDeviceAsync(device.id); // soft delete — the only real downstream record

  result = await context.voidMemoAsync('HW-983', 'reason');
  assert.equal(result.ok, true, 'a memo whose only device record is soft-deleted must be voidable');
});

// ══════════════════════════════════════════════════════════════════
// Final Audit Follow-up (round 2) — Device Detail -> Edit modal stacking
// ══════════════════════════════════════════════════════════════════

test('Device Detail "Edit" button closes the Detail modal before opening Edit Device, so Edit Device renders on top instead of behind it', () => {
  const { context } = createDeviceContext();
  context.storeDevices([{ id: 'dev-994', name: 'Detail Stack Test', status: 'available', auditLog: [] }]);
  context.openDeviceDetail('dev-994');
  const panelHtml = context.document.getElementById('dev-detail-modal').innerHTML;
  assert.match(
    panelHtml,
    /onclick="document\.getElementById\('dev-detail-modal'\)\.style\.display='none';openDeviceModal\('dev-994'\)"/,
    'Edit button must close the Detail modal (dev-detail-modal) before opening Edit Device (openDeviceModal)'
  );
});
