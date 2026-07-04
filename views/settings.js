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
  signatureUrl: null,
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
  loadSettingsAsync().then(s => {
    renderSettingsUI(s);
    setTimeout(_loadSignaturePreview, 50);
    setTimeout(()=>{ renderUsersTable(); renderAuthorityTable(); }, 100);
  });
}

function renderSettingsUI(s) {
  const TYPE_LABELS = { sl:'Software License (SL)', hw:'Hardware (HW)', int:'Team Activity (INT)', ent:'Client Expense (ENT)', dep:'Deployment (DEP)' };
  const canEdit = typeof isPMO === 'function' && isPMO();

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

    <!-- User Management -->
    <div class="card" style="padding:20px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="font-size:13px;font-weight:700;color:var(--blue)">👥 Users & Approvers <span style="font-size:10px;background:${canEdit?'#FCEBEB':'var(--gray-50)'};color:${canEdit?'#A32D2D':'var(--text-3)'};padding:2px 7px;border-radius:4px;font-weight:400">${canEdit?'PMO Edit':'View Only'}</span></div>
        ${canEdit ? '<button class="btn-sm" onclick="openAddUserModal()" style="font-size:11px">+ เพิ่มผู้ใช้</button>' : ''}
      </div>
      <div id="st-users-list" style="font-size:12px">
        <div style="color:var(--text-3);font-size:11px">กำลังโหลด...</div>
      </div>
    </div>

    <!-- Authority Limits -->
    <div class="card" style="padding:20px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;margin-bottom:14px;color:var(--blue)">💰 วงเงินอนุมัติ (Authority Limits) <span style="font-size:10px;background:#FCEBEB;color:#A32D2D;padding:2px 7px;border-radius:4px;font-weight:400">PMO Only</span></div>
      <div style="font-size:11px;color:var(--text-3);margin-bottom:10px">วงเงินที่ระบุใน PDF Memo ดึงจากตารางนี้ · แก้ไขแล้วกด "บันทึก Authority" เพื่อ update Supabase</div>
      <div id="st-authority-list">
        <div style="color:var(--text-3);font-size:11px">กำลังโหลด...</div>
      </div>
      <div style="text-align:right;margin-top:12px">
        <button class="btn-primary" onclick="saveAuthorityLimits()" style="font-size:12px">💾 บันทึก Authority</button>
      </div>
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

    <!-- Signature Upload -->
    <div class="card" style="padding:20px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;margin-bottom:6px;color:var(--blue)">✍️ ลายเซ็นของฉัน</div>

      <!-- ชื่อในระบบ Memo — critical field -->
      <div style="background:var(--amber-50,#fffbeb);border:1px solid var(--amber,#d97706);border-radius:var(--r-sm);padding:10px 14px;margin-bottom:16px">
        <div style="font-size:12px;font-weight:600;color:var(--amber,#d97706);margin-bottom:4px">⚠️ ชื่อในระบบ Memo (สำคัญมาก)</div>
        <div style="font-size:11px;color:var(--text-3);margin-bottom:8px">เลือกหรือพิมพ์ชื่อที่ใช้ในช่อง Approver ตอนสร้าง Memo — ต้องตรงทุกตัวอักษร</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input type="text" id="sig-memo-name" list="sig-memo-name-list"
            placeholder="พิมพ์หรือเลือกชื่อ..."
            value="${esc(loadSettings().sigMemoName || '')}"
            style="flex:1;min-width:180px;font-family:inherit;font-size:12px;padding:6px 10px;border:1px solid var(--border-md);border-radius:var(--r-sm);background:var(--surface)">
          <datalist id="sig-memo-name-list">
            ${(() => {
              const names = new Set();
              // From default settings
              const s2 = loadSettings();
              if (s2.defaultReviewer?.name) names.add(s2.defaultReviewer.name);
              if (s2.defaultApprover?.name) names.add(s2.defaultApprover.name);
              // From all memo approvers in history
              if (typeof loadMemos === 'function') {
                loadMemos().forEach(m => {
                  (m.approvers || []).forEach(a => { if (a.name && a.name !== '-') names.add(a.name); });
                  if (m.reviewerName && m.reviewerName !== '-') names.add(m.reviewerName);
                  if (m.approverName && m.approverName !== '-') names.add(m.approverName);
                });
              }
              return [...names].sort().map(n => `<option value="${esc(n)}">`).join('');
            })()}
          </datalist>
          <button class="btn-sm" onclick="saveSigMemoName()" style="font-size:12px;white-space:nowrap">💾 บันทึกชื่อ</button>
        </div>
        <div style="font-size:11px;margin-top:6px">
          ${loadSettings().sigMemoName
            ? `<span style="color:var(--green,#16a34a)">✓ ชื่อที่ใช้: <strong>${esc(loadSettings().sigMemoName)}</strong></span>`
            : `<span style="color:var(--red,#dc2626)">❌ ยังไม่ได้ตั้งชื่อ — signature จะไม่ปรากฏใน PDF</span>`}
        </div>
      </div>

      <!-- Signature image -->
      <div style="font-size:11px;color:var(--text-3);margin-bottom:10px">แนะนำ PNG พื้นหลังโปร่งใส · กว้าง 300–500px · สูง 80–120px · ไม่เกิน 500KB</div>
      <div style="display:flex;align-items:flex-start;gap:20px;flex-wrap:wrap">
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--text-2);margin-bottom:6px">ลายเซ็นปัจจุบัน</div>
          <div id="sig-current-preview" style="width:200px;height:80px;border:1px dashed var(--border-md);border-radius:var(--r-sm);display:flex;align-items:center;justify-content:center;background:var(--bg)">
            <span style="font-size:11px;color:var(--text-3)">กำลังโหลด...</span>
          </div>
        </div>
        <div style="flex:1;min-width:220px">
          <div style="font-size:11px;font-weight:600;color:var(--text-2);margin-bottom:6px">อัปโหลดลายเซ็นใหม่</div>
          <input type="file" id="sig-upload-input" accept="image/png,image/jpeg,image/jpg"
            style="font-size:12px;color:var(--text-2);margin-bottom:8px"
            onchange="handleSignatureUpload(this)">
          <div id="sig-upload-preview" style="margin-top:6px"></div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn-primary" onclick="saveMySignature()" style="font-size:12px">💾 บันทึกลายเซ็น</button>
            <button class="btn-sm" id="sig-delete-btn" style="color:var(--red);font-size:12px;display:none" onclick="deleteMySignature()">✕ ลบลายเซ็น</button>
          </div>
        </div>
      </div>
    </div>    </div>
  </div>`;
  if (!canEdit) {
    document.querySelectorAll('#view-settings input, #view-settings select, #view-settings textarea, #view-settings button')
      .forEach(el => { el.disabled = true; });
  }
}

// ── Actions ──

// ══════════════════════════════════════════════════════════════════
// USER MANAGEMENT (PMO only) — reads/writes user_profiles in Supabase
// ══════════════════════════════════════════════════════════════════

// Load and render users table in settings
async function renderUsersTable() {
  const container = document.getElementById('st-users-list');
  if(!container) return;
  const canEdit = typeof isPMO === 'function' && isPMO();
  await loadUserProfilesAsync();
  const users = _userProfilesCache || [];
  if(!users.length){ container.innerHTML='<div style="color:var(--text-3)">ยังไม่มีผู้ใช้</div>'; return; }
  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:var(--bg)">
        <th style="padding:6px 10px;text-align:left;border-bottom:1px solid var(--border)">ชื่อ-นามสกุล</th>
        <th style="padding:6px 10px;text-align:left;border-bottom:1px solid var(--border)">ตำแหน่ง</th>
        <th style="padding:6px 10px;text-align:center;border-bottom:1px solid var(--border)">A1 Review</th>
        <th style="padding:6px 10px;text-align:center;border-bottom:1px solid var(--border)">A2/A3 Approve</th>
        <th style="padding:6px 10px;text-align:center;border-bottom:1px solid var(--border)">PMO</th>
        <th style="padding:6px 10px;text-align:center;border-bottom:1px solid var(--border)">Active</th>
        <th style="padding:6px 10px;border-bottom:1px solid var(--border)">Email</th>
        <th style="padding:6px 10px;border-bottom:1px solid var(--border)"></th>
      </tr></thead>
      <tbody>
        ${users.map((u,i)=>`
          <tr style="${i%2===0?'':'background:var(--bg)'}">
            <td style="padding:7px 10px;border-bottom:1px solid var(--border)">${esc(u.full_name)}</td>
            <td style="padding:7px 10px;border-bottom:1px solid var(--border)">${esc(u.title||'')}</td>
            <td style="padding:7px 10px;border-bottom:1px solid var(--border);text-align:center">
              <input type="checkbox" data-uid="${u.id}" data-field="can_review" ${(u.can_review??u.is_approver)?'checked':''} onchange="toggleUserField(this)" ${canEdit?'':'disabled'}>
            </td>
            <td style="padding:7px 10px;border-bottom:1px solid var(--border);text-align:center">
              <input type="checkbox" data-uid="${u.id}" data-field="can_approve" ${(u.can_approve??u.is_approver)?'checked':''} onchange="toggleUserField(this)" ${canEdit?'':'disabled'}>
            </td>
            <td style="padding:7px 10px;border-bottom:1px solid var(--border);text-align:center">
              <input type="checkbox" data-uid="${u.id}" data-field="is_pmo" ${u.is_pmo?'checked':''} onchange="toggleUserField(this)" ${canEdit?'':'disabled'}>
            </td>
            <td style="padding:7px 10px;border-bottom:1px solid var(--border);text-align:center">
              <input type="checkbox" data-uid="${u.id}" data-field="is_active" ${u.is_active!==false?'checked':''} onchange="toggleUserField(this)" ${canEdit?'':'disabled'}>
            </td>
            <td style="padding:7px 10px;border-bottom:1px solid var(--border);color:var(--text-3)">${esc(u.email||'')}</td>
            <td style="padding:7px 10px;border-bottom:1px solid var(--border)">
              ${canEdit ? `<button class="btn-sm" onclick="openEditUserModal(${u.id})" style="font-size:11px;padding:2px 8px">✎</button>
              ${u.is_active!==false ? `<button class="btn-sm" onclick="deactivateUser(${u.id},'${esc(u.full_name)}')" style="font-size:11px;padding:2px 6px;color:var(--red);margin-left:4px">Deactivate</button>` : ''}` : '<span style="font-size:10px;color:var(--text-3)">View only</span>'}
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

