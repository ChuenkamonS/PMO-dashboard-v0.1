// ─────────────────────────────────────────
// views/bulk_import.js — Bulk Excel Import
// Supports: License Monitor, Device Registry, Budget (historical memos)
// Uses SheetJS (xlsx.full.min.js)
// ─────────────────────────────────────────

let _bulkImportTarget = null; // 'license' | 'device' | 'budget'

// ── Trigger file picker ──
function importBulk(target) {
  _bulkImportTarget = target;
  const input = document.getElementById('bulk-import-input');
  input.value = ''; // reset so same file can be re-selected
  input.click();
}

// ── Handle file selected ──
function handleBulkImport(event) {
  const file = event.target.files[0];
  if(!file) return;
  if(typeof XLSX === 'undefined') { alert('SheetJS ยังโหลดไม่เสร็จ กรุณารอสักครู่แล้วลองใหม่'); return; }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      // Try reading normally first, fallback without cellDates if encrypted/error
      let wb;
      try {
        wb = XLSX.read(e.target.result, { type:'array', cellDates:true, sheetStubs:true });
      } catch(e1) {
        try {
          wb = XLSX.read(e.target.result, { type:'array', cellDates:false, sheetStubs:true });
        } catch(e2) {
          throw new Error('ไม่สามารถอ่านไฟล์ได้ — กรุณาใช้ไฟล์ .xlsx ที่ไม่มีการเข้ารหัส (Save As → Excel Workbook)');
        }
      }
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval:'' });

      if(!rows.length) { alert('ไม่พบข้อมูลในไฟล์ Excel'); return; }

      if(_bulkImportTarget === 'license') importLicenses(rows);
      else if(_bulkImportTarget === 'device') importDevices(rows);
      else if(_bulkImportTarget === 'budget') importBudgetMemos(rows);
    } catch(err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการอ่านไฟล์: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

// ── Helpers ──
function parseExcelDate(val) {
  if(!val) return '';
  if(val instanceof Date) return val.toISOString().slice(0,10);
  if(typeof val === 'number') {
    // Excel serial date
    const d = new Date(Math.round((val - 25569)*86400*1000));
    return d.toISOString().slice(0,10);
  }
  const s = String(val).trim();
  if(!s) return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0,10);
}
function strVal(v) { return String(v||'').trim(); }
function numVal(v) { const n = Number(v); return isNaN(n) ? 0 : n; }

