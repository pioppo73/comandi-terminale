(function () {
  "use strict";

  // ---------- configurazione ----------
  var LEGACY_KEY = "terminal-commands:data";
  var VAULT_KEY = "terminal-commands:vault";
  var TOKEN_KEY = "terminal-commands:gh-token";

  var GH_OWNER = "pioppo73";
  var GH_REPO = "comandi-terminale";
  var GH_BRANCH = "main";
  var GH_FILE_PATH = "data.json";

  var PBKDF2_ITERATIONS = 150000;
  var AUTO_LOCK_MS = 5 * 60 * 1000;

  var OS_META = {
    mac: {
      label: "Mac",
      svg:
        '<path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.014-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.05-1.6 2.9-1.65.03.13.05.24.05.4zm4.075 16.02c-.058-.06-1.7-.99-1.7-3.14 0-2.5 2.02-3.4 2.11-3.46-.04-.13-.68-1.28-1.63-2.05-.79-.63-1.72-1.03-2.61-1.03-1.08 0-1.65.53-2.51.53-.88 0-1.6-.53-2.5-.53-.98 0-1.9.44-2.7 1.13-1.83 1.58-2.71 4.44-1.9 7.5.6 2.28 2.1 4.66 3.4 4.66.86 0 1.19-.55 2.25-.55 1.05 0 1.34.55 2.28.55 1.34 0 2.72-1.94 3.31-3.63-.85-.35-1.63-1.03-2.13-1.98z"/>',
    },
    windows: {
      label: "Windows",
      svg:
        '<rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/>',
    },
    linux: {
      label: "Linux",
      svg:
        '<ellipse cx="6.6" cy="14.5" rx="1.35" ry="2.7"/><ellipse cx="17.4" cy="14.5" rx="1.35" ry="2.7"/><path d="M12,3.4 C13.9,3.4 15.2,5.1 15.1,7.3 C15.05,8.3 14.7,8.9 14.3,9.4 C16.6,10.6 18,13.6 17.6,17.4 C17.3,20.2 15.2,21.6 12,21.6 C8.8,21.6 6.7,20.2 6.4,17.4 C6,13.6 7.4,10.6 9.7,9.4 C9.3,8.9 8.95,8.3 8.9,7.3 C8.8,5.1 10.1,3.4 12,3.4 Z M10.6,8.9 a0.95,0.95 0 1,0 0.02,0 Z M13.4,8.9 a0.95,0.95 0 1,0 0.02,0 Z"/>',
    },
  };
  var OS_ORDER = ["mac", "windows", "linux"];

  function osIconSvg(osKey, size) {
    var meta = OS_META[osKey];
    var inner = meta.customInner || meta.svg;
    var viewBox = meta.customViewBox || "0 0 24 24";
    return (
      '<svg class="os-logo" width="' +
      size +
      '" height="' +
      size +
      '" viewBox="' +
      viewBox +
      '" fill="#fff" fill-rule="evenodd" aria-hidden="true">' +
      inner +
      "</svg>"
    );
  }

  function terminalLogoSvg(size) {
    return (
      '<svg width="' +
      size +
      '" height="' +
      size +
      '" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<polyline points="4,6 10,12 4,18"/>' +
      '<line x1="12" y1="18" x2="20" y2="18"/>' +
      "</svg>"
    );
  }

  // ---------- icone personalizzabili (icons/*.svg) ----------
  var ICON_FILES = {
    mac: "icons/apple.svg",
    windows: "icons/windows.svg",
    linux: "icons/linux.svg",
  };

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (resolve) {
        setTimeout(function () {
          resolve(null);
        }, ms);
      }),
    ]);
  }

  function loadIconFile(path) {
    return fetch(path, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("not ok");
        return res.text();
      })
      .then(function (text) {
        var doc = new DOMParser().parseFromString(text, "image/svg+xml");
        var svgEl = doc.querySelector("svg");
        if (!svgEl || doc.querySelector("parsererror")) throw new Error("invalid svg");
        return { inner: svgEl.innerHTML, viewBox: svgEl.getAttribute("viewBox") || "0 0 24 24" };
      })
      .catch(function () {
        return null;
      });
  }

  function loadCustomIcons() {
    var keys = Object.keys(ICON_FILES);
    return Promise.all(
      keys.map(function (key) {
        return withTimeout(loadIconFile(ICON_FILES[key]), 1500).then(function (result) {
          if (result) {
            OS_META[key].customInner = result.inner;
            OS_META[key].customViewBox = result.viewBox;
          }
        });
      })
    );
  }

  // ---------- crittografia (Web Crypto API) ----------
  function randomBytes(n) {
    return crypto.getRandomValues(new Uint8Array(n));
  }

  function bytesToBase64(bytes) {
    var binary = "";
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64ToBytes(b64) {
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function deriveKey(password, saltBytes) {
    var enc = new TextEncoder();
    return crypto.subtle
      .importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"])
      .then(function (keyMaterial) {
        return crypto.subtle.deriveKey(
          { name: "PBKDF2", salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
          keyMaterial,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"]
        );
      });
  }

  function encryptPayload(password, obj) {
    var salt = randomBytes(16);
    var iv = randomBytes(12);
    return deriveKey(password, salt).then(function (key) {
      var enc = new TextEncoder();
      var plaintext = enc.encode(JSON.stringify(obj));
      return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, plaintext).then(function (buf) {
        return {
          v: 1,
          salt: bytesToBase64(salt),
          iv: bytesToBase64(iv),
          data: bytesToBase64(new Uint8Array(buf)),
          updatedAt: Date.now(),
        };
      });
    });
  }

  function decryptPayload(password, envelope) {
    var salt = base64ToBytes(envelope.salt);
    var iv = base64ToBytes(envelope.iv);
    return deriveKey(password, salt).then(function (key) {
      var ciphertext = base64ToBytes(envelope.data);
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ciphertext).then(function (buf) {
        var dec = new TextDecoder();
        return JSON.parse(dec.decode(buf));
      });
    });
  }

  // ---------- sincronizzazione GitHub ----------
  function ghToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function setGhToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function fetchRemoteEnvelope() {
    var url =
      "https://raw.githubusercontent.com/" +
      GH_OWNER +
      "/" +
      GH_REPO +
      "/" +
      GH_BRANCH +
      "/" +
      GH_FILE_PATH +
      "?t=" +
      Date.now();
    return fetch(url, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .catch(function () {
        return null;
      });
  }

  function pushRemoteEnvelope(envelope) {
    var token = ghToken();
    if (!token) return Promise.resolve({ ok: false, reason: "no-token" });
    var apiUrl = "https://api.github.com/repos/" + GH_OWNER + "/" + GH_REPO + "/contents/" + GH_FILE_PATH;
    return fetch(apiUrl, {
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" },
    })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (existing) {
        var contentStr = JSON.stringify(envelope, null, 2);
        var body = {
          message: "Aggiorna comandi (" + new Date().toISOString() + ")",
          content: bytesToBase64(new TextEncoder().encode(contentStr)),
          branch: GH_BRANCH,
        };
        if (existing && existing.sha) body.sha = existing.sha;
        return fetch(apiUrl, {
          method: "PUT",
          headers: {
            Authorization: "Bearer " + token,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      })
      .then(function (res) {
        return { ok: res.ok, status: res.status };
      })
      .catch(function () {
        return { ok: false, reason: "network" };
      });
  }

  // ---------- stato ----------
  var state = {
    screen: "unlock", // 'unlock' | 'vault'
    error: null,
    view: "home", // 'home' | 'section'
    currentOS: null,
    search: "",
    selectedId: null,
    formMode: null, // null | 'new' | 'edit'
    pendingImport: null,
    settingsOpen: false,
  };

  var commands = [];
  var vaultPassword = null;
  var autoLockTimer = null;

  var app = document.getElementById("app");
  var importInput = document.getElementById("import-input");

  // ---------- storage locale (cifrato) ----------
  function loadLocalEnvelope() {
    try {
      var raw = localStorage.getItem(VAULT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function loadLegacyPlain() {
    try {
      var raw = localStorage.getItem(LEGACY_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function loadData() {
    return commands;
  }

  function persistLocal() {
    return encryptPayload(vaultPassword, commands).then(function (envelope) {
      localStorage.setItem(VAULT_KEY, JSON.stringify(envelope));
      return envelope;
    });
  }

  function saveData(items) {
    commands = items;
    return persistLocal().then(function (envelope) {
      if (ghToken()) {
        pushRemoteEnvelope(envelope).then(function (result) {
          if (!result.ok) showToast("Sincronizzazione non riuscita");
        });
      }
      return envelope;
    });
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- helpers ----------
  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Rileva link in un testo gia' HTML-escaped e li trasforma in link
  // cliccabili: sia il formato Markdown [testo](url) con etichetta
  // personalizzata, sia gli URL scritti per esteso (http/https).
  function linkifyHtml(escapedText) {
    var pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+[^\s<.,;:!?)\]}])/g;
    return escapedText.replace(pattern, function (match, mdLabel, mdUrl, bareUrl) {
      var href = mdUrl || bareUrl;
      var label = mdLabel || bareUrl;
      return '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + label + "</a>";
    });
  }

  // Le note possono contenere righe con tabulazioni (dati incollati da una
  // tabella): quelle righe vengono renderizzate come una vera tabella HTML,
  // che si allinea correttamente indipendentemente dalla lunghezza del
  // testo in ciascuna colonna (a differenza del semplice allineamento a
  // "tab stop" del CSS). Le righe senza tabulazioni restano testo normale.
  function renderNotesHtml(rawText) {
    var lines = String(rawText || "").split("\n");
    var htmlParts = [];
    var i = 0;
    while (i < lines.length) {
      if (lines[i].indexOf("\t") !== -1) {
        var tableLines = [];
        while (i < lines.length && lines[i].indexOf("\t") !== -1) {
          tableLines.push(lines[i]);
          i++;
        }
        var rows = tableLines.map(function (line) {
          var cells = line.split("\t").map(function (cell) {
            return "<td>" + linkifyHtml(escapeHtml(cell)) + "</td>";
          });
          return "<tr>" + cells.join("") + "</tr>";
        });
        htmlParts.push('<table class="notes-table">' + rows.join("") + "</table>");
      } else {
        var textLines = [];
        while (i < lines.length && lines[i].indexOf("\t") === -1) {
          textLines.push(lines[i]);
          i++;
        }
        htmlParts.push(linkifyHtml(escapeHtml(textLines.join("\n"))));
      }
    }
    return htmlParts.join("");
  }

  // ---------- note con incolla ricco (HTML da Word/Google Docs/pagine web) ----------
  // Quando si incolla testo formattato che contiene gia' un link (es. la
  // parola "qui" collegata a un URL in un documento Word), il browser mette
  // a disposizione anche una versione HTML degli appunti: la intercettiamo
  // e la sanifichiamo per mantenere link e tabelle, eliminando pero' tutto
  // cio' che potrebbe essere pericoloso (script, gestori di eventi, iframe,
  // URL non http/https, ecc.).
  var NOTES_ALLOWED_TAGS = {
    A: 1,
    B: 1,
    STRONG: 1,
    I: 1,
    EM: 1,
    U: 1,
    BR: 1,
    P: 1,
    DIV: 1,
    SPAN: 1,
    UL: 1,
    OL: 1,
    LI: 1,
    TABLE: 1,
    THEAD: 1,
    TBODY: 1,
    TR: 1,
    TD: 1,
    TH: 1,
    CODE: 1,
    PRE: 1,
  };
  var NOTES_STRIP_WITH_CONTENT = {
    SCRIPT: 1,
    STYLE: 1,
    IFRAME: 1,
    OBJECT: 1,
    EMBED: 1,
    HEAD: 1,
    TITLE: 1,
    META: 1,
    LINK: 1,
    NOSCRIPT: 1,
  };

  function sanitizeNotesNode(node) {
    Array.prototype.slice.call(node.childNodes).forEach(function (child) {
      if (child.nodeType === 3) return; // testo: lasciato intatto
      if (child.nodeType !== 1) {
        node.removeChild(child);
        return;
      }
      var tag = child.tagName;
      if (NOTES_STRIP_WITH_CONTENT[tag]) {
        node.removeChild(child);
        return;
      }

      var hrefValue = tag === "A" ? child.getAttribute("href") : null;
      Array.prototype.slice.call(child.attributes).forEach(function (attr) {
        child.removeAttribute(attr.name);
      });

      sanitizeNotesNode(child);

      if (!NOTES_ALLOWED_TAGS[tag]) {
        while (child.firstChild) node.insertBefore(child.firstChild, child);
        node.removeChild(child);
        return;
      }

      if (tag === "A") {
        if (hrefValue && /^https?:\/\//i.test(hrefValue)) {
          child.setAttribute("href", hrefValue);
          child.setAttribute("target", "_blank");
          child.setAttribute("rel", "noopener noreferrer");
        } else {
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
        }
      }
    });
  }

  function sanitizeNotesHtml(html) {
    var doc = new DOMParser().parseFromString("<div>" + html + "</div>", "text/html");
    var root = doc.body.firstChild;
    sanitizeNotesNode(root);
    return root.innerHTML;
  }

  function isInsideAnchor(node) {
    var p = node.parentNode;
    while (p) {
      if (p.nodeType === 1 && p.tagName === "A") return true;
      p = p.parentNode;
    }
    return false;
  }

  // Rende cliccabili URL/link Markdown scritti come testo semplice anche
  // dentro al contenuto ricco (es. un URL digitato a mano vicino a un link
  // gia' incollato da Word), senza toccare i link gia' presenti.
  function autoLinkTextNodes(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var textNodes = [];
    var n;
    while ((n = walker.nextNode())) textNodes.push(n);
    textNodes.forEach(function (node) {
      if (isInsideAnchor(node)) return;
      var raw = node.nodeValue;
      if (raw.indexOf("http://") === -1 && raw.indexOf("https://") === -1) return;
      var escaped = escapeHtml(raw);
      var linked = linkifyHtml(escaped);
      if (linked === escaped) return;
      var frag = document.createRange().createContextualFragment(linked);
      node.parentNode.replaceChild(frag, node);
    });
  }

  function showToast(msg) {
    var toast = document.querySelector(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    requestAnimationFrame(function () {
      toast.classList.add("visible");
    });
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      toast.classList.remove("visible");
    }, 1800);
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          showToast("Comando copiato");
        },
        function () {
          fallbackCopy(text);
        }
      );
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      showToast("Comando copiato");
    } catch (e) {
      showToast("Copia non riuscita");
    }
    document.body.removeChild(ta);
  }

  // ---------- blocco automatico ----------
  function resetAutoLock() {
    if (autoLockTimer) clearTimeout(autoLockTimer);
    if (state.screen === "vault") {
      autoLockTimer = setTimeout(lockVault, AUTO_LOCK_MS);
    }
  }
  ["mousemove", "keydown", "click"].forEach(function (evt) {
    window.addEventListener(evt, resetAutoLock, { passive: true });
  });

  function lockVault() {
    vaultPassword = null;
    commands = [];
    state.screen = "unlock";
    state.error = null;
    state.view = "home";
    state.currentOS = null;
    state.selectedId = null;
    state.formMode = null;
    state.settingsOpen = false;
    render();
  }

  function enterVault() {
    state.screen = "vault";
    state.error = null;
    render();
    resetAutoLock();
  }

  // ---------- merge ----------
  // Unisce due elenchi di comandi per id, tenendo per ciascun id la versione
  // con updatedAt piu recente. A differenza di uno schema "vince il piu
  // recente" applicato all'intero archivio, questo evita che le modifiche
  // fatte su un dispositivo (mai sincronizzato nel frattempo) vengano
  // cancellate in blocco da un altro dispositivo che sincronizza dopo.
  function mergeCommandArrays(a, b) {
    var byId = {};
    a.concat(b).forEach(function (item) {
      if (!item || !item.id) return;
      var existing = byId[item.id];
      if (!existing || (item.updatedAt || 0) > (existing.updatedAt || 0)) {
        byId[item.id] = item;
      }
    });
    return Object.keys(byId).map(function (id) {
      return byId[id];
    });
  }

  function sortForCompare(items) {
    return (items || [])
      .slice()
      .sort(function (a, b) {
        return (a.id || "").localeCompare(b.id || "");
      });
  }

  function sameCommands(a, b) {
    return JSON.stringify(sortForCompare(a)) === JSON.stringify(sortForCompare(b));
  }

  // ---------- sblocco ----------
  function recoverLegacyInto(baseCommands) {
    // Recupera eventuali comandi salvati con la versione precedente (non cifrata),
    // che il resto del codice non legge più direttamente: senza questo controllo
    // resterebbero "nascosti" per sempre dietro al nuovo vault cifrato.
    var legacy = loadLegacyPlain();
    var legacyItems = Array.isArray(legacy)
      ? legacy.filter(function (i) {
          return i && i.command;
        })
      : [];
    if (legacyItems.length === 0) return { commands: baseCommands, recovered: 0 };

    var existingIds = baseCommands.map(function (i) {
      return i.id;
    });
    var merged = baseCommands.concat(
      legacyItems.map(function (i) {
        var idClash = !i.id || existingIds.indexOf(i.id) !== -1;
        return {
          id: idClash ? uid() : i.id,
          name: i.name || "",
          command: i.command || "",
          notes: i.notes || "",
          os: OS_META[i.os] ? i.os : "mac",
          createdAt: i.createdAt || Date.now(),
          updatedAt: i.updatedAt || Date.now(),
        };
      })
    );
    localStorage.removeItem(LEGACY_KEY);
    return { commands: merged, recovered: legacyItems.length };
  }

  function finishUnlock(pw, baseCommands, needsPush) {
    var recovery = recoverLegacyInto(baseCommands);
    vaultPassword = pw;
    commands = recovery.commands;

    if (needsPush || recovery.recovered > 0) {
      persistLocal().then(function (envelope) {
        if (ghToken()) pushRemoteEnvelope(envelope);
        enterVault();
        if (recovery.recovered > 0) {
          showToast(
            recovery.recovered === 1
              ? "Recuperato 1 comando salvato in precedenza"
              : "Recuperati " + recovery.recovered + " comandi salvati in precedenza"
          );
        }
      });
    } else {
      enterVault();
    }
  }

  function attemptUnlock(pw) {
    state.error = null;
    var localEnv = loadLocalEnvelope();
    fetchRemoteEnvelope().then(function (remoteEnv) {
      var tasks = [];
      if (localEnv) {
        tasks.push(
          decryptPayload(pw, localEnv).then(function (items) {
            return { source: "local", items: Array.isArray(items) ? items : [] };
          })
        );
      }
      if (remoteEnv) {
        tasks.push(
          decryptPayload(pw, remoteEnv).then(function (items) {
            return { source: "remote", items: Array.isArray(items) ? items : [] };
          })
        );
      }

      if (tasks.length === 0) {
        finishUnlock(pw, [], true);
        return;
      }

      Promise.all(tasks)
        .then(function (results) {
          var merged = [];
          var remoteItems = null;
          results.forEach(function (r) {
            merged = mergeCommandArrays(merged, r.items);
            if (r.source === "remote") remoteItems = r.items;
          });

          var needsPush = remoteItems === null || !sameCommands(merged, remoteItems);
          finishUnlock(pw, merged, needsPush);
        })
        .catch(function () {
          state.error = "Password errata.";
          render();
        });
    });
  }

  function renderUnlock() {
    app.innerHTML = "";
    var screenDiv = document.createElement("div");
    screenDiv.className = "auth-screen";
    screenDiv.innerHTML =
      '<div class="auth-card">' +
      '<div class="brand-badge">' +
      terminalLogoSvg(30) +
      "</div>" +
      '<h1 class="brand-title">Comandi Terminale</h1>' +
      '<p class="brand-subtitle">Vault protetto</p>' +
      '<p class="muted">Inserisci la password per sbloccare il tuo archivio di comandi.</p>' +
      '<form id="unlock-form">' +
      '<label for="pw">Password</label>' +
      '<input type="password" id="pw" autocomplete="current-password" required />' +
      (state.error ? '<p class="error">' + escapeHtml(state.error) + "</p>" : "") +
      '<button type="submit" class="primary">Sblocca</button>' +
      "</form>" +
      "</div>";
    app.appendChild(screenDiv);

    var form = document.getElementById("unlock-form");
    var pwInput = document.getElementById("pw");
    pwInput.focus();
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var pw = pwInput.value;
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = "Sblocco in corso...";
      attemptUnlock(pw);
    });
  }

  // ---------- render ----------
  function render() {
    if (state.screen !== "vault") {
      renderUnlock();
      return;
    }

    app.innerHTML = "";
    var layout = document.createElement("div");
    layout.className = "vault-layout";
    layout.appendChild(renderTopbar());

    var body = document.createElement("div");
    body.className = "body";

    if (state.view === "home") {
      body.appendChild(renderHome());
    } else {
      body.appendChild(renderSidebar());
      body.appendChild(renderDetail());
    }

    layout.appendChild(body);
    app.appendChild(layout);

    if (state.pendingImport) {
      app.appendChild(renderImportModal());
    }
    if (state.settingsOpen) {
      app.appendChild(renderSettingsModal());
    }
  }

  function renderTopbar() {
    var topbar = document.createElement("div");
    topbar.className = "topbar";

    var left = document.createElement("div");
    left.className = "topbar-left";

    if (state.view === "section") {
      var back = document.createElement("button");
      back.className = "back-btn";
      back.title = "Torna alla home";
      back.textContent = "←";
      back.addEventListener("click", function () {
        state.view = "home";
        state.currentOS = null;
        state.selectedId = null;
        state.formMode = null;
        state.search = "";
        render();
      });
      left.appendChild(back);
    }

    var h1 = document.createElement("h1");
    if (state.view === "section") {
      h1.innerHTML = osIconSvg(state.currentOS, 18) + "<span>" + OS_META[state.currentOS].label + "</span>";
    } else {
      h1.textContent = "Comandi Terminale";
    }
    left.appendChild(h1);
    topbar.appendChild(left);

    var actions = document.createElement("div");
    actions.className = "topbar-actions";

    var syncNowBtn = document.createElement("button");
    syncNowBtn.className = "ghost";
    syncNowBtn.textContent = "🔄 Sincronizza";
    syncNowBtn.addEventListener("click", syncNow);
    actions.appendChild(syncNowBtn);

    var syncBtn = document.createElement("button");
    syncBtn.className = "back-btn";
    syncBtn.title = "Impostazioni sincronizzazione";
    syncBtn.textContent = "⚙️";
    syncBtn.addEventListener("click", function () {
      state.settingsOpen = true;
      render();
    });
    actions.appendChild(syncBtn);

    var exportBtn = document.createElement("button");
    exportBtn.className = "ghost";
    exportBtn.textContent = "Esporta";
    exportBtn.addEventListener("click", exportData);
    actions.appendChild(exportBtn);

    var importBtn = document.createElement("button");
    importBtn.className = "ghost";
    importBtn.textContent = "Importa";
    importBtn.addEventListener("click", function () {
      importInput.click();
    });
    actions.appendChild(importBtn);

    var lockBtn = document.createElement("button");
    lockBtn.className = "back-btn";
    lockBtn.title = "Blocca il vault";
    lockBtn.textContent = "🔒";
    lockBtn.addEventListener("click", lockVault);
    actions.appendChild(lockBtn);

    topbar.appendChild(actions);
    return topbar;
  }

  function renderHome() {
    var home = document.createElement("div");
    home.className = "home";

    var intro = document.createElement("div");
    intro.className = "home-intro";
    intro.innerHTML =
      "<h2>Dove vuoi archiviare i tuoi comandi?</h2>" +
      '<p class="muted">Scegli un sistema operativo per vedere, cercare o aggiungere comandi.</p>';
    home.appendChild(intro);

    var grid = document.createElement("div");
    grid.className = "os-grid";

    var items = loadData();

    OS_ORDER.forEach(function (osKey) {
      var count = items.filter(function (i) {
        return i.os === osKey;
      }).length;

      var card = document.createElement("div");
      card.className = "os-card";
      card.innerHTML =
        '<div class="os-icon">' +
        osIconSvg(osKey, 32) +
        "</div>" +
        "<h3>" +
        OS_META[osKey].label +
        "</h3>" +
        '<p class="muted small">' +
        count +
        (count === 1 ? " comando" : " comandi") +
        "</p>";
      card.addEventListener("click", function () {
        state.view = "section";
        state.currentOS = osKey;
        state.search = "";
        state.selectedId = null;
        state.formMode = null;
        render();
      });
      grid.appendChild(card);
    });

    home.appendChild(grid);
    return home;
  }

  function getFilteredEntries() {
    var items = loadData().filter(function (i) {
      return i.os === state.currentOS;
    });
    var q = state.search.trim().toLowerCase();
    if (q) {
      items = items.filter(function (i) {
        return (
          (i.name || "").toLowerCase().indexOf(q) !== -1 ||
          (i.command || "").toLowerCase().indexOf(q) !== -1 ||
          (i.notes || "").toLowerCase().indexOf(q) !== -1
        );
      });
    }
    items.sort(function (a, b) {
      return (a.name || "").localeCompare(b.name || "");
    });
    return items;
  }

  function renderSidebar() {
    var sidebar = document.createElement("div");
    sidebar.className = "sidebar";

    var top = document.createElement("div");
    top.className = "sidebar-top";

    var search = document.createElement("input");
    search.type = "text";
    search.placeholder = "Cerca per nome, comando o note...";
    search.value = state.search;
    search.addEventListener("input", function (e) {
      state.search = e.target.value;
      renderSidebarOnly();
    });
    top.appendChild(search);

    var addBtn = document.createElement("button");
    addBtn.className = "primary";
    addBtn.textContent = "+ Nuovo comando";
    addBtn.addEventListener("click", function () {
      state.formMode = "new";
      state.selectedId = null;
      render();
      focusFirstFormField();
    });
    top.appendChild(addBtn);

    sidebar.appendChild(top);

    var list = document.createElement("ul");
    list.className = "entry-list";
    var entries = getFilteredEntries();

    if (entries.length === 0) {
      var empty = document.createElement("div");
      empty.className = "empty-list";
      empty.textContent = state.search
        ? "Nessun comando trovato."
        : "Nessun comando salvato per " + OS_META[state.currentOS].label + ".";
      list.appendChild(empty);
    } else {
      entries.forEach(function (entry) {
        var li = document.createElement("li");
        li.className = "entry-item" + (entry.id === state.selectedId && !state.formMode ? " selected" : "");
        li.innerHTML =
          '<div class="entry-title">' +
          escapeHtml(entry.name || "(senza nome)") +
          "</div>" +
          '<div class="entry-sub">' +
          escapeHtml(entry.command || "") +
          "</div>";
        li.addEventListener("click", function () {
          state.selectedId = entry.id;
          state.formMode = null;
          render();
        });
        list.appendChild(li);
      });
    }

    sidebar.appendChild(list);
    return sidebar;
  }

  function renderSidebarOnly() {
    var body = app.querySelector(".body");
    var oldSidebar = app.querySelector(".sidebar");
    if (body && oldSidebar) {
      body.replaceChild(renderSidebar(), oldSidebar);
      var search = app.querySelector(".sidebar-top input");
      if (search) {
        search.focus();
        var v = search.value;
        search.value = "";
        search.value = v;
      }
    }
  }

  function focusFirstFormField() {
    var field = app.querySelector(".entry-form input, .entry-form textarea");
    if (field) field.focus();
  }

  function renderDetail() {
    var detail = document.createElement("div");
    detail.className = "detail";

    if (state.formMode) {
      detail.appendChild(renderForm());
      return detail;
    }

    var entry = null;
    if (state.selectedId) {
      entry = loadData().filter(function (i) {
        return i.id === state.selectedId;
      })[0];
    }

    if (!entry) {
      var placeholder = document.createElement("div");
      placeholder.className = "placeholder";
      placeholder.textContent = "Seleziona un comando dalla lista oppure creane uno nuovo.";
      detail.appendChild(placeholder);
      return detail;
    }

    var view = document.createElement("div");
    view.className = "entry-view";

    var header = document.createElement("div");
    header.className = "entry-view-header";
    header.innerHTML =
      "<div><span class=\"badge\">" +
      osIconSvg(entry.os, 14) +
      "<span>" +
      OS_META[entry.os].label +
      "</span>" +
      "</span><h2>" +
      escapeHtml(entry.name || "(senza nome)") +
      "</h2></div>";

    var actions = document.createElement("div");
    actions.className = "actions";

    var editBtn = document.createElement("button");
    editBtn.className = "ghost";
    editBtn.textContent = "Modifica";
    editBtn.addEventListener("click", function () {
      state.formMode = "edit";
      render();
      focusFirstFormField();
    });
    actions.appendChild(editBtn);

    var delBtn = document.createElement("button");
    delBtn.className = "danger";
    delBtn.textContent = "Elimina";
    delBtn.addEventListener("click", function () {
      if (confirm('Eliminare il comando "' + (entry.name || "") + '"?')) {
        var items = loadData().filter(function (i) {
          return i.id !== entry.id;
        });
        saveData(items).then(function () {
          state.selectedId = null;
          showToast("Comando eliminato");
          render();
        });
      }
    });
    actions.appendChild(delBtn);

    header.appendChild(actions);
    view.appendChild(header);

    var cmdRow = document.createElement("div");
    cmdRow.className = "field-row";
    cmdRow.innerHTML = "<label>Comando</label>";
    var cmdValue = document.createElement("div");
    cmdValue.className = "field-value";
    var cmdSpan = document.createElement("span");
    cmdSpan.className = "command-value";
    cmdSpan.textContent = entry.command || "";
    cmdValue.appendChild(cmdSpan);
    var copyBtn = document.createElement("button");
    copyBtn.className = "icon-btn";
    copyBtn.title = "Copia";
    copyBtn.textContent = "📋";
    copyBtn.addEventListener("click", function () {
      copyToClipboard(entry.command || "");
    });
    cmdValue.appendChild(copyBtn);
    cmdRow.appendChild(cmdValue);
    view.appendChild(cmdRow);

    if (entry.notes) {
      var notesRow = document.createElement("div");
      notesRow.className = "field-row";
      notesRow.innerHTML = "<label>Note</label>";
      var notesValue = document.createElement("div");
      notesValue.className = "field-value notes";
      var notesSpan = document.createElement("span");
      notesSpan.innerHTML =
        entry.notesFormat === "html" ? sanitizeNotesHtml(entry.notes) : renderNotesHtml(entry.notes);
      notesValue.appendChild(notesSpan);
      notesRow.appendChild(notesValue);
      view.appendChild(notesRow);
    }

    detail.appendChild(view);
    return detail;
  }

  function renderForm() {
    var entry = null;
    if (state.formMode === "edit" && state.selectedId) {
      entry = loadData().filter(function (i) {
        return i.id === state.selectedId;
      })[0];
    }

    var form = document.createElement("form");
    form.className = "entry-form";

    var osValue = entry ? entry.os : state.currentOS;

    form.innerHTML =
      "<h2>" +
      (entry ? "Modifica comando" : "Nuovo comando") +
      "</h2>" +
      "<label>Sistema operativo</label>" +
      '<div class="os-toggle" id="os-toggle"></div>' +
      "<label>Nome</label>" +
      '<input type="text" name="name" placeholder="Es. Elenco file dettagliato" required />' +
      "<label>Comando</label>" +
      '<textarea name="command" class="mono" rows="3" placeholder="Es. ls -la" required></textarea>' +
      "<label>Note</label>" +
      '<div class="notes-editable mono" id="notes-editable" contenteditable="true" ' +
      'data-placeholder="Note opzionali... Incolla pure testo con link o tabelle: restano attivi. Gli URL scritti a mano diventano cliccabili automaticamente, oppure usa [testo](url) per un\'etichetta personalizzata."></div>' +
      '<div class="form-actions">' +
      '<button type="submit" class="primary">Salva</button>' +
      '<button type="button" class="ghost" id="cancel-form">Annulla</button>' +
      "</div>";

    form.querySelector('[name="name"]').value = entry ? entry.name || "" : "";
    form.querySelector('[name="command"]').value = entry ? entry.command || "" : "";

    var notesEditable = form.querySelector("#notes-editable");
    if (entry && entry.notes) {
      if (entry.notesFormat === "html") {
        notesEditable.innerHTML = sanitizeNotesHtml(entry.notes);
      } else {
        notesEditable.textContent = entry.notes;
      }
    }
    notesEditable.addEventListener("paste", function (e) {
      e.preventDefault();
      var cd = e.clipboardData || window.clipboardData;
      var html = cd.getData("text/html");
      var text = cd.getData("text/plain");
      var toInsert = html ? sanitizeNotesHtml(html) : renderNotesHtml(text || "");
      document.execCommand("insertHTML", false, toInsert);
    });

    var toggle = form.querySelector("#os-toggle");
    var selectedOs = osValue;
    OS_ORDER.forEach(function (osKey) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = osKey === selectedOs ? "active" : "";
      btn.innerHTML = osIconSvg(osKey, 16) + "<span>" + OS_META[osKey].label + "</span>";
      btn.addEventListener("click", function () {
        selectedOs = osKey;
        Array.prototype.forEach.call(toggle.children, function (c, idx) {
          c.className = OS_ORDER[idx] === selectedOs ? "active" : "";
        });
      });
      toggle.appendChild(btn);
    });

    form.querySelector("#cancel-form").addEventListener("click", function () {
      state.formMode = null;
      render();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = form.querySelector('[name="name"]').value.trim();
      var command = form.querySelector('[name="command"]').value.trim();

      autoLinkTextNodes(notesEditable);
      var notesIsEmpty = notesEditable.textContent.trim() === "";
      var notes = notesIsEmpty ? "" : sanitizeNotesHtml(notesEditable.innerHTML);

      if (!name || !command) return;

      var items = loadData();
      var isEdit = !!entry;

      if (entry) {
        items = items.map(function (i) {
          if (i.id === entry.id) {
            return {
              id: i.id,
              name: name,
              command: command,
              notes: notes,
              notesFormat: notesIsEmpty ? undefined : "html",
              os: selectedOs,
              createdAt: i.createdAt,
              updatedAt: Date.now(),
            };
          }
          return i;
        });
      } else {
        var newEntry = {
          id: uid(),
          name: name,
          command: command,
          notes: notes,
          notesFormat: notesIsEmpty ? undefined : "html",
          os: selectedOs,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        items.push(newEntry);
        state.selectedId = newEntry.id;
      }

      saveData(items).then(function () {
        showToast(isEdit ? "Comando aggiornato" : "Comando salvato");
        state.formMode = null;
        if (selectedOs !== state.currentOS) {
          state.currentOS = selectedOs;
        }
        render();
      });
    });

    return form;
  }

  // ---------- export / import ----------
  function exportData() {
    var items = loadData();
    var blob = new Blob([JSON.stringify(items, null, 2)], {
      type: "application/json",
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = "comandi-terminale-" + stamp + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Esportazione completata");
  }

  function normalizeImported(raw) {
    if (!Array.isArray(raw)) return null;
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var item = raw[i];
      if (!item || typeof item !== "object") continue;
      if (!item.command) continue;
      var os = OS_META[item.os] ? item.os : "mac";
      var notesFormat = item.notesFormat === "html" ? "html" : undefined;
      out.push({
        id: item.id && typeof item.id === "string" ? item.id : uid(),
        name: item.name || "",
        command: item.command || "",
        notes: notesFormat === "html" ? sanitizeNotesHtml(item.notes || "") : item.notes || "",
        notesFormat: notesFormat,
        os: os,
        createdAt: item.createdAt || Date.now(),
        updatedAt: item.updatedAt || Date.now(),
      });
    }
    return out;
  }

  importInput.addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        var normalized = normalizeImported(parsed);
        if (!normalized) {
          showToast("File non valido");
          return;
        }
        state.pendingImport = normalized;
        render();
      } catch (err) {
        showToast("File non valido");
      }
    };
    reader.readAsText(file);
    importInput.value = "";
  });

  function renderImportModal() {
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    var modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML =
      "<h3>Importa comandi</h3>" +
      '<p class="muted small">Trovati ' +
      state.pendingImport.length +
      " comandi nel file. Vuoi unirli a quelli esistenti o sostituire completamente l'archivio?</p>" +
      '<div class="form-actions">' +
      '<button type="button" class="primary" id="import-merge">Unisci</button>' +
      '<button type="button" class="danger" id="import-replace">Sostituisci tutto</button>' +
      '<button type="button" class="ghost" id="import-cancel">Annulla</button>' +
      "</div>";

    modal.querySelector("#import-merge").addEventListener("click", function () {
      var existing = loadData();
      var existingIds = existing.map(function (i) {
        return i.id;
      });
      var merged = existing.concat(
        state.pendingImport.map(function (i) {
          return existingIds.indexOf(i.id) !== -1 ? Object.assign({}, i, { id: uid() }) : i;
        })
      );
      saveData(merged).then(function () {
        state.pendingImport = null;
        showToast("Comandi uniti all'archivio");
        render();
      });
    });

    modal.querySelector("#import-replace").addEventListener("click", function () {
      saveData(state.pendingImport).then(function () {
        state.pendingImport = null;
        showToast("Archivio sostituito");
        render();
      });
    });

    modal.querySelector("#import-cancel").addEventListener("click", function () {
      state.pendingImport = null;
      render();
    });

    overlay.appendChild(modal);
    return overlay;
  }

  // ---------- impostazioni di sincronizzazione ----------
  function syncNow() {
    showToast("Sincronizzazione in corso...");
    return fetchRemoteEnvelope().then(function (remoteEnv) {
      if (!remoteEnv) {
        showToast("Nessun dato remoto trovato");
        return;
      }
      return decryptPayload(vaultPassword, remoteEnv)
        .then(function (remoteItems) {
          remoteItems = Array.isArray(remoteItems) ? remoteItems : [];
          var merged = mergeCommandArrays(commands, remoteItems);
          var localChanged = !sameCommands(merged, commands);
          var remoteStale = !sameCommands(merged, remoteItems);

          commands = merged;

          if (!localChanged && !remoteStale) {
            showToast("Sei già aggiornato");
            return;
          }

          return persistLocal().then(function (envelope) {
            if (localChanged) render();
            if (remoteStale && ghToken()) {
              return pushRemoteEnvelope(envelope).then(function (result) {
                showToast(result.ok ? "Sincronizzato" : "Sincronizzazione non riuscita");
              });
            }
            showToast(localChanged ? "Dati aggiornati dal cloud" : "Sei già aggiornato");
          });
        })
        .catch(function () {
          showToast("Impossibile decifrare i dati remoti");
        });
    });
  }

  function renderSettingsModal() {
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    var modal = document.createElement("div");
    modal.className = "modal";

    var hasToken = !!ghToken();

    modal.innerHTML =
      "<h3>Sincronizzazione GitHub</h3>" +
      '<p class="muted small">I comandi sono cifrati con la tua password prima di essere salvati nel repository GitHub: restano illeggibili anche perché il repository è pubblico. La lettura funziona già su qualsiasi dispositivo. Per salvare le modifiche fatte da QUESTO dispositivo serve invece un token GitHub personale, da configurare una sola volta.</p>' +
      '<label for="gh-token">Token GitHub</label>' +
      '<input type="password" id="gh-token" placeholder="' +
      (hasToken ? "già configurato su questo dispositivo" : "ghp_...") +
      '" autocomplete="off" />' +
      '<p class="muted small">Crealo su <span class="mono">github.com/settings/personal-access-tokens/new</span> → "Only select repositories" → <span class="mono">' +
      GH_REPO +
      '</span> → permesso <span class="mono">Contents: Read and write</span>.</p>' +
      '<div class="form-actions">' +
      '<button type="button" class="primary" id="save-token">Salva token</button>' +
      (hasToken ? '<button type="button" class="danger" id="remove-token">Rimuovi</button>' : "") +
      "</div>" +
      '<div class="form-actions">' +
      '<button type="button" class="ghost" id="close-settings">Chiudi</button>' +
      "</div>";

    modal.querySelector("#save-token").addEventListener("click", function () {
      var val = modal.querySelector("#gh-token").value.trim();
      if (!val) return;
      setGhToken(val);
      showToast("Token salvato su questo dispositivo");
      state.settingsOpen = false;
      render();
    });

    var removeBtn = modal.querySelector("#remove-token");
    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        setGhToken("");
        showToast("Token rimosso");
        state.settingsOpen = false;
        render();
      });
    }

    modal.querySelector("#close-settings").addEventListener("click", function () {
      state.settingsOpen = false;
      render();
    });

    overlay.appendChild(modal);
    return overlay;
  }

  // ---------- avvio ----------
  loadCustomIcons();
  render();
})();