async function toggleUserField(cb) {
  if (!(typeof isPMO === 'function' && isPMO())) { cb.checked = !cb.checked; alert('View only — เฉพาะ PMO เท่านั้นที่แก้ไขได้'); return; }
  const uid   = Number(cb.dataset.uid);
  const field = cb.dataset.field;
  const val   = cb.checked;
  try {
    await supaFetch('user_profiles','PATCH',{[field]:val},`?id=eq.${uid}`);
    // Update cache
    if(_userProfilesCache){ const u=_userProfilesCache.find(u=>u.id===uid); if(u) u[field]=val; }
    refreshApproverDropdowns && refreshApproverDropdowns();
  } catch(e){ alert('บันทึกไม่สำเร็จ: '+e.message); cb.checked=!val; }
}

function openAddUserModal() {
  if (!(typeof isPMO === 'function' && isPMO())) { alert('เฉพาะ PMO เท่านั้นที่เพิ่มผู้ใช้ได้'); return; }
  _openUserModal(null);
}
function openEditUserModal(uid) {
  if (!(typeof isPMO === 'function' && isPMO())) { alert('เฉพาะ PMO เท่านั้นที่แก้ไขผู้ใช้ได้'); return; }
  const u = (_userProfilesCache||[]).find(u=>u.id===uid);
  _openUserModal(u);
}
function _openUserModal(user) {
  const existing = document.getElementById('user-edit-modal');
  if(existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'user-edit-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:400;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = `
    <div class="card" style="width:480px;max-width:95vw;padding:24px;max-height:90vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <span style="font-size:15px;font-weight:600">${user?'แก้ไขผู้ใช้':'เพิ่มผู้ใช้ใหม่'}</span>
        <button class="btn-sm" onclick="document.getElementById('user-edit-modal').remove()">✕</button>
      </div>
      <div class="fg" style="margin-bottom:10px">
        <label style="font-size:11px;font-weight:600">ชื่อ-นามสกุลเต็ม (ภาษาไทย) *</label>
        <input id="um-fullname" class="ri" style="margin-top:4px" value="${esc(user?.full_name||'')}" placeholder="เช่น นาย สมชาย ใจดี">
      </div>
      <div class="fg" style="margin-bottom:10px">
        <label style="font-size:11px;font-weight:600">ตำแหน่ง *</label>
        <input id="um-title" class="ri" style="margin-top:4px" value="${esc(user?.title||'')}" placeholder="เช่น ผู้อำนวยการโครงการ">
      </div>
      <div class="fg" style="margin-bottom:10px">
        <label style="font-size:11px;font-weight:600">ชื่อแทน / Alias (คั่นด้วย |)</label>
        <input id="um-aliases" class="ri" style="margin-top:4px" value="${esc((user?.name_aliases||[]).join(' | '))}" placeholder="เช่น สมชาย | Somchai">
      </div>
      <div class="fg" style="margin-bottom:10px">
        <label style="font-size:11px;font-weight:600">Email</label>
        <input id="um-email" class="ri" type="email" style="margin-top:4px" value="${esc(user?.email||'')}" placeholder="name@orbitdigital.co.th">
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px">
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
          <input type="checkbox" id="um-can-review" ${(user?.can_review??user?.is_approver)?'checked':''}> เป็น A1 Reviewer
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
          <input type="checkbox" id="um-can-approve" ${(user?.can_approve??user?.is_approver)?'checked':''}> เป็น A2/A3 Approver
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
          <input type="checkbox" id="um-is-pmo" ${user?.is_pmo?'checked':''}> เป็น PMO
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
          <input type="checkbox" id="um-is-active" ${user?.is_active!==false?'checked':''}> Active
        </label>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button class="btn-ghost" onclick="document.getElementById('user-edit-modal').remove()">ยกเลิก</button>
        <button class="btn-primary" onclick="saveUserFromModal(${user?.id||'null'})">💾 บันทึก</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e=>{ if(e.target===modal) modal.remove(); });
}