// ─────────────────────────────────
// LICENSE IMPORT
// Template columns:
// Name | Vendor | Seats | Price/Month | Owner | Department | Project |
// License Type | Purchase Date | Expiry Date | Billing Freq | Status | Memo Ref | Note
// ─────────────────────────────────
async function importLicenses(rows) {
  const existing = loadManualLicenses();
  const now = new Date().toISOString();
  let added = 0, skipped = 0, updated = 0;
  const changed = [];

  const licenseDateKey = value => {
    const raw = String(value || '').trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const date = new Date(raw);
    if(Number.isNaN(date.getTime())) return raw;
    return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
  };
  const licenseKey = l => [
    l.memoNo, l.name, l.plan, licenseDateKey(l.purchaseDate), licenseDateKey(l.expiry),
  ].map(v => String(v || '').trim().toLowerCase()).join('||');

  rows.forEach(row => {
    const name = strVal(row['Name'] || row['name'] || row['Software Name'] || row['software_name'] || row['ชื่อ Software']);
    if(!name) { skipped++; return; }

    const license = {
      id: crypto.randomUUID(),
      name,
      plan:          strVal(row['Plan'] || row['plan'] || row['Tier'] || row['tier']),
      vendor:        strVal(row['Vendor'] || row['vendor'] || row['ผู้ขาย']),
      seats:         numVal(row['Seats'] || row['seats'] || row['จำนวน']) || 1,
      pricePerMonth: numVal(row['Price/Month'] || row['price_per_month'] || row['ราคา/เดือน']),
      owner:         strVal(row['Owner'] || row['owner'] || row['ผู้รับผิดชอบ']),
      department:    strVal(row['Department'] || row['department'] || row['แผนก']),
      project:       strVal(row['Project'] || row['project'] || row['โครงการ']),
      licenseType:   strVal(row['License Type'] || row['license_type'] || 'subscription'),
      purchaseDate:  parseExcelDate(row['Purchase Date'] || row['purchase_date'] || row['วันที่ซื้อ']),
      expiry:        (() => {
        const d = parseExcelDate(row['Expiry Date'] || row['expiry_date'] || row['วันหมดอายุ']);
        return d ? new Date(d+'T00:00:00').toISOString() : null;
      })(),
      billingFreq:   strVal(row['Billing Freq'] || row['billing_freq']),
      statusOverride: (() => {
        const s = strVal(row['Status'] || row['status'] || '').toLowerCase();
        return ['cancelled','suspended'].includes(s) ? s : null;
      })(),
      memoNo:        strVal(row['Memo Ref'] || row['memo_ref'] || row['เลข Memo']),
      note:          strVal(row['Note'] || row['note'] || row['หมายเหตุ']),
      source:        'manual',
      createdAt:     now,
      updatedAt:     now,
    };
    const matchIdx = existing.findIndex(item => licenseKey(item) === licenseKey(license));
    if(matchIdx >= 0) {
      const refreshed = {
        ...existing[matchIdx],
        ...license,
        id: existing[matchIdx].id,
        createdAt: existing[matchIdx].createdAt || now,
      };
      existing[matchIdx] = refreshed;
      changed.push(refreshed);
      updated++;
    } else {
      existing.push(license);
      changed.push(license);
      added++;
    }
  });

  storeManualLicenses(existing);
  await Promise.all(changed.map(license => saveLicenseAsync(license)));
  renderLicense();
  alert(`✓ Import สำเร็จ\nAdded ${added} · Updated ${updated} · Skipped ${skipped}`);
}

// ─────────────────────────────────
// DEVICE IMPORT
// Template columns:
// PBX Number | OS | Type | Brand / Model | Asset ACC | Serial | Assignee |
// Position | Project | Received date | QA Owner | Remark | OS version
// ─────────────────────────────────
async function importDevices(rows) {
  const existing = loadDevices();
  const now = new Date().toISOString();
  let added = 0, skipped = 0, updated = 0;
  const changed = [];

  rows.forEach(row => {
    const name = strVal(row['Brand / Model'] || row['Name'] || row['name'] || row['Device Name']);
    if(!name) { skipped++; return; }

    const typeRaw = strVal(row['Type'] || row['type']).toLowerCase();
    const typeMap = { 'mobile':'mobile', 'mobile phone':'mobile', 'laptop':'laptop', 'tablet':'tablet', 'other':'other' };
    const type = typeMap[typeRaw] || 'other';

    const osRaw = strVal(row['OS'] || row['os'] || '').toLowerCase();
    const platMap = { 'ios':'ios', 'android':'android', 'huawei':'huawei', 'windows':'windows' };
    const platform = platMap[osRaw] || 'other';

    const device = {
      id: crypto.randomUUID(),
      name, type, platform,
      brand:        strVal(row['Brand / Model'] || ''),
      pbxNumber:    strVal(row['PBX Number'] || row['pbx_number'] || ''),
      assetTag:     strVal(row['Asset ACC'] || row['Asset IT'] || row['Asset Tag'] || ''),
      serial:       strVal(row['Serial'] || row['Serial No'] || ''),
      owner:        strVal(row['Assignee'] || row['Owner'] || ''),
      position:     strVal(row['Position'] || ''),
      project:      strVal(row['Project'] || ''),
      assignedDate: parseExcelDate(row['Received date'] || row['Assigned Date'] || ''),
      qaOwner:      strVal(row['QA Owner'] || ''),
      updatedAt:    now,
      note:         strVal(row['Remark'] || row['Note'] || ''),
      osVersion:    strVal(row['OS version'] || row['OS Version'] || ''),
      status:       'not_identified',
      createdAt:    now,
    };
    const dupIdx = typeof findExistingDevice === 'function'
      ? findExistingDevice(existing, device)
      : existing.findIndex(d => {
          if(device.assetTag && d.assetTag && device.assetTag === d.assetTag) return true;
          if(device.serial   && d.serial   && device.serial   === d.serial)   return true;
          return false;
        });

    if(dupIdx >= 0) {
      existing[dupIdx] = { ...existing[dupIdx], ...device, id: existing[dupIdx].id, createdAt: existing[dupIdx].createdAt };
      changed.push(existing[dupIdx]);
      updated++;
    } else {
      existing.push(device);
      changed.push(device);
      added++;
    }
  });

  storeDevices(existing);
  await Promise.all(changed.map(device => saveDeviceAsync(device)));
  renderDevice();
  alert(`✓ Import สำเร็จ\nเพิ่มใหม่ ${added}${updated ? ` · อัปเดตเดิม ${updated}` : ''}${skipped ? `\nข้ามแถวว่าง ${skipped}` : ''} รายการ`);
}

