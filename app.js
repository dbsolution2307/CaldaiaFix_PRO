/* ==========================================================================
   CALDAIAFIX PRO - LOGICA APPLICAZIONE (v5.1 - Licenza Illimitata)
   ========================================================================== */

const AMAZON_AFFILIATE_TAG = "dbsolution-21";
const SUPPORT_EMAIL = "caldaiafixassistenza@libero.it";

// PULIZIA AUTOMATICA CACHE SERVICE WORKER
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let registration of registrations) registration.unregister();
    }).catch(err => console.warn('PWA SW Cleanup:', err));
}

// HELPER LOCALSTORAGE SICURO
function safeGetStorage(key, defaultValue) {
    try {
        const val = localStorage.getItem(key);
        return val !== null ? JSON.parse(val) : defaultValue;
    } catch (e) {
        return defaultValue;
    }
}

function safeSetStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.warn("Errore salvataggio localStorage:", e);
    }
}

// STRUTTURA DATI LOCALE
let currentFilterType = 'all';
let currentBrand = '';
let favorites = safeGetStorage('caldaiafix_favs', []);
let historyGuasti = safeGetStorage('caldaiafix_history', []);
let dbIndexed = null;
let deferredPrompt = null;
let torchTrack = null;
let isTorchOn = false;
let currentReportError = null;
let editingClientId = null;