async function saveUserFromModal(uid) {
  if (!(typeof isPMO === 'function' && isPMO())) { alert('เฉพาะ PMO เท่านั้นที่บันทึกผู้ใช้ได้'); return; }
  const fullName = document.getElementById('um-fullname')?.value.trim();
  const title    = document.getElementById('um-title')?.value.trim();
  if(!fullName||!title){ alert('กรุณากรอกชื่อ-นามสกุล และตำแหน่ง'); return; }
  const aliasRaw = document.getElementById('um-aliases')?.value.trim();
  const aliases  = aliasRaw ? aliasRaw.split('|').map(s=>s.trim()).filter(Boolean) : [];
  const payload  = {
    full_name:   fullName, title,
    name_aliases: aliases,
    email:       document.getElementById('um-email')?.value.trim()||null,
    can_review:  document.getElementById('um-can-review')?.checked||false,
    can_approve: document.getElementById('um-can-approve')?.checked||false,
    is_approver: (document.getElementById('um-can-review')?.checked||false) ||
                 (document.getElementById('um-can-approve')?.checked||false),
    is_pmo:      document.getElementById('um-is-pmo')?.checked||false,
    is_active:   document.getElementById('um-is-active')?.checked!==false,
    updated_at:  new Date().toISOString(),
  };
  try {
    if(uid) {
      await supaFetch('user_profiles','PATCH',payload,`?id=eq.${uid}`);
    } else {
      await supaFetch('user_profiles','POST',payload,'?on_conflict=full_name');
    }
    _userProfilesCache = null; // bust cache
    await loadUserProfilesAsync();
    document.getElementById('user-edit-modal')?.remove();
    renderUsersTable();
    if(typeof refreshApproverDropdowns==='function') refreshApproverDropdowns();
    alert('✓ บันทึกผู้ใช้เรียบร้อย');
  } catch(e){ alert('บันทึกไม่สำเร็จ: '+e.message); }
}

