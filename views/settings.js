// ─────────────────────────────────────────
// views/settings.js — Form Settings Manager
// Saves to Supabase (table: settings) + localStorage fallback
// ─────────────────────────────────────────

const SETTINGS_KEY = 'orbit-pmo-settings-v1';
const SETTINGS_SUPABASE_ID = 'global';

// ── Default settings ──
const DEFAULT_SETTINGS = {
  projects: ['AOA-MP','TTB','Geo9','Release 2.1','Release 3'],
  company: {
    name: 'บริษัท ออร์บิท ดิจิทัล จำกัด',
    address: '51 ถนนนราธิวาสราชนครินทร์ แขวงสีลม เขตบางรัก กรุงเทพมหานคร',
    shortName: 'Orbit Digital',
  },
  typeCfg: {
    sl:  { to:'ประธานเจ้าหน้าที่บริหาร', apprTitle:'ประธานเจ้าหน้าที่บริหาร',
           reasons:['เป็นโปรแกรมที่ได้รับการอนุมัติและใช้งานอยู่เดิม เพื่อให้การดำเนินโครงการเป็นไปอย่างต่อเนื่องและมีประสิทธิภาพ','เป็นโปรแกรมใหม่ที่จำเป็นต้องใช้เพื่อพัฒนาโครงการ','เพื่ออัปเกรดการใช้งานโปรแกรมให้รองรับการทำงานของทีมที่เพิ่มขึ้น'] },
    hw:  { to:'ประธานเจ้าหน้าที่บริหาร', apprTitle:'ประธานเจ้าหน้าที่บริหาร',
           reasons:['เพื่อใช้ในการพัฒนาและทดสอบระบบของโครงการ','เพื่อทดแทนอุปกรณ์เดิมที่เสื่อมสภาพและไม่สามารถใช้งานได้','เพื่อรองรับการขยายทีมและเพิ่มประสิทธิภาพการทำงาน'] },
    int: { to:'Project director โครงการ', apprTitle:'ผู้อำนวยการโครงการ',
           reasons:['เพื่อเสริมสร้างกำลังใจในการปฏิบัติงาน และส่งเสริมการทำงานเป็นทีม','เพื่อเสริมสร้างความสัมพันธ์ในทีมและพัฒนาการทำงานร่วมกัน'] },
    ent: { to:'ประธานเจ้าหน้าที่บริหาร', apprTitle:'ประธานเจ้าหน้าที่บริหาร',
           reasons:['เพื่อขอบคุณลูกค้าในโครงการ','เพื่อเสริมสร้างความสัมพันธ์กับลูกค้า'] },
    dep: { to:'ผู้อำนวยการโครงการ', apprTitle:'ผู้อำนวยการโครงการ',
           reasons:['เพื่อความละเอียดในการเบิกแยก Online / Onsite','เพื่อสนับสนุนการ Deployment ให้เป็นไปอย่างราบรื่นและมีประสิทธิภาพ'] },
  },
  defaultReviewer: { name:'', title:'ผู้จัดการโครงการ' },
  defaultApprover: { name:'', title:'ประธานเจ้าหน้าที่บริหาร' },
};

// ── Load / Save ──
let _settingsCache = null;

function loadSettings() {
  if(_settingsCache) return _settingsCache;
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null');
    _settingsCache = s ? deepMerge(DEFAULT_SETTINGS, s) : JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  } catch(e) {
    _settingsCache = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
  return _settingsCache;
}

function storeSettings(s) {
  _settingsCache = s;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch(e) {}
}

async function loadSettingsAsync() {
  if(await checkSupa()) {
    try {
      const rows = await supaFetch('settings', 'GET', null, `?id=eq.${SETTINGS_SUPABASE_ID}`);
      if(rows && rows.length) {
        const s = deepMerge(DEFAULT_SETTINGS, rows[0].data);
        storeSettings(s);
        return s;
      }
    } catch(e) { console.warn('Settings load failed', e.message); }
  }
  return loadSettings();
}

