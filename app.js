'use strict';

const CURRENCY = 'Nrs';
const KEY_RECORDS = 'npt_tracker_v1';
const KEY_CATS = 'npt_tracker_cats_v1';

const DEFAULT_INCOME_CATS = {
  salary:    { label: 'Salary',        color: '#2563eb', icon: '🏦' },
  freelance: { label: 'Freelance',     color: '#7c3aed', icon: '💻' },
  parttime:  { label: 'Part-time job', color: '#059669', icon: '🛍️' },
  gift:      { label: 'Gift',          color: '#d97706', icon: '🎁' },
  other:     { label: 'Other income',  color: '#6b7280', icon: '💰' },
};

const DEFAULT_EXPENSE_CATS = {
  food:      { label: 'Food & drinks', color: '#ef4444', icon: '🍜' },
  transport: { label: 'Transport',     color: '#f97316', icon: '🚌' },
  study:     { label: 'Study',         color: '#8b5cf6', icon: '📚' },
  rent:      { label: 'Rent & bills',  color: '#06b6d4', icon: '🏠' },
  shopping:  { label: 'Shopping',      color: '#ec4899', icon: '🛒' },
  health:    { label: 'Health',        color: '#10b981', icon: '💊' },
  other:     { label: 'Other expense', color: '#6b7280', icon: '💸' },
};

// Application State
let records = JSON.parse(localStorage.getItem(KEY_RECORDS) || '[]');
let customCats = JSON.parse(localStorage.getItem(KEY_CATS) || '{"income":{},"expense":{}}');
let chartPeriod = '6m';
let editingRecordId = null; 
let activeType = 'income';

function save() { 
  localStorage.setItem(KEY_RECORDS, JSON.stringify(records)); 
}

function saveCats() {
  localStorage.setItem(KEY_CATS, JSON.stringify(customCats));
}

function getIncomeCats() {
  return { ...DEFAULT_INCOME_CATS, ...customCats.income };
}

function getExpenseCats() {
  return { ...DEFAULT_EXPENSE_CATS, ...customCats.expense };
}

// Formatters and Parsers
function fmt(n) {
  return CURRENCY + ' ' + Math.abs(n).toLocaleString('en-US');
}

function parseAmount(raw) {
  if (!raw) return NaN;
  const s = raw.toString().trim().replace(/,/g, '');
  const match = s.match(/^([\d.]+)\s*([kK]?)$/);
  if (!match) return NaN;
  const num = parseFloat(match[1]);
  if (isNaN(num)) return NaN;
  return match[2] ? Math.round(num * 1000) : Math.round(num);
}

function uid()   { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function mk(iso) { return iso.slice(0, 7); }
function today() { return new Date().toISOString().slice(0, 10); }
function el(id)  { return document.getElementById(id); }

// Time Computations
function periodRange(period) {
  const now = new Date();
  let start;
  switch (period) {
    case '1d': start = new Date(now); start.setHours(0,0,0,0); break;
    case '1w': {
      start = new Date(now);
      start.setDate(now.getDate() - ((now.getDay()+6)%7));
      start.setHours(0,0,0,0); break;
    }
    case '1m': start = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case '6m': start = new Date(now.getFullYear(), now.getMonth()-5, 1); break;
    case '1y': start = new Date(now.getFullYear(), now.getMonth()-11, 1); break;
    default:   start = new Date(0);
  }
  const end = new Date(now); end.setHours(23,59,59,999);
  return [start, end];
}

function inPeriod(isoDate, period) {
  const [s, e] = periodRange(period);
  const d = new Date(isoDate);
  return d >= s && d <= e;
}

// Accounting Computations
function accountBalance(account, excludeId = null) {
  let bal = 0;
  records.forEach(r => {
    if (excludeId && r.id === excludeId) return; // Skip temporary record for accurate adjustment
    if (r.type === 'income'   && r.account === account)   bal += r.amount;
    if (r.type === 'expense'  && r.account === account)   bal -= r.amount;
    if (r.type === 'transfer' && r.account === account)   bal -= r.amount;
    if (r.type === 'transfer' && r.toAccount === account) bal += r.amount;
  });
  return bal;
}

function accountInOut(account) {
  let inAmt = 0, outAmt = 0;
  records.forEach(r => {
    if (r.type === 'income'   && r.account === account)   inAmt  += r.amount;
    if (r.type === 'expense'  && r.account === account)   outAmt += r.amount;
    if (r.type === 'transfer' && r.account === account)   outAmt += r.amount;
    if (r.type === 'transfer' && r.toAccount === account) inAmt  += r.amount;
  });
  return { inAmt, outAmt };
}

// Global View Controls
function showToast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}

