// PROTEZIONE ANTI-ISPEZIONE
document.addEventListener('contextmenu', function(e) { e.preventDefault(); });
document.addEventListener('keydown', function(e) {
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) || (e.ctrlKey && e.key === 'U')) {
        e.preventDefault();
    }
});

// FEEDBACK APTICO
function vibrate(ms) {
    ms = ms || 15;
    var enabled = localStorage.getItem('caldaiafix_vib') !== 'false';
    if (enabled && navigator.vibrate) navigator.vibrate(ms);
}

// --- GESTIONE INDEXEDDB ILLIMITATO PER TARGHE ---
var idb = null;
function initIndexedDB(callback) {
    var request = indexedDB.open("CaldaiaFix_DB", 1);
    request.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains("targhe")) {
            db.createObjectStore("targhe", { keyPath: "id" });
        }
    };
    request.onsuccess = function(e) {
        idb = e.target.result;
        if (callback) callback();
    };
    request.onerror = function(e) { console.error("Errore IndexedDB:", e); };
}

function salvaTargaInIDB(targaObj, callback) {
    if (!idb) return;
    var tx = idb.transaction("targhe", "readwrite");
    var store = tx.objectStore("targhe");
    store.put(targaObj);
    tx.oncomplete = function() { if (callback) callback(); };
}

function caricaTargheDaIDB(callback) {
    if (!idb) { callback([]); return; }
    var tx = idb.transaction("targhe", "readonly");
    var store = tx.objectStore("targhe");
    var req = store.getAll();
    req.onsuccess = function() {
        var res = req.result || [];
        res.sort(function(a, b) { return b.id - a.id; });
        callback(res);
    };
}

function cancellaTargaDaIDB(id, callback) {
    if (!idb) return;
    var tx = idb.transaction("targhe", "readwrite");
    var store = tx.objectStore("targhe");
    store.delete(id);
    tx.oncomplete = function() { if (callback) callback(); };
}

function svuotaTargheIDB(callback) {
    if (!idb) return;
    var tx = idb.transaction("targhe", "readwrite");
    var store = tx.objectStore("targhe");
    store.clear();
    tx.oncomplete = function() { if (callback) callback(); };
}

// BANNER iOS
function controllaBannerIOS() {
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    var isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    if (isIOS && !isStandalone) {
        var iosBanner = document.getElementById('ios-install-banner');
        if (iosBanner) iosBanner.style.display = 'flex';
    }
}
function chiudiIosBanner() {
    vibrate(10);
    var iosBanner = document.getElementById('ios-install-banner');
    if (iosBanner) iosBanner.style.display = 'none';
}

// SERVICE WORKER
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('sw.js').then(function(reg) {
            reg.update();
            reg.onupdatefound = function() {
                var w = reg.installing;
                if (w) {
                    w.onstatechange = function() {
                        if (w.state === 'installed' && navigator.serviceWorker.controller) {
                            window.location.reload();
                        }
                    };
                }
            };
        });
    });
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function() {
        if (!refreshing) {
            refreshing = true;
            window.location.reload();
        }
    });
}

var deferredPrompt = null;
window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
    var banner = document.getElementById('pwa-install-banner');
    if(banner) banner.style.display = 'flex';
});

function installaPWA() {
    vibrate(15);
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function() {
            deferredPrompt = null;
            chiudiPwaBanner();
        });
    }
}
function chiudiPwaBanner() { document.getElementById('pwa-install-banner').style.display = 'none'; }

// TORCIA
var torchStream = null, torchOn = false;
async function toggleTorch() {
    vibrate(20);
    var btn = document.getElementById('nav-torch');
    if (torchOn) {
        if (torchStream) {
            torchStream.getTracks().forEach(function(track) { track.stop(); });
            torchStream = null;
        }
        torchOn = false;
        if(btn) btn.classList.remove('torch-on');
    } else {
        try {
            torchStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            var track = torchStream.getVideoTracks()[0];
            var capabilities = track.getCapabilities ? track.getCapabilities() : {};
            if (capabilities.torch) {
                await track.applyConstraints({ advanced: [{ torch: true }] });
                torchOn = true;
                if(btn) btn.classList.add('torch-on');
            } else {
                alert("Torcia flash non disponibile su questo dispositivo.");
                torchStream.getTracks().forEach(function(t) { t.stop(); });
                torchStream = null;
            }
        } catch (e) {
            alert("Impossibile attivare il flash: " + e.message);
        }
    }
}

// KEEP SCREEN AWAKE
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) await navigator.wakeLock.request('screen');
    } catch (err) { console.log("WakeLock:", err); }
}

