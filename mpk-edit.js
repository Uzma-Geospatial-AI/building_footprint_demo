// ============================================================
// MPK KEMAMAN — EDIT A BUILDING AND CHANGE ITS STATUS
// In a building's popup: the pencil edits its details (lot, UPI, area, height, floors, the plan on record,
// a note); the status dropdown (Approved / Illegal / Pending) changes its status, and a change needs a short
// form (reason, reference, officer, date). Edits and status changes are applied over the data every time
// it loads, so the map, the counts and the lists follow them; every change is kept in the building's history.
// Kept in this browser (localStorage), like the registrations.
// ============================================================
const MPK_EDIT = { KEY: 'mpk_edit_v1', s: {}, orig: new WeakMap(), editing: null, lngLat: null, pending: null };
const MPK_EDIT_FIELDS = [
  ['lot', 'Lot no.', 'text'], ['upi', 'UPI', 'text'], ['area_m2', 'Footprint area (m²)', 'number'],
  ['tinggi_m', 'Height (m)', 'number'], ['tingkat_est', 'Floors', 'number'],
  ['pelan_fail', 'Plan on record (file no.)', 'text'], ['pelan_tarikh', 'Approved on', 'date'], ['pelan_status', 'Plan status', 'text'],
  ['pelan_jenis', 'Plan building type', 'text'], ['catatan', 'Note', 'textarea'],
];
const MPK_EDIT_STATUS = {
  legal: { label: 'Approved', kategori: 'lulus' },
  suspected: { label: 'Illegal', kategori: 'manual_haram' },
  unverified: { label: 'Pending', kategori: 'manual_pending' },
};
const MPK_EDIT_REASONS = {
  legal: ['Approved building plan found', 'Building plan registration approved', 'Site inspection: approved', 'Other'],
  suspected: ['Site inspection: no approval', 'Building plan rejected', 'Built beyond the approved plan', 'Encroaches a reserve', 'Other'],
  unverified: ['Records being checked', 'Awaiting site inspection', 'Wrongly classified', 'Other'],
};

function mpkEditLoad() {
  try { const v = JSON.parse(localStorage.getItem(MPK_EDIT.KEY) || '{}'); MPK_EDIT.s = v && typeof v === 'object' ? v : {}; } catch (e) { MPK_EDIT.s = {}; }
}
function mpkEditSave() {
  try { localStorage.setItem(MPK_EDIT.KEY, JSON.stringify(MPK_EDIT.s)); return true; }
  catch (e) { showToast('⚠️ Could not save in this browser: ' + e.message, 5000); return false; }
}
const mpkEditAll = () => MPK.data ? [...MPK.data.buildings.features, ...(MPK.data.others ? MPK.data.others.features : [])] : [];
const mpkEditFeature = id => mpkEditAll().find(f => String(f.properties.id) === String(id));
const mpkEditIsStudy = f => !!(f && f.properties.kawasan);

// Takes every edit off again (the data as built, plus registrations)
function mpkEditUndo() {
  if (!MPK.data) return;
  for (const f of mpkEditAll()) {
    const o = MPK_EDIT.orig.get(f.properties);
    if (!o) continue;
    const p = f.properties;
    for (const [k, v] of Object.entries(o.fields)) { if (v === undefined) delete p[k]; else p[k] = v; }
    if ('kat' in o) p.kategori = o.kat;
    delete p.edit_status; delete p.edited;
  }
  MPK_EDIT.orig = new WeakMap();
}
// Puts the saved edits on the data; skipUndo when the caller has just reset it (mpkDaftarApply)
function mpkEditApply(skipUndo) {
  if (!MPK.data) return;
  if (!skipUndo) mpkEditUndo();
  for (const [id, rec] of Object.entries(MPK_EDIT.s)) {
    const f = mpkEditFeature(id);
    if (!f) continue;
    const p = f.properties, o = { fields: {} };
    for (const [k, v] of Object.entries(rec.fields || {})) {
      o.fields[k] = p[k];
      const type = (MPK_EDIT_FIELDS.find(x => x[0] === k) || [])[2];
      p[k] = type === 'number' && v !== '' ? parseFloat(v) : v;
    }
    if (rec.status && mpkEditIsStudy(f)) {
      o.kat = p.kategori;
      p.kategori = MPK_EDIT_STATUS[rec.status.to].kategori;
      p.edit_status = rec.status.to;
    }
    if (Object.keys(rec.fields || {}).length || rec.status) p.edited = 1;
    MPK_EDIT.orig.set(p, o);
  }
}
function mpkEditRedraw(id) {
  try {
    if (map.getSource('mpk-buildings')) map.getSource('mpk-buildings').setData(MPK.data.buildings);
    if (map.getSource('mpk-other') && MPK.data.others) map.getSource('mpk-other').setData(MPK.data.others);
  } catch (e) {}
  if (typeof mpkRender === 'function') mpkRender();
  if (id != null) mpkEditReopen(id);
}
function mpkEditReopen(id) {
  const f = mpkEditFeature(id);
  if (!f) return;
  const at = MPK_EDIT.lngLat || [f.properties.lng, f.properties.lat];
  if (mpkEditIsStudy(f)) mpkShowPopup(f.properties, at); else mpkShowOtherPopup(f.properties, at);
}