function switchTab(name) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.view').forEach(v  => v.classList.toggle('active', v.id === 'view-'+name));
  if (name === 'dashboard') renderDashboard();
  if (name === 'history')   renderHistory();
}

function setPeriod(p) {
  chartPeriod = p;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === p));
  const labels = { '1d':'Today', '1w':'This week', '1m':'This month', '6m':'Last 6 months', '1y':'This year' };
  const lbl = labels[p] || '';
  el('period-label').textContent  = lbl;
  el('chart-title').textContent   = lbl;
  el('strip-label-income').textContent  = lbl + ' — income';
  el('strip-label-expense').textContent = lbl + ' — expense';
  el('strip-label-net').textContent     = lbl + ' — net';
  renderDashboard();
}

// Rendering Dashboards & Charts
function renderDashboard() {
  const dBal = accountBalance('digital');
  const cBal = accountBalance('cash');
  el('bal-digital').textContent = fmt(dBal);
  el('bal-digital').className   = 'account-balance' + (dBal < 0 ? ' negative' : '');
  el('bal-cash').textContent    = fmt(cBal);
  el('bal-cash').className      = 'account-balance' + (cBal < 0 ? ' negative' : '');

  const dStats = accountInOut('digital');
  const cStats = accountInOut('cash');
  el('digital-in').textContent  = fmt(dStats.inAmt);
  el('digital-out').textContent = fmt(dStats.outAmt);
  el('cash-in').textContent     = fmt(cStats.inAmt);
  el('cash-out').textContent    = fmt(cStats.outAmt);

  const allInc = records.filter(r=>r.type==='income').reduce((s,r)=>s+r.amount,0);
  const allExp = records.filter(r=>r.type==='expense').reduce((s,r)=>s+r.amount,0);
  const allNet = allInc - allExp;
  el('total-income').textContent  = fmt(allInc);
  el('total-expense').textContent = fmt(allExp);
  el('total-net').textContent     = (allNet>=0?'+':'−') + ' ' + fmt(allNet);
  el('total-net').className       = 'total-item-val net' + (allNet<0?' neg':'');

  const pRecs  = records.filter(r => inPeriod(r.date, chartPeriod));
  const pInc   = pRecs.filter(r=>r.type==='income').reduce((s,r)=>s+r.amount,0);
  const pExp   = pRecs.filter(r=>r.type==='expense').reduce((s,r)=>s+r.amount,0);
  const pNet   = pInc - pExp;
  el('stat-income').textContent  = fmt(pInc);
  el('stat-expense').textContent = fmt(pExp);
  el('stat-net').textContent     = (pNet>=0?'+':'−') + ' ' + fmt(pNet);
  el('stat-net').className       = 'strip-value net' + (pNet<0?' neg':'');

  renderChart();
  renderCatSection(document.querySelector('.cat-tab.active')?.dataset.type || 'income');
}