function aggiornaStatoRete() {
    var badge = document.getElementById('netStatus');
    if (navigator.onLine) {
        badge.className = 'net-badge online';
        badge.innerText = '🟢 Online';
    } else {
        badge.className = 'net-badge offline';
        badge.innerText = '🔴 Offline';
    }
}
window.addEventListener('online', aggiornaStatoRete);
window.addEventListener('offline', aggiornaStatoRete);
aggiornaStatoRete();

// AUTH & LICENZA
function getOrCreateDeviceId() {
    var deviceId = localStorage.getItem('caldaiafix_device_id');
    if(!deviceId) {
        deviceId = 'DEV-' + Math.random().toString(36).substring(2, 10).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
        localStorage.setItem('caldaiafix_device_id', deviceId);
    }
    return deviceId;
}

var CURRENT_DEVICE_ID = getOrCreateDeviceId();
document.getElementById('deviceBadge').innerText = "ID Dispositivo: " + CURRENT_DEVICE_ID;

var preferiti = JSON.parse(localStorage.getItem('caldaiafix_fav') || '[]');
var storicoInterventi = JSON.parse(localStorage.getItem('caldaiafix_history') || '[]');

function gestisciAuthIniziale() {
    var savedPin = localStorage.getItem('caldaiafix_personal_pin');
    var authTitle = document.getElementById('authTitle');
    var authSub = document.getElementById('authSub');
    var pwdWrapper = document.getElementById('pwdWrapper');
    var btnAuth = document.getElementById('btnAuth');

    if(!savedPin) {
        authTitle.innerText = "Crea Password Personale";
        authSub.innerText = "Scegli una password personale per proteggere l'app su questo dispositivo.";
        pwdWrapper.innerHTML = '<input type="password" id="pinPass1" placeholder="Nuova password..." style="margin-bottom:8px;"><input type="password" id="pinPass2" placeholder="Conferma password...">';
        btnAuth.innerText = "Salva Password e Attiva App";
        btnAuth.onclick = creaPasswordPersonale;
    } else {
        authTitle.innerText = "Sblocco CaldaiaFix PRO";
        authSub.innerText = "Inserisci la tua password personale per accedere.";
        pwdWrapper.innerHTML = '<input type="password" id="pinPassLogin" placeholder="La tua password..." onkeypress="if(event.key === \'Enter\') accediConPassword()">';
        btnAuth.innerText = "Accedi";
        btnAuth.onclick = accediConPassword;
    }
}

function creaPasswordPersonale() {
    vibrate(15);
    var p1 = document.getElementById('pinPass1').value.trim();
    var p2 = document.getElementById('pinPass2').value.trim();
    var errorMsg = document.getElementById('errorMsg');

    if(!p1 || p1.length < 3) {
        errorMsg.innerText = "La password deve contenere almeno 3 caratteri.";
        errorMsg.style.display = 'block';
        return;
    }
    if(p1 !== p2) {
        errorMsg.innerText = "Le due password non coincidono.";
        errorMsg.style.display = 'block';
        return;
    }

    localStorage.setItem('caldaiafix_personal_pin', p1);
    localStorage.setItem('caldaiafix_bound_device', CURRENT_DEVICE_ID);
    document.getElementById('auth-screen').style.display = 'none';
    renderErrori(errori);
    requestWakeLock();
    controllaBannerIOS();
}

function accediConPassword() {
    vibrate(15);
    var inputPass = document.getElementById('pinPassLogin').value.trim();
    var savedPin = localStorage.getItem('caldaiafix_personal_pin');
    var errorMsg = document.getElementById('errorMsg');

    if(inputPass === savedPin) {
        localStorage.setItem('caldaiafix_bound_device', CURRENT_DEVICE_ID);
        document.getElementById('auth-screen').style.display = 'none';
        renderErrori(errori);
        requestWakeLock();
        controllaBannerIOS();
    } else {
        errorMsg.innerText = "Password errata. Riprova.";
        errorMsg.style.display = 'block';
        document.getElementById('pinPassLogin').value = '';
    }
}

// AVVIO APPLICAZIONE
(function initApp() {
    initIndexedDB(function() {
        var savedPin = localStorage.getItem('caldaiafix_personal_pin');
        var boundDevice = localStorage.getItem('caldaiafix_bound_device');
        if (savedPin && boundDevice === CURRENT_DEVICE_ID) {
            document.getElementById('auth-screen').style.display = 'none';
            renderErrori(errori);
            requestWakeLock();
            controllaBannerIOS();
        } else {
            gestisciAuthIniziale();
        }
    });
})();

