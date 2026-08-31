(function () {
  "use strict";

  var STORAGE_KEY = "terminal-commands:data";

  var OS_META = {
    mac: { label: "Mac", icon: "🍎" },
    windows: { label: "Windows", icon: "🪟" },
    linux: { label: "Linux", icon: "🐧" },
  };
  var OS_ORDER = ["mac", "windows", "linux"];

  var state = {
    view: "home", // 'home' | 'section'
    currentOS: null,
    search: "",
    selectedId: null,
    formMode: null, // null | 'new' | 'edit'
    pendingImport: null, // parsed array waiting for merge/replace confirmation
  };

  var app = document.getElementById("app");
  var importInput = document.getElementById("import-input");

  // ---------- storage ----------
  function loadData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveData(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- helpers ----------
  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
      );
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

  // ---------- render ----------
  function render() {
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
    h1.textContent =
      state.view === "section"
        ? OS_META[state.currentOS].icon + " " + OS_META[state.currentOS].label
        : "Comandi Terminale";
    left.appendChild(h1);
    topbar.appendChild(left);

    var actions = document.createElement("div");
    actions.className = "topbar-actions";

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
        OS_META[osKey].icon +
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
        li.className =
          "entry-item" + (entry.id === state.selectedId && !state.formMode ? " selected" : "");
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
      OS_META[entry.os].icon +
      " " +
      OS_META[entry.os].label +
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
        saveData(items);
        state.selectedId = null;
        showToast("Comando eliminato");
        render();
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
      notesSpan.textContent = entry.notes;
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
      '<textarea name="notes" rows="4" placeholder="Note opzionali..."></textarea>' +
      '<div class="form-actions">' +
      '<button type="submit" class="primary">Salva</button>' +
      '<button type="button" class="ghost" id="cancel-form">Annulla</button>' +
      "</div>";

    form.querySelector('[name="name"]').value = entry ? entry.name || "" : "";
    form.querySelector('[name="command"]').value = entry ? entry.command || "" : "";
    form.querySelector('[name="notes"]').value = entry ? entry.notes || "" : "";

    var toggle = form.querySelector("#os-toggle");
    var selectedOs = osValue;
    OS_ORDER.forEach(function (osKey) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = osKey === selectedOs ? "active" : "";
      btn.innerHTML = OS_META[osKey].icon + " " + OS_META[osKey].label;
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
      var notes = form.querySelector('[name="notes"]').value.trim();

      if (!name || !command) return;

      var items = loadData();

      if (entry) {
        items = items.map(function (i) {
          if (i.id === entry.id) {
            return {
              id: i.id,
              name: name,
              command: command,
              notes: notes,
              os: selectedOs,
              createdAt: i.createdAt,
              updatedAt: Date.now(),
            };
          }
          return i;
        });
        showToast("Comando aggiornato");
      } else {
        var newEntry = {
          id: uid(),
          name: name,
          command: command,
          notes: notes,
          os: selectedOs,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        items.push(newEntry);
        state.selectedId = newEntry.id;
        showToast("Comando salvato");
      }

      saveData(items);
      state.formMode = null;
      if (selectedOs !== state.currentOS) {
        state.currentOS = selectedOs;
      }
      render();
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
      out.push({
        id: item.id && typeof item.id === "string" ? item.id : uid(),
        name: item.name || "",
        command: item.command || "",
        notes: item.notes || "",
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
      saveData(merged);
      state.pendingImport = null;
      showToast("Comandi uniti all'archivio");
      render();
    });

    modal.querySelector("#import-replace").addEventListener("click", function () {
      saveData(state.pendingImport);
      state.pendingImport = null;
      showToast("Archivio sostituito");
      render();
    });

    modal.querySelector("#import-cancel").addEventListener("click", function () {
      state.pendingImport = null;
      render();
    });

    overlay.appendChild(modal);
    return overlay;
  }

  render();
})();