async function deactivateUser(uid, name) {
  if (!(typeof isPMO === 'function' && isPMO())) { alert('เฉพาะ PMO เท่านั้นที่ deactivate ผู้ใช้ได้'); return; }
  if(!confirm(`Deactivate ผู้ใช้ "${name}"?\nผู้ใช้นี้จะหายจาก Approver dropdown แต่ข้อมูลเดิมจะยังอยู่`)) return;
  try {
    await supaFetch('user_profiles','PATCH',{is_active:false,updated_at:new Date().toISOString()},`?id=eq.${uid}`);
    _userProfilesCache = null;
    await loadUserProfilesAsync();
    renderUsersTable();
    if(typeof refreshApproverDropdowns==='function') refreshApproverDropdowns();
    alert('✓ Deactivate ผู้ใช้เรียบร้อย');
  } catch(e){ alert('Deactivate ไม่สำเร็จ: '+e.message); }
}

// ── Authority Limits UI ────────────────────────────────────────
const MEMO_TYPES_AUTHORITY = ['sl','hw','int','ent','dep'];
const MEMO_TYPE_LABELS_AUTH = {sl:'SL',hw:'HW',int:'INT',ent:'ENT',dep:'DEP'};

async function renderAuthorityTable() {
  const container = document.getElementById('st-authority-list');
  if(!container) return;
  const canEdit = typeof isPMO === 'function' && isPMO();
  container.innerHTML = '<div style="color:var(--text-3);font-size:11px">กำลังโหลด...</div>';
  // Always reload fresh from Supabase when opening settings
  _authorityCache = null;
  await loadAuthorityAsync();
  const rows = _authorityCache||[];
  // Group by title
  const byTitle = {};
  rows.forEach(r=>{ if(!byTitle[r.title]) byTitle[r.title]={}; byTitle[r.title][r.memo_type]=Number(r.limit_thb)||0; });
  const titles = Object.keys(byTitle);
  if(!titles.length){ container.innerHTML='<div style="color:var(--text-3)">ยังไม่มีข้อมูล authority limits</div>'; return; }
  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="background:var(--bg)">
        <th style="padding:6px 10px;text-align:left;border-bottom:1px solid var(--border)">ตำแหน่ง</th>
        ${MEMO_TYPES_AUTHORITY.map(t=>`<th style="padding:6px 8px;text-align:center;border-bottom:1px solid var(--border)">${MEMO_TYPE_LABELS_AUTH[t]}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${titles.map((title,i)=>`
          <tr style="${i%2===0?'':'background:var(--bg)'}">
            <td style="padding:6px 10px;border-bottom:1px solid var(--border);font-weight:500">${esc(title)}</td>
            ${MEMO_TYPES_AUTHORITY.map(t=>`
              <td style="padding:4px 6px;border-bottom:1px solid var(--border)">
                <input type="number" class="ri auth-limit-input" data-title="${esc(title)}" data-type="${t}"
                  value="${byTitle[title][t]||0}" min="0"
                  style="font-size:11px;padding:3px 6px;text-align:right;width:80px"
                  ${canEdit?'':'disabled'}
                  ${t==='int'?'title="INT ไม่ใช้ authority limit — ค่า 0 คือ N/A"':''}>
              </td>`).join('')}
          </tr>`).join('')}
      </tbody>
    </table>
    <div style="font-size:10px;color:var(--text-3);margin-top:8px">0 = ตำแหน่งนี้ไม่มีสิทธิ์อนุมัติ type นั้น · INT = ไม่ระบุวงเงินใน Policy</div>`;
}

async function saveAuthorityLimits() {
  if (!(typeof isPMO === 'function' && isPMO())) { alert('View only — เฉพาะ PMO เท่านั้นที่แก้ไขได้'); return; }
  const inputs = document.querySelectorAll('.auth-limit-input');
  if(!inputs.length){ alert('ไม่พบข้อมูล'); return; }
  const updates = Array.from(inputs).map(inp=>({
    title:     inp.dataset.title,
    memo_type: inp.dataset.type,
    limit_thb: Number(inp.value)||0,
  }));
  try {
    // Upsert each row
    await Promise.all(updates.map(u=>supaFetch('authority_limits','POST',u,'?on_conflict=title,memo_type')));
    _authorityCache = null;
    await loadAuthorityAsync();
    alert('✓ บันทึก Authority Limits เรียบร้อย');
  } catch(e){ alert('บันทึกไม่สำเร็จ: '+e.message); }
}

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
  if (!(typeof isPMO === 'function' && isPMO())) { alert('View only — เฉพาะ PMO เท่านั้นที่แก้ไขได้'); return; }
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
    'hist-project', 'lic-project',
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
    } else if(['hist-project','dev-filter-project'].includes(id)) {
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
  _loadSignaturePreview(); // load current user signature preview async
  return s;
}

// ── Signature management ──────────────────────────────
let _pendingSignatureDataUrl = null;

function handleSignatureUpload(input) {
  const file = input.files[0];
  const preview = document.getElementById('sig-upload-preview');
  if (!file) { _pendingSignatureDataUrl = null; if(preview) preview.innerHTML = ''; return; }
  if (file.size > 500 * 1024) {
    if(preview) { preview.innerHTML = '<span style="font-size:11px;color:var(--red)">⚠ ไฟล์ใหญ่เกิน 500KB — โปรดบีบอัดก่อน</span>'; }
    input.value = '';
    _pendingSignatureDataUrl = null;
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    _pendingSignatureDataUrl = e.target.result;
    if (preview) {
      preview.innerHTML = `
        <div style="font-size:11px;color:var(--text-3);margin-bottom:4px">ตัวอย่าง:</div>
        <div style="border:1px solid var(--border);border-radius:var(--r-sm);padding:4px;background:var(--bg);display:inline-block">
          <img src="${e.target.result}" style="max-width:200px;max-height:70px;object-fit:contain">
        </div>`;
    }
  };
  reader.readAsDataURL(file);
}

// Load current user's signature into the preview after render
function _loadSignaturePreview() {
  const box    = document.getElementById('sig-current-preview');
  const delBtn = document.getElementById('sig-delete-btn');
  if (!box) return;
  // Use sigMemoName if set, otherwise fallback to currentUser()
  const s = loadSettings();
  const lookupName = s.sigMemoName?.trim() || currentUser();
  loadUserSignatureAsync(lookupName).then(dataUrl => {
    if (dataUrl) {
      box.innerHTML = `<img src="${dataUrl}" style="max-width:190px;max-height:72px;object-fit:contain">`;
      if (delBtn) delBtn.style.display = '';
    } else {
      box.innerHTML = '<span style="font-size:11px;color:var(--text-3)">ยังไม่มีลายเซ็น</span>';
    }
  });
}

async function saveSigMemoName() {
  if (!(typeof isPMO === 'function' && isPMO())) { alert('View only — เฉพาะ PMO เท่านั้นที่แก้ไขได้'); return; }
  const nameEl = document.getElementById('sig-memo-name');
  const name = nameEl?.value?.trim();
  if (!name) { alert('กรุณาระบุชื่อก่อน'); return; }
  const s = loadSettings();
  s.sigMemoName = name;
  await saveSettingsAsync(s);
  alert('✓ บันทึกชื่อ "' + name + '" แล้ว — ลายเซ็นจะปรากฏเมื่อชื่อนี้เป็น Approver ใน PDF');
  renderSettings();
}

async function saveMySignature() {
  if (!(typeof isPMO === 'function' && isPMO())) { alert('View only — เฉพาะ PMO เท่านั้นที่แก้ไขได้'); return; }
  if (!_pendingSignatureDataUrl) { alert('กรุณาเลือกไฟล์ลายเซ็นก่อน'); return; }
  const s = loadSettings();
  const memoName = s.sigMemoName?.trim();
  if (!memoName) {
    alert('กรุณาตั้ง "ชื่อในระบบ Memo" ก่อนบันทึกลายเซ็น\n\nชื่อต้องตรงกับชื่อที่กรอกในช่อง Approver ตอนสร้าง Memo');
    return;
  }
  // Save under BOTH sidebar name (for _loadSignaturePreview) and memoName (for PDF matching)
  await saveUserSignatureAsync(memoName, _pendingSignatureDataUrl);
  if (memoName !== currentUser()) {
    await saveUserSignatureAsync(currentUser(), _pendingSignatureDataUrl);
  }
  // Update cache for both
  if (typeof _sigCache !== 'undefined') {
    _sigCache[memoName]      = _pendingSignatureDataUrl;
    _sigCache[currentUser()] = _pendingSignatureDataUrl;
  }
  _pendingSignatureDataUrl = null;
  alert('✓ บันทึกลายเซ็นสำหรับ "' + memoName + '" เรียบร้อย');
  renderSettings();
}

async function deleteMySignature() {
  if (!(typeof isPMO === 'function' && isPMO())) { alert('View only — เฉพาะ PMO เท่านั้นที่แก้ไขได้'); return; }
  if (!confirm('ลบลายเซ็นของ ' + currentUser() + ' ออกจากระบบ?')) return;
  await deleteUserSignatureAsync(currentUser());
  _sigCache[currentUser()] = null;
  alert('✓ ลบลายเซ็นเรียบร้อย');
  renderSettings();
}

// Keep old functions as aliases (backward compat)
async function saveSignature() { return saveMySignature(); }
async function deleteSignature() { return deleteMySignature(); }

// Helper: get current user's signature URL (used by PDF generation in future)
function getCurrentSignatureUrl() {
  return loadSettings().signatureUrl || null;
}

// ── Per-user signature (keyed by user name) ──────────────────────
function _sigKey(name) {
  // Use the exact name as key — spaces are fine in localStorage and Supabase data field
  // We handle URL encoding separately in the fetch query
  return 'sig-' + (name || currentUser()).trim();
}

async function loadUserSignatureAsync(name) {
  const key = _sigKey(name);
  // Try localStorage first (fastest, no network)
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.signatureDataUrl) return parsed.signatureDataUrl;
    }
  } catch(e) {}
  // Fallback: Supabase — encode key for URL safety
  if (await checkSupa()) {
    try {
      const rows = await supaFetch('settings', 'GET', null,
        `?id=eq.${encodeURIComponent(key)}`);
      if (rows && rows.length) {
        const dataUrl = rows[0].data?.signatureDataUrl || null;
        if (dataUrl) {
          try { localStorage.setItem(key, JSON.stringify({ signatureDataUrl: dataUrl })); } catch(e) {}
        }
        return dataUrl;
      }
    } catch(e) {}
  }
  return null;
}