function renderChart() {
  const canvas = el('mainChart');
  if (!canvas) return;
  const ctx    = canvas.getContext('2d');
  const dpr    = window.devicePixelRatio || 1;
  const W      = canvas.offsetWidth;
  const H      = 200;
  canvas.width  = W * dpr; canvas.height = H * dpr;
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const buckets = buildBuckets(chartPeriod);
  records.forEach(r => {
    const bkt = buckets.find(b => b.matches(r.date));
    if (!bkt) return;
    if (r.type==='income')  bkt.inc += r.amount;
    if (r.type==='expense') bkt.exp += r.amount;
  });

  const maxVal = Math.max(...buckets.map(b=>Math.max(b.inc,b.exp)), 1);
  const pL=10, pR=10, pT=20, pB=36;
  const cW = W-pL-pR, cH = H-pT-pB;
  const grpW = cW / buckets.length;
  const bW   = Math.max(4, Math.floor(grpW*(buckets.length<=7?0.28:0.38)));

  buckets.forEach((b,i) => {
    const cx = pL + grpW*i + grpW/2;
    const iH = (b.inc/maxVal)*cH;
    ctx.fillStyle = '#bfdbfe';
    roundRect(ctx, cx-bW-1, pT+cH-iH, bW, iH, 3); ctx.fill();
    const eH = (b.exp/maxVal)*cH;
    ctx.fillStyle = '#fca5a5';
    roundRect(ctx, cx+1, pT+cH-eH, bW, eH, 3); ctx.fill();
    ctx.fillStyle = '#9ca3af';
    ctx.font = '11px -apple-system,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.label, cx, H-pB+15);
  });
}

function buildBuckets(period) {
  const now = new Date();
  const buckets = [];
  if (period === '1d') {
    for (let h=0; h<24; h+=4) {
      const label = h===0?'12am': h<12?h+'am': h===12?'12pm':(h-12)+'pm';
      buckets.push({ label, inc:0, exp:0, matches(iso) {
        const d=new Date(iso), todayStr=now.toISOString().slice(0,10);
        return iso.slice(0,10)===todayStr && d.getHours()>=h && d.getHours()<h+4;
      }});
    }
  } else if (period === '1w') {
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const mon = new Date(now); mon.setDate(now.getDate()-((now.getDay()+6)%7)); mon.setHours(0,0,0,0);
    for (let i=0; i<7; i++) {
      const d=new Date(mon); d.setDate(mon.getDate()+i);
      const iso=d.toISOString().slice(0,10);
      buckets.push({ label:days[i], inc:0, exp:0, matches:(r)=>r.slice(0,10)===iso });
    }
  } else if (period === '1m') {
    const year=now.getFullYear(), month=now.getMonth();
    const daysInMonth=new Date(year,month+1,0).getDate();
    for (let w=0; w<5; w++) {
      const startDay=w*7+1, endDay=Math.min(startDay+6,daysInMonth);
      if (startDay>daysInMonth) break;
      buckets.push({ label:'W'+(w+1), inc:0, exp:0, matches(iso) {
        const d=new Date(iso);
        return d.getFullYear()===year && d.getMonth()===month && d.getDate()>=startDay && d.getDate()<=endDay;
      }});
    }
  } else if (period === '6m') {
    for (let i=5; i>=0; i--) {
      const d=new Date(now.getFullYear(),now.getMonth()-i,1);
      const y=d.getFullYear(), m=d.getMonth();
      buckets.push({ label:d.toLocaleString('en-US',{month:'short'}), inc:0, exp:0, matches(iso) {
        const dt=new Date(iso); return dt.getFullYear()===y && dt.getMonth()===m;
      }});
    }
  } else if (period === '1y') {
    for (let i=11; i>=0; i--) {
      const d=new Date(now.getFullYear(),now.getMonth()-i,1);
      const y=d.getFullYear(), m=d.getMonth();
      buckets.push({ label:d.toLocaleString('en-US',{month:'short'}), inc:0, exp:0, matches(iso) {
        const dt=new Date(iso); return dt.getFullYear()===y && dt.getMonth()===m;
      }});
    }
  }
  return buckets;
}

function roundRect(ctx,x,y,w,h,r) {
  if(h<=0) return;
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h); ctx.lineTo(x,y+h);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