async function saveSettingsAsync(s) {
  storeSettings(s);
  if(await checkSupa()) {
    try {
      await supaFetch('settings', 'POST',
        { id: SETTINGS_SUPABASE_ID, data: s, updated_at: new Date().toISOString() },
        '?on_conflict=id');
    } catch(e) { console.warn('Settings save failed', e.message); }
  }
}

function deepMerge(base, override) {
  const result = JSON.parse(JSON.stringify(base));
  for(const key of Object.keys(override||{})) {
    if(typeof result[key] === 'object' && !Array.isArray(result[key]) && result[key] !== null
       && typeof override[key] === 'object' && !Array.isArray(override[key])) {
      result[key] = deepMerge(result[key], override[key]);
    } else if(override[key] !== undefined) {
      result[key] = override[key];
    }
  }
  return result;
}

// ── Render Settings Page ──
function renderSettings() {
  loadSettingsAsync().then(renderSettingsUI);
}

function renderSettingsUI(s) {
  const TYPE_LABELS = { sl:'Software License (SL)', hw:'Hardware (HW)', int:'Team Activity (INT)', ent:'Client Expense (ENT)', dep:'Deployment (DEP)' };

  document.getElementById('view-settings').innerHTML = `
  <div style="max-width:900px;margin:0 auto">

    <!-- Company Info -->
    <div class="card" style="padding:20px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;margin-bottom:14px;color:var(--blue)">🏢 ข้อมูลบริษัท (แสดงใน PDF)</div>
      <div class="form-grid" style="grid-template-columns:1fr 1fr">
        <div class="fg"><label>ชื่อบริษัทเต็ม</label>
          <input id="st-company-name" class="ri" value="${esc(s.company.name)}"></div>
        <div class="fg"><label>ชื่อย่อ / Brand</label>
          <input id="st-company-short" class="ri" value="${esc(s.company.shortName)}"></div>
      </div>
      <div class="fg" style="margin-top:10px"><label>ที่อยู่</label>
        <input id="st-company-addr" class="ri" value="${esc(s.company.address)}"></div>
    </div>

    <!-- Default Reviewer / Approver -->
    <div class="card" style="padding:20px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;margin-bottom:14px;color:var(--blue)">✍️ Reviewer & Approver เริ่มต้น</div>
      <div class="form-grid" style="grid-template-columns:1fr 1fr 1fr 1fr">
        <div class="fg"><label>ชื่อ Reviewer</label>
          <input id="st-rev-name" class="ri" placeholder="ชื่อ-นามสกุล" value="${esc(s.defaultReviewer.name)}"></div>
        <div class="fg"><label>ตำแหน่ง Reviewer</label>
          <input id="st-rev-title" class="ri" value="${esc(s.defaultReviewer.title)}"></div>
        <div class="fg"><label>ชื่อ Approver</label>
          <input id="st-appr-name" class="ri" placeholder="ชื่อ-นามสกุล" value="${esc(s.defaultApprover.name)}"></div>
        <div class="fg"><label>ตำแหน่ง Approver</label>
          <input id="st-appr-title" class="ri" value="${esc(s.defaultApprover.title)}"></div>
      </div>
    </div>

    <!-- Projects -->
    <div class="card" style="padding:20px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:13px;font-weight:700;color:var(--blue)">📁 รายการโครงการ</div>
        <button class="btn-sm" onclick="addSettingsProject()">+ เพิ่มโครงการ</button>
      </div>
      <div id="st-projects-list">
        ${s.projects.map((p,i) => `
          <div class="st-row" data-idx="${i}" style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="cursor:grab;color:var(--text-3);font-size:16px">⠿</span>
            <input class="ri st-project-input" value="${esc(p)}" style="flex:1">
            <button class="btn-sm" style="color:var(--red);padding:3px 8px" onclick="removeSettingsRow(this,'st-projects-list')">✕</button>
          </div>`).join('')}
      </div>
    </div>

    <!-- Per-type settings -->
    ${Object.entries(TYPE_LABELS).map(([type, label]) => `
    <div class="card" style="padding:20px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;margin-bottom:12px;color:var(--blue)">
        <span class="badge ${type==='sl'?'badge-blue':type==='hw'?'badge-gray':type==='int'?'badge-green':type==='ent'?'badge-amber':'badge-purple'}">${type.toUpperCase()}</span>
        &nbsp;${label}
      </div>
      <div class="form-grid" style="grid-template-columns:1fr 1fr;margin-bottom:10px">
        <div class="fg"><label>เรียน (To)</label>
          <input id="st-${type}-to" class="ri" value="${esc(s.typeCfg[type].to)}"></div>
        <div class="fg"><label>ตำแหน่ง Approver</label>
          <input id="st-${type}-apprTitle" class="ri" value="${esc(s.typeCfg[type].apprTitle)}"></div>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <label style="font-size:11px;font-weight:600;color:var(--text-2)">เหตุผล (Reasons)</label>
          <button class="btn-sm" style="font-size:11px" onclick="addSettingsReason('${type}')">+ เพิ่มเหตุผล</button>
        </div>
        <div id="st-${type}-reasons">
          ${s.typeCfg[type].reasons.map((r,i) => `
            <div class="st-row" style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <span style="cursor:grab;color:var(--text-3);font-size:16px">⠿</span>
              <input class="ri st-reason-input" value="${esc(r)}" style="flex:1">
              <button class="btn-sm" style="color:var(--red);padding:3px 8px" onclick="removeSettingsRow(this,'st-${type}-reasons')">✕</button>
            </div>`).join('')}
        </div>
      </div>
    </div>`).join('')}

    <!-- Save button -->
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-bottom:24px">
      <button class="btn-ghost" onclick="renderSettings()">↺ รีเซ็ต</button>
      <button class="btn-primary" onclick="saveSettings()">💾 บันทึก Settings</button>
    </div>
  </div>`;
}