// ---------- Popup: status dropdown, pencil, edit form, history ----------
function mpkEditHeader(p, withStatus) {
  const id = JSON.stringify(String(p.id));
  const st = withStatus ? mpkStatus(p, MPK.settings) : null;
  const jenis = withStatus ? mpkJenis(p, MPK.settings) : null;
  const sub = withStatus ? mpkStatusText(p, jenis).replace(/^(Illegal building|Legal|Pending) · /, '') : '';
  return `<div class="popup-tools">
      ${withStatus ? `<label class="popup-status-wrap" title="Change the status (a short form follows)">
        <select class="popup-status" onchange='mpkEditStatusPick(${id}, this.value, this)' aria-label="Building status">
          ${Object.entries(MPK_EDIT_STATUS).map(([k, v]) => `<option value="${k}"${k === st ? ' selected' : ''}>${v.label}</option>`).join('')}
          ${p.edit_status ? '<option value="restore">↺ Restore status from the records</option>' : ''}
        </select></label>` : ''}
      <button type="button" class="popup-edit${MPK_EDIT.editing === String(p.id) ? ' on' : ''}" title="Edit the details" aria-label="Edit the details"
        onclick='mpkEditStart(${id})'><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
    </div>
    ${sub ? `<div class="popup-fc">${sub}</div>` : ''}`;
}
const mpkEditing = id => MPK_EDIT.editing === String(id);
function mpkEditStart(id) {
  MPK_EDIT.editing = MPK_EDIT.editing === String(id) ? null : String(id);
  mpkEditReopen(id);
}
function mpkEditFormHTML(p) {
  const rec = MPK_EDIT.s[p.id] || {};
  const v = k => { const x = p[k]; return x == null ? '' : mpkEscHtml(String(x)); };
  return `<form class="popup-editform" onsubmit="return false">
      ${MPK_EDIT_FIELDS.map(([k, l, type]) => `<label><span>${l}${(rec.fields || {})[k] !== undefined ? ' <em>edited</em>' : ''}</span>
        ${type === 'textarea' ? `<textarea data-f="${k}" rows="2">${v(k)}</textarea>`
          : `<input data-f="${k}" type="${type === 'date' ? 'date' : 'text'}" ${type === 'number' ? 'inputmode="decimal"' : ''} value="${type === 'date' ? v(k).slice(0, 10) : v(k)}">`}</label>`).join('')}
      <label><span>Edited by <b>*</b></span><input data-f="_by" placeholder="Officer's name" value="${mpkEscHtml(MPK_EDIT.lastBy || '')}"></label>
      <div class="popup-editbtns">
        <button type="button" class="mpk-btn ghost" onclick='mpkEditStart(${JSON.stringify(String(p.id))})'>Cancel</button>
        <button type="button" class="mpk-btn" onclick='mpkEditSaveFields(${JSON.stringify(String(p.id))})'>Save</button>
      </div>
    </form>`;
}
function mpkEditSaveFields(id) {
  const f = mpkEditFeature(id);
  if (!f) return;
  const form = document.querySelector('.popup-editform');
  const by = form.querySelector('[data-f="_by"]').value.trim();
  if (!by) { showToast('⚠️ Enter who is making the change'); form.querySelector('[data-f="_by"]').focus(); return; }
  const p = f.properties, o = MPK_EDIT.orig.get(p) || { fields: {} };
  const rec = MPK_EDIT.s[id] = MPK_EDIT.s[id] || { fields: {}, history: [] };
  rec.fields = rec.fields || {}; rec.history = rec.history || [];
  const changes = [];
  form.querySelectorAll('[data-f]').forEach(el => {
    const k = el.dataset.f;
    if (k === '_by') return;
    const val = el.value.trim(), now = p[k] == null ? '' : String(p[k]);
    const base = k in o.fields ? (o.fields[k] == null ? '' : String(o.fields[k])) : now;
    const cmp = (MPK_EDIT_FIELDS.find(x => x[0] === k) || [])[2] === 'date' ? now.slice(0, 10) : now;
    if (val === cmp) return;
    changes.push([(MPK_EDIT_FIELDS.find(x => x[0] === k) || [k, k])[1], cmp, val]);
    if (val === base) delete rec.fields[k]; else rec.fields[k] = val;
  });
  MPK_EDIT.editing = null;
  if (!changes.length) { mpkEditReopen(id); return; }
  MPK_EDIT.lastBy = by;
  rec.history.unshift({ type: 'fields', at: new Date().toISOString(), by, changes });
  if (!Object.keys(rec.fields).length && !rec.status && !rec.history.length) delete MPK_EDIT.s[id];
  if (!mpkEditSave()) return;
  mpkEditApply();
  showToast(`${p.plus_code}: ${changes.length} detail${changes.length === 1 ? '' : 's'} saved`);
  addActivityLog('Building edited', p.plus_code + ' · ' + by);
  mpkEditRedraw(id);
}
function mpkEditHistoryHTML(p) {
  const h = (MPK_EDIT.s[p.id] || {}).history || [];
  if (!h.length) return '';
  const esc = mpkEscHtml;
  return `<div class="popup-sec">Change history</div><div class="popup-hist">${h.slice(0, 6).map(e => `<div>
      <b>${mpkPlanDateLabel(e.at.slice(0, 10))} · ${esc(e.by)}</b>
      ${e.type === 'status' ? `<span>Status ${esc(e.fromLabel)} → <b>${esc(e.toLabel)}</b> · ${esc(e.reason)}${e.ref ? ' · ref ' + esc(e.ref) : ''}${e.note ? ' · ' + esc(e.note) : ''}</span>`
        : `<span>${e.changes.map(([l, a, b]) => `${esc(l)}: ${esc(a || '—')} → <b>${esc(b || '—')}</b>`).join('; ')}</span>`}
    </div>`).join('')}</div>`;
}