// INIZIALIZZAZIONE
function initApp() {
    try {
        filtraErrori(false);
        aggiornaContatoreHeader();
        caricaImpostazioni();
        initIndexedDB();
        gestisciPwaInstall();
        verificaStatoRete();
        verificaStatoLicenza60Giorni();
        verificaConsensoGDPR();
    } catch (err) {
        console.error("Errore inizializzazione CaldaiaFix:", err);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// FEEDBACK VIBRAZIONE
function vibraTocco() {
    const active = safeGetStorage('caldaiafix_vibration', true);
    if (active && navigator.vibrate) {
        try { navigator.vibrate(25); } catch (e) {}
    }
}

// NAVIGAZIONE E VISTE
function impostaTabNav(tabId) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const targetNav = document.getElementById(`nav-${tabId}`);
    if (targetNav) targetNav.classList.add('active');
}

function cambiaVista(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const targetView = document.getElementById(viewId);
    if (targetView) targetView.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function tornaHome() {
    vibraTocco();
    impostaTabNav('home');
    cambiaVista('home-view');
    filtraErrori(false);
}

function mostraTarghe() {
    vibraTocco();
    impostaTabNav('targhe');
    cambiaVista('targhe-view');
    caricaTarghe();
}

function mostraCalcolatori() {
    vibraTocco();
    impostaTabNav('calc');
    cambiaVista('calc-view');
}

function mostraStorico() {
    vibraTocco();
    impostaTabNav('history');
    cambiaVista('history-view');
    renderStorico();
}

function mostraImpostazioni() {
    vibraTocco();
    impostaTabNav('menu');
    cambiaVista('settings-view');
    verificaStatoLicenza60Giorni();
}

function toggleMenuTendina() {
    vibraTocco();
    const menu = document.getElementById('dropup-menu');
    const overlay = document.getElementById('dropup-overlay');
    if (menu && overlay) {
        const isVisible = menu.classList.contains('active');
        if (isVisible) {
            menu.classList.remove('active');
            overlay.classList.remove('active');
        } else {
            menu.classList.add('active');
            overlay.classList.add('active');
        }
    }
}

// GESTIONE CENTRO HELP, FAQ, GDPR & ASSISTENZA
function apriHelpModal() {
    vibraTocco();
    const modal = document.getElementById('help-modal');
    if (modal) {
        modal.style.display = 'flex';
        cambiaTabHelp('faq');
    }
}

function chiudiHelpModal() {
    const modal = document.getElementById('help-modal');
    if (modal) modal.style.display = 'none';
}

function cambiaTabHelp(tabName) {
    vibraTocco();
    ['faq', 'legal', 'contact'].forEach(t => {
        const btn = document.getElementById(`tab-${t}-btn`);
        const sec = document.getElementById(`help-section-${t}`);
        if (btn) btn.classList.remove('active');
        if (sec) sec.style.display = 'none';
    });

    const activeBtn = document.getElementById(`tab-${tabName}-btn`);
    const activeSec = document.getElementById(`help-section-${tabName}`);
    if (activeBtn) activeBtn.classList.add('active');
    if (activeSec) activeSec.style.display = 'block';
}

function verificaConsensoGDPR() {
    const isAccepted = localStorage.getItem('caldaiafix_gdpr_accepted') === 'true';
    const consentModal = document.getElementById('gdpr-consent-modal');

    if (!isAccepted) {
        if (consentModal) consentModal.style.display = 'flex';
        return false;
    } else {
        if (consentModal) consentModal.style.display = 'none';
        return true;
    }
}

function confermaConsensoGDPR() {
    const chk = document.getElementById('chkGdprAccept');
    if (!chk || !chk.checked) {
        alert("Per procedere è necessario accettare l'Informativa Privacy e i Termini d'Uso.");
        return;
    }

    localStorage.setItem('caldaiafix_gdpr_accepted', 'true');
    vibraTocco();
    const consentModal = document.getElementById('gdpr-consent-modal');
    if (consentModal) consentModal.style.display = 'none';
    filtraErrori(false);
}

// GESTIONE LICENZA ILLIMITATA PERMANENTE
function verificaStatoLicenza60Giorni() {
    localStorage.setItem('caldaiafix_unlocked', 'true');
    const settingsInfo = document.getElementById('settings-license-info');
    const trialBanner = document.getElementById('license-status-banner');
    const blockedModal = document.getElementById('license-blocked-modal');

    if (settingsInfo) settingsInfo.textContent = "🟢 Licenza ILLIMITATA PRO Attiva";
    if (trialBanner) trialBanner.style.display = 'none';
    if (blockedModal) blockedModal.style.display = 'none';
    return true;
}

// FILTRAGGIO E RENDERING LISTA ERRORI
function aggiornaContatoreHeader() {
    const dbData = (typeof errori !== 'undefined' && Array.isArray(errori)) ? errori : [];
    const countBox = document.getElementById('resultsCount');
    if (countBox) countBox.textContent = `${dbData.length} GUASTI PRESENTI NEL DATABASE`;
}

function filtraErrori(isFavOnly = false) {
    const searchEl = document.getElementById('searchInput');
    const brandEl = document.getElementById('brandFilter');

    const query = searchEl ? searchEl.value.toLowerCase().trim() : '';
    const brandSel = brandEl ? brandEl.value : '';
    currentBrand = brandSel;

    if (isFavOnly) {
        currentFilterType = 'fav';
        aggiornaStatoTab('btn-fav');
    }

    const dbData = (typeof errori !== 'undefined' && Array.isArray(errori)) ? errori : [];

    const risultati = dbData.filter(item => {
        if (!item) return false;
        if (brandSel && item.brand !== brandSel) return false;

        if (currentFilterType === 'digital' && item.type !== 'digital') return false;
        if (currentFilterType === 'led' && item.type !== 'led') return false;
        if (currentFilterType === 'fav' && !favorites.includes(item.id)) return false;

        if (query !== '') {
            const matchCode = item.code ? item.code.toLowerCase().includes(query) : false;
            const matchDesc = item.desc ? item.desc.toLowerCase().includes(query) : false;
            const matchModel = item.model ? item.model.toLowerCase().includes(query) : false;
            const matchBrand = item.brand ? item.brand.toLowerCase().includes(query) : false;
            return matchCode || matchDesc || matchModel || matchBrand;
        }

        return true;
    });

    renderListaErrori(risultati);
}

function renderListaErrori(lista) {
    const container = document.getElementById('errors-list');
    const countBox = document.getElementById('resultsCount');

    if (!container) return;
    if (countBox) countBox.textContent = `${lista.length} GUASTI PRESENTI NEL DATABASE`;

    if (!lista || lista.length === 0) {
        container.innerHTML = `
            <div class="card" style="text-align:center; padding:30px 15px;">
                <div style="font-size:32px; margin-bottom:8px;">🔍</div>
                <div style="font-weight:800; font-size:16px; color:#ffffff;">Nessun guasto trovato</div>
                <div style="font-size:14px; color:var(--text-sub); margin-top:4px;">Prova a cambiare la ricerca o i filtri.</div>
            </div>
        `;
        return;
    }

    let html = '';
    lista.forEach(item => {
        const isFav = favorites.includes(item.id);
        const chamberText = item.chamber || 'C/F';

        html += `
            <div class="error-item" onclick="mostraDettaglio(${item.id})">
                <button class="fav-btn ${isFav ? 'active' : ''}" onclick="toggleFav(${item.id}, event)" title="Preferito">
                    ${isFav ? '★' : '☆'}
                </button>

                <div class="error-main-info">
                    <div class="error-badges-row">
                        <span class="badge-brand-code">${item.brand} - ${item.code}</span>
                        <span class="error-model-text">${item.model}</span>
                        <span class="badge-chamber">${chamberText}</span>
                    </div>
                    <div class="error-title">${item.desc}</div>
                </div>

                <div class="error-chevron">›</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function filtraTipo(tipo) {
    currentFilterType = tipo;
    const tabMap = { 'all': 'btn-all', 'digital': 'btn-dig', 'led': 'btn-led', 'fav': 'btn-fav' };
    aggiornaStatoTab(tabMap[tipo]);
    filtraErrori(false);
}

function aggiornaStatoTab(activeBtnId) {
    ['btn-all', 'btn-dig', 'btn-led', 'btn-fav'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(activeBtnId);
    if (activeBtn) activeBtn.classList.add('active');
}

function toggleFav(id, event) {
    if (event) event.stopPropagation();
    vibraTocco();
    const index = favorites.indexOf(id);
    if (index > -1) favorites.splice(index, 1);
    else favorites.push(id);
    safeSetStorage('caldaiafix_favs', favorites);
    filtraErrori(false);
}

// DETTAGLIO GUASTO
function mostraDettaglio(id) {
    const dbData = (typeof errori !== 'undefined' && Array.isArray(errori)) ? errori : [];
    const item = dbData.find(e => e.id === id);
    if (!item) return;

    currentReportError = item;
    vibraTocco();
    salvaInStorico(item);

    const detailContent = document.getElementById('detail-content');
    if (!detailContent) return;

    const isFav = favorites.includes(item.id);
    let htmlSteps = item.steps && item.steps.length > 0
        ? '<ol style="padding-left:20px; font-size:14px; line-height:1.6; margin-top:8px;">' + item.steps.map(s => `<li style="margin-bottom:6px; color:#e2e8f0;">${s}</li>`).join('') + '</ol>'
        : '<p style="font-size:14px; color:var(--text-sub); margin-top:6px;">Procedura standard di verifica componenti.</p>';

    const searchQuery = encodeURIComponent(`${item.brand} ${item.partName || item.code} ricambio caldaia`);
    const amazonUrl = `https://www.amazon.it/s?k=${searchQuery}&tag=${AMAZON_AFFILIATE_TAG}`;

    detailContent.innerHTML = `
        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <span class="badge-brand-code" style="font-size:16px;">${item.brand} - ${item.code}</span>
                    <h2 style="font-size:18px; color:#ffffff; margin-top:8px;">${item.desc}</h2>
                    <p style="font-size:13px; color:var(--text-sub); margin-top:2px;">Modello: <strong>${item.model}</strong></p>
                </div>
                <button class="fav-btn ${isFav ? 'active' : ''}" style="font-size:24px;" onclick="toggleFav(${item.id}, event)">
                    ${isFav ? '★' : '☆'}
                </button>
            </div>

            <div style="margin-top:16px; border-top:1px solid #334155; padding-top:14px;">
                <h3 style="font-size:15px; color:#38bdf8; margin-bottom:6px;">🛠️ Soluzione & Procedura di Controllo:</h3>
                ${htmlSteps}
            </div>

            ${item.partName ? `
            <div style="margin-top:16px; background:#0f172a; padding:12px; border-radius:10px; border:1px solid #334155;">
                <strong style="color:#ffffff; font-size:14px;">🔍 Ricambio Probabile:</strong>
                <p style="color:#cbd5e1; font-size:13px; margin-top:2px;">${item.partName}${item.partCode ? `(Cod. ${item.partCode})` : ''}</p>
                <a href="${amazonUrl}" target="_blank" rel="noopener" style="display:inline-block; margin-top:8px; background:#f59e0b; color:#0f172a; padding:8px 14px; border-radius:8px; font-weight:800; text-decoration:none; font-size:13px;">
                    🛒 Cerca Ricambio su Amazon
                </a>
            </div>
            ` : ''}

            <div style="display:flex; gap:10px; margin-top:16px;">
                <button class="btn-action" style="flex:1;" onclick="apriReportModal(${item.id})">💬 Crea Rapporto Cliente</button>
            </div>
        </div>
    `;

    cambiaVista('detail-view');
}