function avviaRicercaVocale() {
    vibrate(20);
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("La ricerca vocale non è supportata dal tuo browser.");
        return;
    }
    var recognition = new SpeechRecognition();
    recognition.lang = 'it-IT';
    recognition.continuous = false;
    recognition.interimResults = true;

    var micBtn = document.getElementById('micBtn');
    var searchInput = document.getElementById('searchInput');

    micBtn.classList.add('listening');
    try { recognition.start(); } catch (err) { micBtn.classList.remove('listening'); return; }

    recognition.onresult = function(event) {
        var testoVocale = '';
        for (var i = event.resultIndex; i < event.results.length; ++i) {
            testoVocale += event.results[i][0].transcript;
        }
        searchInput.value = testoVocale;
        filtraErrori(true);
    };
    recognition.onerror = function() { micBtn.classList.remove('listening'); };
    recognition.onend = function() { micBtn.classList.remove('listening'); };
}

function apriPin() {
    vibrate(15);
    document.getElementById('pin-modal').style.display = 'flex';
    document.getElementById('pinInput').value = '';
    document.getElementById('pinError').style.display = 'none';
}
function chiudiPin() { document.getElementById('pin-modal').style.display = 'none'; }

function verificaPin() {
    vibrate(15);
    var pin = document.getElementById('pinInput').value.trim();
    var savedPin = localStorage.getItem('caldaiafix_personal_pin');
    if (pin === "0000" || (savedPin && pin === savedPin)) {
        document.getElementById('pin-modal').style.display = 'none';
        mostraAreaTecnicaNelPannello();
    } else {
        document.getElementById('pinError').style.display = 'block';
        document.getElementById('pinInput').value = '';
    }
}

function impostaTabNav(tab) {
    ['home', 'fav', 'targhe', 'torch', 'calc', 'hist', 'settings'].forEach(function(t) {
        var el = document.getElementById('nav-' + t);
        if (el && t !== 'torch') el.classList.remove('active');
    });
    var target = document.getElementById('nav-' + tab);
    if (target && tab !== 'torch') target.classList.add('active');
}

function apriRicercaRicambioGenerica(brand, partName, partCode) {
    vibrate(15);
    var query = brand + ' ' + partName + ' codice ' + partCode;
    window.open('https://www.google.com/search?q=' + encodeURIComponent(query), '_blank');
}

function apriImgModal(brand, model, partName, partCode) {
    vibrate(15);
    var searchQuery = brand + ' ' + model + ' ' + partName + ' codice ' + partCode;
    window.open('https://www.google.com/search?q=' + encodeURIComponent(searchQuery) + '&tbm=isch', '_blank');
}

function apriPdfModal(brand, model) {
    vibrate(15);
    var pdfQuery = brand + ' ' + model + ' manuale installazione istruzioni filetype:pdf';
    window.open('https://www.google.com/search?q=' + encodeURIComponent(pdfQuery), '_blank');
}

function togglePreferito(id, event) {
    vibrate(15);
    if (event) event.stopPropagation();
    var index = preferiti.indexOf(id);
    if (index > -1) preferiti.splice(index, 1);
    else preferiti.push(id);
    localStorage.setItem('caldaiafix_fav', JSON.stringify(preferiti));
    filtraErrori(false);
}

var azioneDaConfermare = null;
function apriConfirmModal(titolo, sottotitolo, callbackAzione) {
    vibrate(20);
    document.getElementById('confirmTitle').innerText = titolo;
    document.getElementById('confirmSub').innerText = sottotitolo;
    azioneDaConfermare = callbackAzione;
    document.getElementById('confirm-modal').style.display = 'flex';
}

function chiudiConfirmModal() {
    document.getElementById('confirm-modal').style.display = 'none';
    azioneDaConfermare = null;
}

document.getElementById('btnConfirmYes').onclick = function() {
    if (azioneDaConfermare) azioneDaConfermare();
    chiudiConfirmModal();
};

var tempFotoBase64 = "";