// ── Actions ──
function addSettingsProject() {
  const list = document.getElementById('st-projects-list');
  const idx = list.querySelectorAll('.st-row').length;
  const div = document.createElement('div');
  div.className = 'st-row';
  div.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px';
  div.innerHTML = `<span style="cursor:grab;color:var(--text-3);font-size:16px">⠿</span>
    <input class="ri st-project-input" placeholder="ชื่อโครงการ" style="flex:1">
    <button class="btn-sm" style="color:var(--red);padding:3px 8px" onclick="removeSettingsRow(this,'st-projects-list')">✕</button>`;
  list.appendChild(div);
  div.querySelector('input').focus();
}

function addSettingsReason(type) {
  const list = document.getElementById(`st-${type}-reasons`);
  const div = document.createElement('div');
  div.className = 'st-row';
  div.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px';
  div.innerHTML = `<span style="cursor:grab;color:var(--text-3);font-size:16px">⠿</span>
    <input class="ri st-reason-input" placeholder="กรอกเหตุผล" style="flex:1">
    <button class="btn-sm" style="color:var(--red);padding:3px 8px" onclick="removeSettingsRow(this,'st-${type}-reasons')">✕</button>`;
  list.appendChild(div);
  div.querySelector('input').focus();
}

function removeSettingsRow(btn, listId) {
  const list = document.getElementById(listId);
  if(list.querySelectorAll('.st-row').length > 1) btn.closest('.st-row').remove();
  else alert('ต้องมีอย่างน้อย 1 รายการ');
}