function renderCatSection(type) {
  document.querySelectorAll('.cat-tab').forEach(t=>t.classList.toggle('active',t.dataset.type===type));
  const cats   = type==='income' ? getIncomeCats() : getExpenseCats();
  const totals = {};
  records.filter(r=>r.type===type && inPeriod(r.date,chartPeriod)).forEach(r=>{
    totals[r.category]=(totals[r.category]||0)+r.amount;
  });
  const grand = Object.values(totals).reduce((s,v)=>s+v,0)||1;
  const container = el('catBreakdown');
  container.innerHTML='';
  const sorted = Object.entries(totals).sort((a,b)=>b[1]-a[1]);
  if (!sorted.length) {
    container.innerHTML='<p style="font-size:14px;color:var(--text-tertiary)">No entries for this period.</p>';
    return;
  }
  sorted.forEach(([cat,val])=>{
    const meta=cats[cat]||{label:cat,color:'#6b7280'};
    const pct=(val/grand*100).toFixed(0);
    const row=document.createElement('div');
    row.className='cat-row';
    row.innerHTML=`
      <div class="cat-dot" style="background:${meta.color}"></div>
      <span class="cat-name">${meta.label}</span>
      <div class="cat-bar-wrap"><div class="cat-bar" style="width:${pct}%;background:${meta.color}"></div></div>
      <span class="cat-amount">${fmt(val)}</span>`;
    container.appendChild(row);
  });
}

// Type/Form Handling
function setType(type) {
  activeType = type;
  document.querySelectorAll('.type-btn').forEach(b=>{
    b.classList.toggle('active',b.dataset.type===type);
    b.classList.remove('income','expense','transfer');
    if(b.dataset.type===type) b.classList.add(type);
  });
  el('transfer-note').style.display = type==='transfer'?'block':'none';
  const catSel=el('f-category');
  catSel.innerHTML='';
  
  if(type==='income'){
    Object.entries(getIncomeCats()).forEach(([v,m])=>catSel.innerHTML+=`<option value="${v}">${m.icon || '•'} ${m.label}</option>`);
    el('category-field-block').style.display='';
  } else if(type==='expense'){
    Object.entries(getExpenseCats()).forEach(([v,m])=>catSel.innerHTML+=`<option value="${v}">${m.icon || '•'} ${m.label}</option>`);
    el('category-field-block').style.display='';
  } else {
    el('category-field-block').style.display='none';
  }
  
  el('account-label').textContent   = type==='transfer'?'From account':'Account';
  el('to-account-field').style.display = type==='transfer'?'':'none';
  el('source-label').textContent    = type==='transfer'?'Note (optional)':'Source / description';
  el('f-source').required           = type!=='transfer';
  el('f-source').placeholder        = type==='transfer'?'e.g. ATM withdrawal':type==='income'?'e.g. Monthly salary, Freelance payment':'e.g. Rice & dal, Bus fare';
  
  const btn=el('submit-btn');
  if (editingRecordId) {
    btn.className = 'btn btn-primary amber';
    btn.textContent = 'Update entry';
  } else {
    btn.className = 'btn btn-primary'+(type==='expense'?' red':type==='income'?' green':'');
    btn.textContent = type==='income'?'Save income':type==='expense'?'Save expense':'Save transfer';
  }
}

function handleCustomCategory() {
  if (activeType === 'transfer') return;
  const typeLabel = activeType === 'income' ? 'income' : 'expense';
  const label = prompt(`Enter new custom ${typeLabel} category name:`).trim();
  if (!label) return;
  
  const key = label.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const existing = activeType === 'income' ? getIncomeCats() : getExpenseCats();
  if (existing[key]) {
    showToast('Category already exists!');
    return;
  }

  const icons = ['🏷️', '✨', '⭐', '🎈', '🛒', '🍔', '💵', '🔧', '📦'];
  const colors = ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f97316'];
  const randomIcon = icons[Math.floor(Math.random() * icons.length)];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];

  customCats[activeType][key] = { label, color: randomColor, icon: randomIcon };
  saveCats();
  setType(activeType);
  el('f-category').value = key;
  showToast(`Created category "${label}" ✓`);
}