// ---------- Status change, with its form ----------
function mpkEditStatusPick(id, to, sel) {
  const f = mpkEditFeature(id);
  if (!f) return;
  const from = mpkStatus(f.properties, MPK.settings);
  if (sel) sel.value = from;                          // the dropdown changes only once the form is sent
  if (to === from) return;
  MPK_EDIT.pending = { id: String(id), to, from };
  // a new status needs MPK's building plan form (JKB:(KP)1-03), with the change at its top
  if (to !== 'restore' && typeof mpkDaftarOpen === 'function') { mpkDaftarOpen(id, { from, to }); return; }
  let el = document.getElementById('mpk-status-form');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mpk-status-form';
    el.className = 'mpk-dpb-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'mpk-sf-t');
    el.addEventListener('keydown', e => { if (e.key === 'Escape') el.hidden = true; });
    document.body.appendChild(el);
  }
  const p = f.properties, restore = to === 'restore';
  const orig = MPK_EDIT.orig.get(p), origSt = orig && 'kat' in orig ? mpkStatus({ ...p, kategori: orig.kat }, MPK.settings) : from;
  const target = restore ? origSt : to;
  const lab = k => (MPK_EDIT_STATUS[k] || {}).label || k;
  const today = new Date().toISOString().slice(0, 10);
  el.innerHTML = `<div class="mpk-dpb-shell small">
    <div class="mpk-dpb-bar"><div class="mpk-dpb-bar-t"><div id="mpk-sf-t">${restore ? 'Restore the status from the records' : 'Change building status'}</div>
      <small>${mpkEscHtml(p.plus_code)} · ${mpkEscHtml((MPK_AREAS[p.kawasan] || {}).short || '')} · ${mpkNum(p.area_m2)} m²${p.lot ? ' · Lot ' + mpkEscHtml(p.lot) : ''}</small></div>
      <button type="button" class="mpk-dpb-x" onclick="document.getElementById('mpk-status-form').hidden = true" aria-label="Close">×</button></div>
    <div class="mpk-dpb-scroll">
      ${mpkEditChangeHTML(from, target)}
      <div class="mpk-h-hint">The map, the counts and the lists follow the new status at once. The change is kept in the building's history.</div>
    </div>
    <div class="mpk-dpb-foot"><span class="mpk-dpb-spacer"></span>
      <button type="button" class="mpk-dpb-b ghost" onclick="document.getElementById('mpk-status-form').hidden = true">Cancel</button>
      <button type="button" class="mpk-dpb-b primary" onclick="mpkEditStatusSubmit()">${restore ? 'Restore' : 'Change to ' + lab(target)}</button>
    </div></div>`;
  el.hidden = false;
  el.querySelector('#sf-reason').focus();
}
// The status change part of a form: from -> to, reason, reference, date, officer, note
function mpkEditChangeHTML(from, target) {
  const lab = k => (MPK_EDIT_STATUS[k] || {}).label || k;
  return `<div class="mpk-sf-change"><span class="mpk-sf-pill s-${from}">${lab(from)}</span><i aria-hidden="true">→</i><span class="mpk-sf-pill s-${target}">${lab(target)}</span></div>
      <form class="mpk-h-form" onsubmit="return false">
        <label class="wide"><span>Reason <b>*</b></span><select id="sf-reason">${(MPK_EDIT_REASONS[target] || ['Other']).map(r => `<option>${r}</option>`).join('')}</select></label>
        <label><span>Reference no.</span><input id="sf-ref" placeholder="e.g. letter, inspection no."></label>
        <label><span>Date <b>*</b></span><input id="sf-date" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
        <label class="wide"><span>Officer <b>*</b></span><input id="sf-by" placeholder="Name and post" value="${mpkEscHtml(MPK_EDIT.lastBy || '')}"></label>
        <label class="wide"><span>Note</span><textarea id="sf-note" rows="2" placeholder="What was found, conditions, follow-up"></textarea></label>
      </form>`;
}
function mpkEditStatusSubmit() {
  const pend = MPK_EDIT.pending;
  if (!pend) return;
  const viaForm = !!(typeof MPK_DPB !== 'undefined' && MPK_DPB.open && MPK_DPB.open.change);
  const root = document.getElementById(viaForm ? 'mpk-dpb' : 'mpk-status-form');
  const g = id => root.querySelector('#' + id).value.trim();
  const reason = g('sf-reason'), ref = g('sf-ref'), date = g('sf-date'), by = g('sf-by'), note = g('sf-note');
  const restore = pend.to === 'restore';
  if (!by || !date) {
    showToast('⚠️ Fill in the officer and the date of the status change');
    root.querySelector(by ? '#sf-date' : '#sf-by').focus();
    return;
  }
  // the building plan form is saved as this building's registration, decided as the new status
  let daftar = '';
  if (viaForm) {
    const reg = mpkDaftarSaveStatus({ legal: 'lulus', suspected: 'tolak', unverified: 'menunggu' }[pend.to], [reason, note].filter(Boolean).join(' · '));
    if (!reg) return;
    daftar = reg.no;
  }
  const f = mpkEditFeature(pend.id), p = f.properties;
  const rec = MPK_EDIT.s[pend.id] = MPK_EDIT.s[pend.id] || { fields: {}, history: [] };
  rec.history = rec.history || [];
  const lab = k => (MPK_EDIT_STATUS[k] || {}).label || k;
  let toLabel;
  if (restore) {
    // the form decided with the change goes back to waiting, so it no longer sets the status either
    const reg = rec.status && rec.status.daftar && typeof MPK_DPB !== 'undefined' && MPK_DPB.list.find(x => x.no === rec.status.daftar);
    if (reg && reg.status !== 'menunggu') { Object.assign(reg, { status: 'menunggu', decided: null, updated: new Date().toISOString() }); mpkDpbSave(); }
    delete rec.status; toLabel = 'as in the records';
  }
  else { rec.status = { to: pend.to, from: pend.from, reason, ref, date, by, note, daftar, at: new Date().toISOString() }; toLabel = lab(pend.to); }
  rec.history.unshift({ type: 'status', at: new Date(date + 'T12:00:00').toISOString(), by, reason,
    ref: [daftar && 'form ' + daftar, ref].filter(Boolean).join(' · '), note, fromLabel: lab(pend.from), toLabel });
  MPK_EDIT.lastBy = by;
  if (!mpkEditSave()) return;
  if (viaForm) mpkDaftarClose(); else root.hidden = true;
  MPK_EDIT.pending = null;
  if (typeof mpkDaftarApply === 'function') mpkDaftarApply(false); else mpkEditApply();
  showToast(`🏷️ ${p.plus_code}: ${lab(pend.from)} → ${toLabel}`);
  addActivityLog('Status changed', `${p.plus_code} · ${lab(pend.from)} → ${toLabel} · ${by}`);
  mpkEditRedraw(pend.id);
}

if (typeof module !== 'undefined') module.exports = { MPK_EDIT_STATUS, MPK_EDIT_FIELDS };