async function saveUserSignatureAsync(name, dataUrl) {
  const key = _sigKey(name);
  // 1. localStorage cache first (always works, instant)
  try { localStorage.setItem(key, JSON.stringify({ signatureDataUrl: dataUrl })); } catch(e) {}
  // 2. Invalidate in-memory cache so PDF uses new signature immediately
  if (typeof _sigCache !== 'undefined') _sigCache[name] = dataUrl;
  // 3. Supabase (async — fire and forget but log errors)
  if (await checkSupa()) {
    try {
      await supaFetch('settings', 'POST',
        { id: key, data: { signatureDataUrl: dataUrl }, updated_at: new Date().toISOString() },
        '?on_conflict=id');
    } catch(e) { console.warn('Signature save to Supabase failed:', e.message); }
  }
}

async function deleteUserSignatureAsync(name) {
  const key = _sigKey(name);
  try { localStorage.removeItem(key); } catch(e) {}
  if (typeof _sigCache !== 'undefined') _sigCache[name] = null;
  if (await checkSupa()) {
    try { await supaFetch('settings', 'DELETE', null, `?id=eq.${encodeURIComponent(key)}`); } catch(e) {}
  }
}

// Cache for signature data URLs (loaded at PDF time)
const _sigCache = {};

async function _preloadSignatures(approvers) {
  if (typeof loadUserProfilesAsync === 'function') await loadUserProfilesAsync();
  // Dedup by name, keeping one approver entry (for its profileId) per name
  const byName = new Map();
  (approvers||[]).forEach(a => { if (a && a.name && !byName.has(a.name)) byName.set(a.name, a); });

  await Promise.all([...byName.entries()].map(async ([name, a]) => {
    if (_sigCache[name] !== undefined) return;
    let sig = await loadUserSignatureAsync(name);
    // The memo records the approver's exact assigned name, but a user may have
    // saved their signature in Settings under a different alias/spelling of the
    // same profile. Resolve via the same profileId/alias identity the rest of
    // the app uses (findUserByName) and retry under those known names.
    if (!sig) {
      const profile = (a.profileId != null && typeof _userProfilesCache !== 'undefined' && _userProfilesCache)
        ? _userProfilesCache.find(u => Number(u.id) === Number(a.profileId))
        : (typeof findUserByName === 'function' ? findUserByName(name) : null);
      if (profile) {
        const candidates = [profile.full_name, ...(profile.name_aliases||[])].filter(n => n && n !== name);
        for (const cand of candidates) {
          sig = await loadUserSignatureAsync(cand);
          if (sig) break;
        }
      }
    }
    _sigCache[name] = sig;
  }));
}

function getSignatureFromCache(name) {
  return _sigCache[name] || null;
}