function handleForm(e) {
  e.preventDefault();
  const source    = el('f-source').value.trim();
  const rawAmount = el('f-amount').value.trim();
  const amount    = parseAmount(rawAmount);
  const account   = el('f-account').value;
  const date      = el('f-date').value;
  const note      = el('f-note').value.trim();
  const category  = activeType!=='transfer'?el('f-category').value:'transfer';
  const toAccount = activeType==='transfer'?el('f-to-account').value:null;

  if(isNaN(amount)||amount<=0){ showToast('Enter a valid amount — e.g. 5,000 or 10k'); return; }
  if(!date) return;
  if(activeType==='transfer'&&account===toAccount){ showToast('From and To accounts must be different'); return; }
  
  if(activeType==='transfer'){
    const fromBal=accountBalance(account, editingRecordId);
    if(amount>fromBal){ showToast(`Not enough balance in ${account} (${fmt(fromBal)})`); return; }
  }

  if (editingRecordId) {
    // Modify active transaction object
    const index = records.findIndex(r => r.id === editingRecordId);
    if (index !== -1) {
      records[index] = { id: editingRecordId, type: activeType, account, toAccount, source, category, amount, date, note };
      showToast('Entry updated ✓');
    }
    editingRecordId = null;
    el('form-view-title').textContent = 'Add transaction';
    el('form-type-switcher').style.pointerEvents = 'auto';
    el('form-type-switcher').style.opacity = '1';
  } else {
    // Add raw record item
    records.unshift({id:uid(),type:activeType,account,toAccount,source,category,amount,date,note});
    showToast(activeType==='transfer'?'Transfer saved ✓':activeType==='income'?'Income saved ✓':'Expense saved ✓');
  }
  
  save();
  document.getElementById('txForm').reset();
  el('f-date').value=today();
  setType(activeType);
}

// History & Filtering
function startEdit(id) {
  const r = records.find(rec => rec.id === id);
  if (!r) return;

  editingRecordId = r.id;
  switchTab('add');
  
  el('form-view-title').textContent = 'Edit transaction';
  el('form-type-switcher').style.pointerEvents = 'none'; // Lock switching variants during edit
  el('form-type-switcher').style.opacity = '0.6';

  // Populating structural form fields
  setType(r.type);
  el('f-source').value = r.source;
  el('f-amount').value = r.amount;
  el('f-date').value = r.date;
  el('f-account').value = r.account;
  if (r.type === 'transfer') {
    el('f-to-account').value = r.toAccount;
  } else {
    el('f-category').value = r.category;
  }
  el('f-note').value = r.note;
}