// ─────────────────────────────────
// BUDGET HISTORICAL MEMO IMPORT
// Template columns:
// Memo No | Type | Project | Requester | Approver | Amount | Status | Date | Subject | Reason
// ─────────────────────────────────
function importBudgetMemos(rows) {
  const existing = loadMemos();
  const existingNos = new Set(existing.map(m => m.memoNo));
  const now = new Date().toISOString();
  let added = 0, dupes = 0, skipped = 0;

  const typeMap = { 'sl':'sl','hw':'hw','int':'int','ent':'ent','dep':'dep',
    'software license':'sl','hardware':'hw','team activity':'int',
    'client expense':'ent','deployment':'dep' };
  const TYPE_LABELS = { sl:'Software License', hw:'Hardware', int:'Team Activity', ent:'Client Expense', dep:'Deployment' };

  rows.forEach(row => {
    const memoNo = strVal(row['Memo No'] || row['memo_no'] || row['เลข Memo']);
    if(!memoNo) { skipped++; return; }
    if(existingNos.has(memoNo)) { dupes++; return; }

    const typeRaw = strVal(row['Type'] || row['type'] || row['ประเภท']).toLowerCase();
    const type = typeMap[typeRaw] || 'sl';

    const statusRaw = strVal(row['Status'] || row['status'] || 'completed').toLowerCase();
    const status = ['completed','rejected','pending','cancelled'].includes(statusRaw) ? statusRaw : 'completed';

    const dateStr = parseExcelDate(row['Date'] || row['date'] || row['วันที่']);
    const dateISO = dateStr ? new Date(dateStr+'T00:00:00').toISOString() : now;

    const memo = {
      memoNo,
      type,
      typeLabel: TYPE_LABELS[type] || type.toUpperCase(),
      status,
      project:       strVal(row['Project'] || row['project'] || row['โครงการ']),
      requesterName: strVal(row['Requester'] || row['requester'] || row['ผู้ขอ']),
      reviewerName:  strVal(row['Reviewer'] || row['reviewer'] || '-'),
      approverName:  strVal(row['Approver'] || row['approver'] || row['ผู้อนุมัติ']),
      approvedBy:    strVal(row['Approver'] || row['approver'] || row['ผู้อนุมัติ']),
      total:         numVal(row['Amount'] || row['amount'] || row['วงเงิน']),
      subject:       strVal(row['Subject'] || row['subject'] || row['หัวข้อ']),
      reason:        strVal(row['Reason'] || row['reason'] || row['เหตุผล']),
      date:          dateStr,
      createdAt:     dateISO,
      updatedAt:     dateISO,
      approvedAt:    status === 'completed' ? dateISO : undefined,
      sections:      [],
      auditLog:      [{ actor:'Import', action:'imported from Excel', comment:'Historical data import', timestamp:now }],
      source:        'import',
    };
    existing.push(memo);
    existingNos.add(memoNo);
    added++;
  });

  storeMemos(existing);
  renderBudget();
  let msg = `✓ Import สำเร็จ\nเพิ่ม ${added} memo`;
  if(dupes)   msg += `\nข้าม ${dupes} รายการที่ Memo No ซ้ำ`;
  if(skipped) msg += `\nข้าม ${skipped} แถวว่าง`;
  alert(msg);
}