// COMPRESSIONE FOTO SU CANVAS AUTOMATICA
function compressImage(file, maxWidth, quality, callback) {
    var reader = new FileReader();
    reader.onload = function(e) {
        var img = new Image();
        img.onload = function() {
            var canvas = document.createElement('canvas');
            var width = img.width;
            var height = img.height;

            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            callback(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function apriTargaModal() {
    vibrate(15);
    document.getElementById('targa-modal').style.display = 'flex';
    document.getElementById('tagClient').value = '';
    document.getElementById('tagAddress').value = '';
    document.getElementById('tagBoiler').value = '';
    document.getElementById('tagSerial').value = '';
    document.getElementById('tagNotes').value = '';
    document.getElementById('tagImgPreview').style.display = 'none';
    document.getElementById('tagImgPreview').src = '';
    tempFotoBase64 = "";
}

function chiudiTargaModal() { document.getElementById('targa-modal').style.display = 'none'; }

function anteprimaFotoTarga(event) {
    var file = event.target.files[0];
    if (!file) return;

    // Ridimensiona a 800px max e comprime al 60% in JPEG
    compressImage(file, 800, 0.60, function(compressedBase64) {
        tempFotoBase64 = compressedBase64;
        var imgEl = document.getElementById('tagImgPreview');
        imgEl.src = tempFotoBase64;
        imgEl.style.display = 'block';
    });
}

function salvaSchedaTarga() {
    vibrate(15);
    var client = document.getElementById('tagClient').value.trim() || 'Cliente Senza Nome';
    var address = document.getElementById('tagAddress').value.trim() || '-';
    var boiler = document.getElementById('tagBoiler').value.trim() || '-';
    var serial = document.getElementById('tagSerial').value.trim() || '-';
    var notes = document.getElementById('tagNotes').value.trim() || '-';

    var nuovaTarga = {
        id: Date.now(),
        client: client,
        address: address,
        boiler: boiler,
        serial: serial,
        notes: notes,
        photo: tempFotoBase64,
        date: new Date().toLocaleDateString('it-IT')
    };

    salvaTargaInIDB(nuovaTarga, function() {
        chiudiTargaModal();
        mostraTarghe();
    });
}

function mostraTarghe() {
    nascondiTutteLeView();
    document.getElementById('targhe-view').classList.add('active');

    var container = document.getElementById('targhe-list');
    if (!container) return;

    caricaTargheDaIDB(function(archivioTarghe) {
        if (archivioTarghe.length === 0) {
            container.innerHTML = '<div style="background:#ffffff; border:1px solid var(--border); padding:24px; border-radius:18px; text-align:center; color:var(--text-sub); font-size:13px;">Nessuna targa o cliente registrato. Clicca su "+ Nuova Targa" per fotografare.</div>';
            return;
        }

        container.innerHTML = archivioTarghe.map(function(t) {
            return '<div class="card">' +
                '<div style="display:flex; justify-content:space-between; align-items:flex-start;">' +
                    '<div>' +
                        '<div style="font-size:15px; font-weight:800; color:var(--text-main);">👤 ' + t.client + '</div>' +
                        '<div style="font-size:12px; color:var(--primary); font-weight:600; margin-top:2px;">📍 ' + t.address + '</div>' +
                    '</div>' +
                    '<button style="background:none; border:none; color:#ef4444; font-size:18px; cursor:pointer;" onclick="richiediCancellaTarga(' + t.id + ')">🗑️</button>' +
                '</div>' +
                '<div style="font-size:12px; color:var(--text-sub); margin-top:10px; line-height:1.5;">' +
                    '🔥 <strong>Caldaia:</strong> ' + t.boiler + '<br>' +
                    '🏷️ <strong>Matricola/Targa:</strong> ' + t.serial + '<br>' +
                    '📝 <strong>Note:</strong> ' + t.notes + '<br>' +
                    '📅 <strong>Data Registrazione:</strong> ' + t.date +
                '</div>' +
                (t.photo ? '<img src="' + t.photo + '" style="width:100%; max-height:220px; object-fit:cover; border-radius:14px; margin-top:10px; border:1px solid var(--border);" onclick="window.open(\'' + t.photo + '\', \'_blank\')">' : '') +
            '</div>';
        }).join('') + '<div class="footer-copy">CaldaiaFix PRO • Archivio Digitale IndexedDB</div>';
    });
}

function richiediCancellaTarga(id) {
    apriConfirmModal("Cancellare Targa?", "Sei sicuro di voler eliminare la scheda di questo cliente?", function() {
        cancellaTargaDaIDB(id, function() {
            mostraTarghe();
        });
    });
}

function richiediSvuotaTarghe() {
    apriConfirmModal("Eliminare Tutte le Targhe?", "Sei sicuro di voler cancellare l'intero archivio clienti e targhe?", function() {
        svuotaTargheIDB(function() {
            mostraTarghe();
        });
    });
}

function richiediSvuotaStorico() {
    apriConfirmModal("Svuotare lo Storico?", "Sei sicuro di voler cancellare la cronologia degli ultimi guasti consultati?", function() {
        storicoInterventi = [];
        localStorage.removeItem('caldaiafix_history');
        mostraStorico();
    });
}

function calcolaPortataGas() {
    var litri = parseFloat(document.getElementById('gasLiters').value);
    if (!litri || litri <= 0) {
        document.getElementById('gasResult').innerText = '0.0 kW';
        return;
    }
    var kw = (litri * 0.06) * 9.6;
    document.getElementById('gasResult').innerText = kw.toFixed(1) + ' kW (Portata Termica)';
}

function calcolaVasoEspansione() {
    var vol = parseFloat(document.getElementById('waterVolume').value);
    var h = parseFloat(document.getElementById('buildingHeight').value) || 3;
    if (!vol || vol <= 0) {
        document.getElementById('vasoResult').innerText = 'Vaso Minimo: 0 L | Precarica: 1.0 bar';
        return;
    }
    var p0 = Math.max(1.0, (h / 10) + 0.3);
    var f = (3.0 - p0) / 4.0;
    var vVaso = (vol * 0.035) / f;
    document.getElementById('vasoResult').innerText = 'Vaso Minimo: ' + Math.ceil(vVaso) + ' Litri | Precarica: ' + p0.toFixed(1) + ' bar';
}

function convertiPressione(tipo) {
    if (tipo === 'mbar') {
        var val = parseFloat(document.getElementById('inputMbar').value) || 0;
        document.getElementById('inputPascal').value = (val * 100).toFixed(0);
    } else {
        var val = parseFloat(document.getElementById('inputPascal').value) || 0;
        document.getElementById('inputMbar').value = (val / 100).toFixed(2);
    }
}

function apriReportModal(item) {
    vibrate(15);
    document.getElementById('report-modal').style.display = 'flex';
    var savedCompany = localStorage.getItem('caldaiafix_installer_company') || '';
    document.getElementById('repCompany').value = savedCompany;

    if (item) {
        document.getElementById('repBoiler').value = item.brand + ' ' + item.model;
        document.getElementById('repFault').value = item.code + ' - ' + item.desc;
        document.getElementById('repWork').value = 'Sostituito/Verificato: ' + item.partName;
    }
}

function chiudiReportModal() { document.getElementById('report-modal').style.display = 'none'; }

function inviaRapportoWhatsApp() {
    vibrate(20);
    var company = document.getElementById('repCompany').value.trim() || 'Assistenza Tecnica';
    var client = document.getElementById('repClient').value.trim() || 'Gentile Cliente';
    var addr = document.getElementById('repAddress').value.trim() || '-';
    var boiler = document.getElementById('repBoiler').value.trim() || '-';
    var fault = document.getElementById('repFault').value.trim() || '-';
    var work = document.getElementById('repWork').value.trim() || '-';
    var price = document.getElementById('repPrice').value.trim() || 'Da preventivare';

    localStorage.setItem('caldaiafix_installer_company', company);

    var testo = '📋 *RAPPORTO DI INTERVENTO TECNICO*\n🛠️ *' + company.toUpperCase() + '*\n-----------------------------\n👤 *Cliente:* ' + client + '\n📍 *Indirizzo:* ' + addr + '\n🔥 *Caldaia:* ' + boiler + '\n⚠️ *Guasto Rilevato:* ' + fault + '\n🔧 *Intervento Svolto:* ' + work + '\n💰 *Importo Totale:* € ' + price + '\n-----------------------------\nGrazie per aver scelto i nostri servizi!';
    
    window.open('https://wa.me/?text=' + encodeURIComponent(testo), '_blank');
    chiudiReportModal();
}

var filtroTipoAttivo = 'all';

function getAmazonLinks(item) {
    var text = (item.causes.join(' ') + ' ' + item.steps.join(' ') + ' ' + item.desc).toLowerCase();
    var tools = [];
    
    if (text.includes('ohm') || text.includes('230v') || text.includes('tensione') || text.includes('multimetro') || text.includes('tester')) {
        tools.push({ name: "Multimetro Digitale", link: "https://www.amazon.it/s?k=multimetro+digitale+professionale+hvac&tag=dbsolution-21" });
    }
    if (text.includes('mbar') || text.includes('pressione gas') || text.includes('valvola gas')) {
        tools.push({ name: "Micromanometro Gas", link: "https://www.amazon.it/s?k=micromanometro+differenziale+gas&tag=dbsolution-21" });
        tools.push({ name: "Cercafughe Gas", link: "https://www.amazon.it/s?k=cercafughe+gas+combustibili&tag=dbsolution-21" });
    }
    if (text.includes('lavaggio') || text.includes('scambiatore') || text.includes('calcare')) {
        tools.push({ name: "Pompa Disincrostante", link: "https://www.amazon.it/s?k=pompa+lavaggio+impianti+termici&tag=dbsolution-21" });
    }
    if (tools.length === 0) {
        tools.push({ name: "Cacciaviti Isolati", link: "https://www.amazon.it/s?k=kit+cacciaviti+elettricista+isolati&tag=dbsolution-21" });
    }
    
    var btns = tools.slice(0, 4).map(function(t) {
        return '<a href="' + t.link + '" target="_blank" class="btn-copy" style="background:#ffffff; border:1px solid #fed7aa; font-size:12px; color:#ea580c;"><span style="font-size:13px;">🛒</span> ' + t.name + '</a>';
    }).join('');
    
    return '<div class="card" style="border: 1px solid #fed7aa; background: #fff7ed;">' +
        '<h3 style="font-size:11px; color:#c2410c; text-transform:uppercase; margin-bottom:10px; font-weight:800;">🛠️ Attrezzatura Consigliata su Amazon</h3>' +
        '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">' + btns + '</div>' +
    '</div>';
}

function filtraTipo(tipo) {
    vibrate(10);
    filtroTipoAttivo = tipo;
    ['all', 'dig', 'led', 'fav'].forEach(function(t) {
        var btn = document.getElementById('btn-' + t);
        if (btn) btn.className = t === (tipo === 'all' ? 'all' : (tipo === 'digital' ? 'dig' : (tipo === 'led' ? 'led' : 'fav'))) ? "tab-btn active" : "tab-btn";
    });
    if (tipo === 'fav') impostaTabNav('fav');
    filtraErrori(false);
}

function renderErrori(lista) {
    var container = document.getElementById('errors-list');
    var countSpan = document.getElementById('resultsCount');
    if (!container || !countSpan) return;
    
    countSpan.innerText = lista.length + " guasti presenti nel database";

    if (lista.length === 0) {
        container.innerHTML = '<div style="background:#ffffff; border:1px solid var(--border); padding:24px; border-radius:18px; text-align:center; color:var(--text-sub); font-size:13px;">Nessun codice o guasto trovato. Prova con altre parole.</div>';
        return;
    }

    container.innerHTML = lista.map(function(item) {
        var badgeChamber = item.chamber === 'C' ? '<span class="badge b-cham">C</span>' : (item.chamber === 'F' ? '<span class="badge b-cham" style="background:#eff6ff; color:#1d4ed8;">F</span>' : '<span class="badge b-cham" style="background:#f0fdf4; color:#15803d;">C/F</span>');
        var isFav = preferiti.indexOf(item.id) !== -1;

        return '<div class="error-item" onclick="apriDettaglio(' + item.id + ')">' +
            '<button class="fav-btn ' + (isFav ? 'active' : '') + '" onclick="togglePreferito(' + item.id + ', event)" title="Preferito">⭐</button>' +
            '<div style="flex: 1; padding-left: 10px; padding-right: 4px;">' +
                '<div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 3px;">' +
                    '<span class="badge b-code">' + item.brand + ' - ' + item.code + '</span>' +
                    '<span class="error-model">' + item.model + '</span>' +
                    badgeChamber +
                '</div>' +
                '<div class="error-title">' + item.desc + '</div>' +
            '</div>' +
            '<span style="color: var(--text-sub); font-size: 16px; font-weight:700;">›</span>' +
        '</div>';
    }).join('');
}

function filtraErrori(isVoiceMatch) {
    isVoiceMatch = isVoiceMatch || false;
    var rawInput = document.getElementById('searchInput').value.toLowerCase().trim();
    var b = document.getElementById('brandFilter').value;
    
    if (!rawInput && !b && filtroTipoAttivo === 'all') {
        renderErrori(errori);
        return;
    }

    var stopWords = ["la", "le", "il", "lo", "un", "una", "della", "dello", "e", "poi", "va", "in", "perche", "dovrebbe", "caldaia"];
    var paroleChiave = rawInput.split(/\s+/).filter(function(p) { return p.length > 1 && stopWords.indexOf(p) === -1; });

    var filtrate = errori.filter(function(item) {
        var matchType = filtroTipoAttivo === 'all' ? true : (filtroTipoAttivo === 'fav' ? preferiti.indexOf(item.id) !== -1 : item.type === filtroTipoAttivo);
        var matchBrand = !b ? true : (b === 'Climatizzatori' ? item.brand === 'Climatizzatori' : item.brand.toLowerCase().indexOf(b.toLowerCase()) !== -1 || b.toLowerCase().indexOf(item.brand.toLowerCase()) !== -1);

        if (!matchType || !matchBrand) return false;
        if (paroleChiave.length === 0) return true;

        var fullRecordText = (item.brand + ' ' + item.model + ' ' + item.code + ' ' + item.desc + ' ' + item.causes.join(' ') + ' ' + item.steps.join(' ') + ' ' + item.partName).toLowerCase();
        var matchCount = paroleChiave.reduce(function(count, word) { return count + (fullRecordText.indexOf(word) !== -1 ? 1 : 0); }, 0);

        return matchCount >= Math.max(1, Math.floor(paroleChiave.length * 0.4));
    });

    renderErrori(filtrate);
    if (isVoiceMatch && filtrate.length === 1) apriDettaglio(filtrate[0].id);
}

function apriDettaglio(id) {
    vibrate(15);
    var item = errori.find(function(i) { return i.id === id; });
    if (!item) return;

    if (storicoInterventi.indexOf(id) === -1) {
        storicoInterventi.unshift(id);
        if (storicoInterventi.length > 15) storicoInterventi.pop();
        localStorage.setItem('caldaiafix_history', JSON.stringify(storicoInterventi));
    }

    nascondiTutteLeView();
    document.getElementById('detail-view').classList.add('active');

    var badgeChamber = item.chamber === 'C' ? '<span class="badge b-cham">TIPO C</span>' : (item.chamber === 'F' ? '<span class="badge b-cham" style="background:#eff6ff; color:#1d4ed8;">TIPO F</span>' : '<span class="badge b-cham" style="background:#f0fdf4; color:#15803d;">TIPO C/F</span>');
    var isFav = preferiti.indexOf(item.id) !== -1;

    document.getElementById('detail-content').innerHTML = 
        '<div class="detail-box">' +
            '<div style="display:flex; justify-content:space-between; align-items:flex-start;">' +
                '<div style="flex:1;">' +
                    '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:4px;">' +
                        '<span style="font-size:11px; font-weight:800; color:var(--primary); text-transform:uppercase;">' + item.brand + ' • ' + item.model + '</span>' +
                        badgeChamber +
                    '</div>' +
                    '<h2 style="font-size:28px; font-family:monospace; font-weight:900; color:var(--text-main); letter-spacing:-0.5px;">' + item.code + '</h2>' +
                '</div>' +
                '<button class="fav-btn ' + (isFav ? 'active' : '') + '" onclick="togglePreferito(' + item.id + ', null); apriDettaglio(' + item.id + ');" style="font-size:26px;">⭐</button>' +
            '</div>' +
        '</div>' +

        '<div class="card">' +
            '<h3 style="font-size:11px; color:var(--text-sub); text-transform:uppercase; margin-bottom:4px; font-weight:800;">Descrizione Diagnostica</h3>' +
            '<div style="font-size:14px; font-weight:800; color:var(--text-main); line-height:1.4;">' + item.desc + '</div>' +
        '</div>' +

        '<button class="btn-whatsapp" style="margin-bottom:12px;" onclick=\'apriReportModal(' + JSON.stringify(item) + ')\'>' +
            '📋 Crea Rapporto Intervento per Cliente' +
        '</button>' +

        '<div class="card" style="border: 1px solid #bfdbfe; background: #eff6ff;">' +
            '<div style="display:flex; justify-content:space-between; align-items:center;">' +
                '<div>' +
                    '<div style="font-size:11px; color:var(--primary); font-weight:800; text-transform:uppercase;">Documentazione Ufficiale</div>' +
                    '<div style="font-size:13px; font-weight:800; color:var(--text-main); margin-top:2px;">Manuale d\'Installazione & Uso</div>' +
                '</div>' +
                '<button onclick="apriPdfModal(\'' + item.brand + '\', \'' + item.model + '\')" class="btn-action" style="width:auto; padding:10px 16px; margin-top:0; font-size:12px;">📖 Apri PDF</button>' +
            '</div>' +
        '</div>' +

        (item.gasParams && item.gasParams !== '-' ? 
        '<div class="gas-box">⚙️ Parametri Tecnici e Regolazioni:<br><span style="color:#7c2d12; font-weight:normal; display:block; margin-top:4px;">' + item.gasParams + '</span></div>' : '') +

        '<div class="part-box">' +
            '<div style="font-size:11px; color:var(--text-sub); text-transform:uppercase; font-weight:800;">Ricambio Principale</div>' +
            '<div style="font-size:14px; font-weight:800; color:var(--text-main); margin-top:2px;">' + item.partName + '</div>' +
            '<div style="font-size:12px; color:var(--primary); font-family:monospace; margin-top:2px; font-weight:700;">Codice OEM: ' + item.partCode + '</div>' +
            '<div style="display:grid; grid-template-columns: 1fr; gap:8px; margin-top:12px;">' +
                '<button class="btn-copy" onclick="copiaCodiceRicambio(\'' + item.partCode + '\')" id="copyBtn">Copia Codice OEM</button>' +
                '<button class="btn-action" style="margin-top:0; background:#10b981;" onclick="apriRicercaRicambioGenerica(\'' + item.brand + '\', \'' + item.partName + '\', \'' + item.partCode + '\')">🔍 Cerca Ricambio Online</button>' +
                '<button class="btn-action" style="margin-top:0; background: var(--primary-gradient);" onclick="apriImgModal(\'' + item.brand + '\', \'' + item.model + '\', \'' + item.partName + '\', \'' + item.partCode + '\')">📐 Schema / Immagini</button>' +
            '</div>' +
        '</div>' +

        '<div class="card">' +
            '<h3 style="font-size:11px; color:var(--text-sub); text-transform:uppercase; margin-bottom:8px; font-weight:800;">Possibili Cause</h3>' +
            '<ul>' + item.causes.map(function(c) { return '<li>' + c + '</li>'; }).join('') + '</ul>' +
        '</div>' +

        '<div class="card">' +
            '<h3 style="font-size:11px; color:var(--text-sub); text-transform:uppercase; margin-bottom:8px; font-weight:800;">Risoluzione Pratica</h3>' +
            '<ol>' + item.steps.map(function(s) { return '<li>' + s + '</li>'; }).join('') + '</ol>' +
        '</div>' +

        getAmazonLinks(item) +

        '<div class="footer-copy">CaldaiaFix PRO • DB SOLUTION SRLS</div>';
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function copiaCodiceRicambio(codice) {
    vibrate(15);
    navigator.clipboard.writeText(codice).then(function() {
        var btn = document.getElementById('copyBtn');
        if (btn) {
            btn.innerText = "Copiato negli appunti!";
            setTimeout(function() { btn.innerText = "Copia Codice OEM"; }, 2000);
        }
    });
}

function nascondiTutteLeView() {
    ['home-view', 'detail-view', 'targhe-view', 'calc-view', 'history-view', 'settings-view'].forEach(function(v) {
        var el = document.getElementById(v);
        if (el) el.classList.remove('active');
    });
}

function mostraCalcolatori() {
    vibrate(15);
    nascondiTutteLeView();
    document.getElementById('calc-view').classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function mostraStorico() {
    vibrate(15);
    nascondiTutteLeView();
    document.getElementById('history-view').classList.add('active');
    var container = document.getElementById('history-list');
    if (!container) return;

    var listaStorico = errori.filter(function(e) { return storicoInterventi.indexOf(e.id) !== -1; });
    if (listaStorico.length === 0) {
        container.innerHTML = '<div style="background:#ffffff; padding:20px; border-radius:18px; text-align:center; color:var(--text-sub); font-size:13px; border:1px solid var(--border);">Nessun guasto consultato di recente.</div>';
        return;
    }

    container.innerHTML = listaStorico.map(function(item) {
        return '<div class="error-item" onclick="apriDettaglio(' + item.id + ')">' +
            '<div style="flex: 1;">' +
                '<span class="badge b-code">' + item.brand + ' - ' + item.code + '</span>' +
                '<div class="error-title">' + item.desc + '</div>' +
            '</div>' +
            '<span style="color: var(--text-sub); font-size: 16px; font-weight:700;">›</span>' +
        '</div>';
    }).join('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function mostraImpostazioni() {
    vibrate(15);
    nascondiTutteLeView();
    document.getElementById('settings-view').classList.add('active');
    
    var savedCompany = localStorage.getItem('caldaiafix_installer_company') || '';
    document.getElementById('settingCompany').value = savedCompany;
    
    var vib = localStorage.getItem('caldaiafix_vib') !== 'false';
    document.getElementById('settingVibration').checked = vib;

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function salvaImpostazioniDitta() {
    var val = document.getElementById('settingCompany').value.trim();
    localStorage.setItem('caldaiafix_installer_company', val);
}

function salvaImpostazioniVibrazione() {
    var checked = document.getElementById('settingVibration').checked;
    localStorage.setItem('caldaiafix_vib', checked);
}

function mostraAreaTecnicaNelPannello() {
    var container = document.getElementById('installer-content');
    if (!container) return;
    container.style.display = 'block';

    container.innerHTML = installerMenus.map(function(m) {
        return '<div class="card">' +
            '<div style="font-size:11px; font-weight:800; color:var(--primary); text-transform:uppercase; margin-bottom:4px;">' + m.brand + ' • ' + m.model + '</div>' +
            '<div style="background:var(--surface-secondary); padding:10px; border-radius:12px; font-size:12.5px; font-family:monospace; color:var(--text-main); margin-bottom:8px; line-height:1.4; border: 1px solid var(--border); font-weight:600;">' + m.sequence + '</div>' +
            '<div style="font-size:12px; color:var(--text-sub); line-height:1.4;"><strong>Parametri & Controlli:</strong> ' + m.notes + '</div>' +
        '</div>';
    }).join('');
    
    container.scrollIntoView({ behavior: 'smooth' });
}

function tornaHome() {
    vibrate(10);
    nascondiTutteLeView();
    document.getElementById('home-view').classList.add('active');
    impostaTabNav('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// GESTIONE MENU A TENDINA
function toggleMenuTendina() {
    vibrate(15);
    var menu = document.getElementById('dropup-menu');
    var overlay = document.getElementById('dropup-overlay');
    if (menu && overlay) {
        menu.classList.toggle('active');
        overlay.classList.toggle('active');
    }
}