function renderHistory() {
  populateMonthFilter();
  const typeF    = el('filter-type').value;
  const accountF = el('filter-account').value;
  const monthF   = el('filter-month').value;
  const searchQ  = el('search-history').value.toLowerCase().trim();

  const filtered = records.filter(r=>{
    const tOk=!typeF||r.type===typeF;
    const aOk=!accountF||r.account===accountF||r.toAccount===accountF;
    const mOk=!monthF||mk(r.date)===monthF;
    
    // Multi-parameter Text Filter evaluation
    const matchesSearch = !searchQ || 
      (r.source && r.source.toLowerCase().includes(searchQ)) || 
      (r.note && r.note.toLowerCase().includes(searchQ)) ||
      (r.category && r.category.toLowerCase().includes(searchQ));

    return tOk&&aOk&&mOk&&matchesSearch;
  });

  const list=el('historyList');
  list.innerHTML='';
  if(!filtered.length){
    list.innerHTML=`<div class="empty-state"><div class="empty-icon">📭</div><p>No entries match this filter.</p></div>`;
    return;
  }

  filtered.forEach(r=>{
    const isTransfer=r.type==='transfer';
    const cats   = r.type==='income'?getIncomeCats():getExpenseCats();
    const catMeta= cats[r.category]||{};
    const icon   = isTransfer?'↔':catMeta.icon||'•';
    const label  = isTransfer?`Transfer: ${r.account} → ${r.toAccount}`:catMeta.label||r.category;
    const amtSign= r.type==='expense'?'− ':'+ ';
    const amtClass=isTransfer?'transfer':r.type;
    const dateStr= new Date(r.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    
    const card=document.createElement('div');
    card.className='entry-card';
    card.innerHTML=`
      <div class="entry-icon ${r.type}">${icon}</div>
      <div class="entry-info btn-edit-trigger" data-id="${r.id}" title="Click to Edit">
        <div class="entry-source">${r.source||label}</div>
        <div class="entry-meta">${label} · ${dateStr}${r.note?' · '+r.note:''}</div>
      </div>
      <div class="entry-right">
        <span class="entry-amount ${amtClass}">${amtSign}${fmt(r.amount)}</span>
        <span class="entry-account ${r.account}">${r.account}</span>
        <button class="entry-del" data-id="${r.id}" title="Delete">✕</button>
      </div>`;
    list.appendChild(card);
  });

  // Attach Deletion handlers with confirmation guards
  list.querySelectorAll('.entry-del').forEach(btn=>{
    btn.addEventListener('click',(e)=>{
      e.stopPropagation();
      if (confirm('Are you sure you want to delete this transaction entry?')) {
        const id = btn.dataset.id;
        if (editingRecordId === id) {
          editingRecordId = null;
          el('form-view-title').textContent = 'Add transaction';
          el('form-type-switcher').style.pointerEvents = 'auto';
          el('form-type-switcher').style.opacity = '1';
          document.getElementById('txForm').reset();
        }
        records=records.filter(r=>r.id!==id);
        save(); renderHistory(); showToast('Entry deleted');
      }
    });
  });

  // Attach Entry editing triggers
  list.querySelectorAll('.btn-edit-trigger').forEach(div => {
    div.addEventListener('click', () => startEdit(div.dataset.id));
  });
}

function populateMonthFilter() {
  const sel=el('filter-month');
  const cur=sel.value;
  const mks=[...new Set(records.map(r=>mk(r.date)))].sort().reverse();
  sel.innerHTML='<option value="">All months</option>';
  mks.forEach(m=>{
    const [y,mo]=m.split('-');
    const lbl=new Date(+y,+mo-1,1).toLocaleString('en-US',{month:'long',year:'numeric'});
    sel.innerHTML+=`<option value="${m}"${m===cur?' selected':''}>${lbl}</option>`;
  });
}

// Data Backup & Export Operations Manager
function exportData() {
  const dataStr = JSON.stringify({ records, customCats }, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  
  const tempLink = document.createElement('a');
  tempLink.href = url;
  tempLink.download = `tracker_backup_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(tempLink);
  tempLink.click();
  document.body.removeChild(tempLink);
  URL.revokeObjectURL(url);
  showToast('Data exported successfully 📤');
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const imported = JSON.parse(evt.target.result);
      if (imported && (Array.isArray(imported.records) || imported.customCats)) {
        records = imported.records || [];
        customCats = imported.customCats || {"income":{},"expense":{}};
        save();
        saveCats();
        renderHistory();
        showToast('Backup Restored Successfully 📥');
        el('file-import').value = ''; // Flush selected value
      } else {
        showToast('Invalid structure schema file');
      }
    } catch(err) {
      showToast('Error reading import parse parameters');
    }
  };
  reader.readAsText(file);
}

// Initializing Hooks
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-btn').forEach(b  => b.addEventListener('click', ()=>switchTab(b.dataset.tab)));
  document.querySelectorAll('.type-btn').forEach(b => b.addEventListener('click', ()=>setType(b.dataset.type)));
  document.querySelectorAll('.cat-tab').forEach(b  => b.addEventListener('click', ()=>renderCatSection(b.dataset.type)));
  document.querySelectorAll('.period-btn').forEach(b => b.addEventListener('click', ()=>setPeriod(b.dataset.period)));

  el('txForm').addEventListener('submit', handleForm);
  el('btn-add-custom-cat').addEventListener('click', handleCustomCategory);
  
  el('btn-reset').addEventListener('click', ()=>{ 
    editingRecordId = null;
    el('form-view-title').textContent = 'Add transaction';
    el('form-type-switcher').style.pointerEvents = 'auto';
    el('form-type-switcher').style.opacity = '1';
    el('txForm').reset(); 
    el('f-date').value=today(); 
    setType(activeType); 
  });
  
  el('filter-type').addEventListener('change', renderHistory);
  el('filter-account').addEventListener('change', renderHistory);
  el('filter-month').addEventListener('change', renderHistory);
  el('search-history').addEventListener('input', renderHistory);

  // Backup System Hooks
  el('btn-export').addEventListener('click', exportData);
  el('file-import').addEventListener('change', importData);

  el('f-date').value = today();
  setType('income');
  window.addEventListener('resize', ()=>{ if(el('view-dashboard').classList.contains('active')) renderChart(); });
  switchTab('dashboard');
});