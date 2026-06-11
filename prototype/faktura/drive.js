/* ════════════════════════════════════════════════════════════════════════
   Faktura — Google Drive-synk (valfritt, klient-side, inget backend)
   Använder Google Identity Services för OAuth-token och Drive REST API för
   att lagra all data som en JSON-fil i användarens egen Drive.

   Scope: drive.file → appen ser bara filer den själv skapat. Detta är INTE
   en känslig scope, så Google kräver ingen app-verifiering. Varje bolag kan
   ansluta sitt eget Google-konto.

   Engångssetup (görs av användaren, beskrivs i appens Inställningar):
     1. console.cloud.google.com → nytt projekt
     2. Aktivera "Google Drive API"
     3. Skapa OAuth-klient-ID (typ: Webbapp)
     4. Lägg till sidans URL under "Authorized JavaScript origins"
     5. Klistra in klient-ID:t i appens Inställningar
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const Faktura = (window.Faktura = window.Faktura || {});

  const SCOPE = "https://www.googleapis.com/auth/drive.file";
  const DATA_FILENAME = "faktura-data.json";
  const PDF_FOLDER = "Fakturor";

  let tokenClient = null;
  let accessToken = null;
  let gisLoaded = false;

  function settings() {
    return Faktura.Store.getState().settings.drive;
  }
  function clientId() {
    return (settings().clientId || "").trim();
  }
  function isConfigured() {
    return !!clientId();
  }
  function isConnected() {
    return !!settings().connectedEmail;
  }

  /* ── Ladda Google Identity Services ───────────────────────────────────── */
  function loadGIS() {
    return new Promise((resolve, reject) => {
      if (gisLoaded && window.google && window.google.accounts) return resolve();
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      s.onload = () => {
        gisLoaded = true;
        resolve();
      };
      s.onerror = () => reject(new Error("Kunde inte ladda Google-biblioteket."));
      document.head.appendChild(s);
    });
  }

  /* ── Hämta access-token (interaktivt vid behov) ───────────────────────── */
  function getToken(interactive) {
    return new Promise(async (resolve, reject) => {
      if (!isConfigured()) return reject(new Error("Inget Google klient-ID angivet."));
      await loadGIS();
      if (!tokenClient) {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId(),
          scope: SCOPE,
          callback: () => {}, // sätts per anrop nedan
        });
      }
      tokenClient.callback = (resp) => {
        if (resp.error) return reject(new Error(resp.error));
        accessToken = resp.access_token;
        resolve(accessToken);
      };
      try {
        tokenClient.requestAccessToken({ prompt: interactive ? "consent" : "" });
      } catch (e) {
        reject(e);
      }
    });
  }

  async function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign(
      { Authorization: "Bearer " + accessToken },
      opts.headers || {}
    );
    const res = await fetch("https://www.googleapis.com/" + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body,
    });
    if (res.status === 401) {
      // Token utgången — försök förnya en gång.
      await getToken(false);
      headers.Authorization = "Bearer " + accessToken;
      return fetch("https://www.googleapis.com/" + path, {
        method: opts.method || "GET",
        headers: headers,
        body: opts.body,
      });
    }
    return res;
  }

  /* ── Anslut (interaktiv inloggning) ───────────────────────────────────── */
  async function connect() {
    await getToken(true);
    // Hämta e-post för att visa vem som är ansluten.
    let email = "";
    try {
      const r = await api("oauth2/v3/userinfo");
      if (r.ok) email = (await r.json()).email || "";
    } catch (e) {
      /* ignorera */
    }
    const s = Faktura.Store.getState().settings.drive;
    s.connectedEmail = email || "ansluten";
    Faktura.Store.save();
    return s.connectedEmail;
  }

  function disconnect() {
    const s = Faktura.Store.getState().settings.drive;
    if (accessToken && window.google && window.google.accounts) {
      try {
        window.google.accounts.oauth2.revoke(accessToken, () => {});
      } catch (e) {}
    }
    accessToken = null;
    s.connectedEmail = "";
    s.fileId = "";
    Faktura.Store.save();
  }

  /* ── Hitta/skapa datafilen ────────────────────────────────────────────── */
  async function findDataFile() {
    const q = encodeURIComponent(
      "name='" + DATA_FILENAME + "' and trashed=false"
    );
    const r = await api("drive/v3/files?q=" + q + "&spaces=drive&fields=files(id,name,modifiedTime)");
    if (!r.ok) throw new Error("Drive-sökning misslyckades (" + r.status + ").");
    const data = await r.json();
    return data.files && data.files[0] ? data.files[0] : null;
  }

  function multipartBody(metadata, content, boundary, mime) {
    return (
      "--" + boundary + "\r\n" +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) + "\r\n" +
      "--" + boundary + "\r\n" +
      "Content-Type: " + (mime || "application/json") + "\r\n\r\n" +
      content + "\r\n" +
      "--" + boundary + "--"
    );
  }

  /* ── Synka upp (spara) ────────────────────────────────────────────────── */
  async function syncUp(silent) {
    try {
      if (!isConfigured()) throw new Error("Drive ej konfigurerat.");
      if (!accessToken) await getToken(false);

      const s = Faktura.Store.getState().settings.drive;
      const content = Faktura.Store.exportJSON();
      const boundary = "fkt" + Date.now();
      const meta = { name: DATA_FILENAME, mimeType: "application/json" };

      let fileId = s.fileId;
      if (!fileId) {
        const existing = await findDataFile();
        fileId = existing ? existing.id : null;
      }

      const method = fileId ? "PATCH" : "POST";
      const path = fileId
        ? "upload/drive/v3/files/" + fileId + "?uploadType=multipart&fields=id"
        : "upload/drive/v3/files?uploadType=multipart&fields=id";

      const r = await api(path, {
        method: method,
        headers: { "Content-Type": "multipart/related; boundary=" + boundary },
        body: multipartBody(meta, content, boundary),
      });
      if (!r.ok) throw new Error("Uppladdning misslyckades (" + r.status + ").");
      const out = await r.json();
      s.fileId = out.id;
      s.lastSync = new Date().toISOString();
      Faktura.Store.save();
      window.dispatchEvent(new CustomEvent("faktura:drive", { detail: { ok: true, dir: "up" } }));
      return out.id;
    } catch (e) {
      if (!silent) throw e;
      console.warn("Drive auto-synk misslyckades:", e.message);
    }
  }

  /* ── Synka ner (hämta) ────────────────────────────────────────────────── */
  async function syncDown() {
    if (!isConfigured()) throw new Error("Drive ej konfigurerat.");
    if (!accessToken) await getToken(false);

    const file = await findDataFile();
    if (!file) throw new Error("Ingen sparad fil hittades i Drive ännu.");
    const r = await api("drive/v3/files/" + file.id + "?alt=media");
    if (!r.ok) throw new Error("Nedladdning misslyckades (" + r.status + ").");
    const text = await r.text();
    Faktura.Store.importJSON(text, false);
    const s = Faktura.Store.getState().settings.drive;
    s.fileId = file.id;
    s.lastSync = new Date().toISOString();
    Faktura.Store.save();
    window.dispatchEvent(new CustomEvent("faktura:drive", { detail: { ok: true, dir: "down" } }));
    return true;
  }

  /* ── Ladda upp en faktura-PDF till en mapp i Drive ────────────────────── */
  async function ensureFolder() {
    const q = encodeURIComponent(
      "name='" + PDF_FOLDER + "' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    );
    const r = await api("drive/v3/files?q=" + q + "&fields=files(id,name)");
    const data = await r.json();
    if (data.files && data.files[0]) return data.files[0].id;
    const cr = await api("drive/v3/files?fields=id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: PDF_FOLDER, mimeType: "application/vnd.google-apps.folder" }),
    });
    return (await cr.json()).id;
  }

  async function uploadPdf(inv, company, customer) {
    if (!isConfigured()) throw new Error("Drive ej konfigurerat.");
    if (!accessToken) await getToken(false);
    const folderId = await ensureFolder();
    const b64 = Faktura.Pdf.base64(inv, company, customer);
    const boundary = "pdf" + Date.now();
    const meta = {
      name: Faktura.Pdf.filename(inv, company),
      parents: [folderId],
      mimeType: "application/pdf",
    };
    const r = await api("upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
      method: "POST",
      headers: { "Content-Type": "multipart/related; boundary=" + boundary },
      body: multipartBody(meta, b64, boundary, "application/pdf"),
    });
    if (!r.ok) throw new Error("PDF-uppladdning misslyckades (" + r.status + ").");
    return await r.json();
  }

  Faktura.Drive = {
    isConfigured,
    isConnected,
    connect,
    disconnect,
    syncUp,
    syncDown,
    uploadPdf,
    SCOPE,
  };
})();