async function saveSettings() {
  const g = id => document.getElementById(id)?.value?.trim()||'';
  const getInputs = (containerId, cls) =>
    Array.from(document.querySelectorAll(`#${containerId} .${cls}`))
      .map(i => i.value.trim()).filter(Boolean);

  const s = {
    company: {
      name: g('st-company-name'),
      shortName: g('st-company-short'),
      address: g('st-company-addr'),
    },
    defaultReviewer: { name: g('st-rev-name'), title: g('st-rev-title') },
    defaultApprover: { name: g('st-appr-name'), title: g('st-appr-title') },
    projects: getInputs('st-projects-list', 'st-project-input'),
    typeCfg: {
      sl:  { to: g('st-sl-to'),  apprTitle: g('st-sl-apprTitle'),  reasons: getInputs('st-sl-reasons',  'st-reason-input') },
      hw:  { to: g('st-hw-to'),  apprTitle: g('st-hw-apprTitle'),  reasons: getInputs('st-hw-reasons',  'st-reason-input') },
      int: { to: g('st-int-to'), apprTitle: g('st-int-apprTitle'), reasons: getInputs('st-int-reasons', 'st-reason-input') },
      ent: { to: g('st-ent-to'), apprTitle: g('st-ent-apprTitle'), reasons: getInputs('st-ent-reasons', 'st-reason-input') },
      dep: { to: g('st-dep-to'), apprTitle: g('st-dep-apprTitle'), reasons: getInputs('st-dep-reasons', 'st-reason-input') },
    },
  };

  if(!s.projects.length) { alert('ต้องมีโครงการอย่างน้อย 1 รายการ'); return; }

  await saveSettingsAsync(s);
  // Reload all project dropdowns
  refreshProjectDropdowns(s.projects);
  alert('✓ บันทึก Settings เรียบร้อย');
}

// ── Refresh all project dropdowns across the app ──
function refreshProjectDropdowns(projects) {
  const projectSelects = [
    'f-project',
    'hist-project', 'bgt-project', 'lic-project',
    'dev-filter-project', 'dev-project',
  ];
  const opts = projects.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
  const optsWithAll = `<option value="all">ทุกโครงการ</option>` + opts;
  const optsWithBlank = `<option value="">— ไม่ระบุ —</option>` + opts;

  projectSelects.forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    const prev = el.value;
    if(id === 'f-project') {
      el.innerHTML = `<option value="">— เลือกโครงการ —</option>` + opts + `<option value="other">อื่นๆ (กรอกเอง)</option>`;
    } else if(['hist-project','bgt-project','dev-filter-project'].includes(id)) {
      el.innerHTML = optsWithAll;
    } else {
      el.innerHTML = optsWithBlank;
    }
    // Restore previous value if still valid
    if([...el.options].some(o => o.value === prev)) el.value = prev;
  });
}

// ── Apply settings to create form ──
function applySettingsToCreateForm(type) {
  const s = loadSettings();
  const cfg = s.typeCfg[type];
  if(!cfg) return;

  // Set "เรียน" field
  const toEl = document.getElementById('f-to');
  if(toEl) toEl.value = cfg.to;

  // Set approver title
  const apprTitleEl = document.getElementById('f-appr-title');
  if(apprTitleEl) apprTitleEl.value = cfg.apprTitle;

  // Populate reasons
  const rs = document.getElementById('f-reason');
  if(rs) {
    rs.innerHTML = '<option value="">— เลือกเหตุผล —</option>';
    cfg.reasons.forEach(r => {
      const o = document.createElement('option');
      o.value = r; o.textContent = r;
      rs.appendChild(o);
    });
    rs.innerHTML += '<option value="other">อื่นๆ (กรอกเอง)</option>';
  }

  // Set default reviewer/approver if fields are empty
  const revName = document.getElementById('f-rev-name-input');
  const revTitle = document.getElementById('f-rev-title-input');
  const apprName = document.getElementById('f-appr-name-input');

  if(revName && !revName.value && s.defaultReviewer.name) revName.value = s.defaultReviewer.name;
  if(revTitle && !revTitle.value) revTitle.value = s.defaultReviewer.title;
  if(apprName && !apprName.value && s.defaultApprover.name) apprName.value = s.defaultApprover.name;
  if(apprTitleEl && !apprTitleEl.value) apprTitleEl.value = s.defaultApprover.title;
}

// ── Init: load settings and apply to dropdowns ──
async function initSettings() {
  const s = await loadSettingsAsync();
  refreshProjectDropdowns(s.projects);
  return s;
}