// ─────────────────────────────────
// DOWNLOAD TEMPLATES
// ─────────────────────────────────
function downloadTemplate(type) {
  if(typeof XLSX === 'undefined') { alert('SheetJS ยังโหลดไม่เสร็จ'); return; }

  const templates = {
    license: {
      filename: 'license_import_template.xlsx',
      headers: ['Name','Plan','Vendor','Seats','Price/Month','Owner','Department','Project','License Type','Purchase Date','Expiry Date','Billing Freq','Status','Memo Ref','Note'],
      sample: [['GitHub Copilot','Business','GitHub',15,600,'Chuen K.','PMO','AOA-MP','subscription','2025-01-01','2026-01-01','annual','','ORB-2501-001',''],
               ['Figma','Professional','Figma Inc',5,900,'Design Lead','Design','Release 3','subscription','2025-03-01','2026-03-01','annual','','','']]
    },
    device: {
      filename: 'device_import_template.xlsx',
      headers: ['PBX Number','OS','Type','Brand / Model','Asset ACC','Serial','Assignee','Position','Project','Received date','QA Owner','Remark','OS version'],
      sample: [['PBX-001','iOS','Mobile','Apple iPhone 15','ACC-001','SN12345','Chuen K.','PMO','AOA-MP','2025-01-15','Best IT','','iOS 17.4.1'],
               ['PBX-002','Windows','Laptop','Dell Latitude 5540','ACC-002','SN67890','Tom P.','Developer','TTB','2025-02-01','Best IT','','Windows 11']]
    },
    budget: {
      filename: 'budget_import_template.xlsx',
      headers: ['Memo No','Type','Project','Requester','Reviewer','Approver','Amount','Status','Date','Subject','Reason'],
      sample: [['ORB-2401-001','sl','AOA-MP','Chuen K.','Nina Review','Phi Wing',108000,'completed','2024-01-15','ขออนุมัติ Software License','เป็นโปรแกรมที่ใช้งานประจำ'],
               ['ORB-2402-001','hw','TTB','Tom P.','Nina Review','Phi Wing',79000,'completed','2024-02-10','ขออนุมัติซื้อ Laptop','เพื่อรองรับทีมงานใหม่']]
    }
  };

  const t = templates[type];
  if(!t) return;

  const ws = XLSX.utils.aoa_to_sheet([t.headers, ...t.sample]);
  // Style header row
  const range = XLSX.utils.decode_range(ws['!ref']);
  for(let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({r:0, c});
    if(!ws[addr]) continue;
    ws[addr].s = { font:{bold:true}, fill:{fgColor:{rgb:'E6F1FB'}} };
  }
  // Column widths
  ws['!cols'] = t.headers.map(() => ({wch:18}));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  if(type === 'device') {
    const instructions = XLSX.utils.aoa_to_sheet([
      ['Device Import Instructions'],
      ['Each row represents one physical device. New devices default to status "not_identified". Condition and Updated Date are not imported.']
    ]);
    instructions['!cols'] = [{wch:110}];
    XLSX.utils.book_append_sheet(wb, instructions, 'Instructions');
  }
  XLSX.writeFile(wb, t.filename);
}
