/* ════════════════════════════════════════════════════════════════════════
   Faktura — inloggning med magic link (Supabase Auth)

   Hela faktura-appen ligger bakom en låsskärm. Inloggning sker via
   e-postlänk (magic link) — samma upplevelse som Skärgårdskyrkan-CRM:et,
   men med Supabase som server (statisk sajt har ingen egen backend).

   Endast adresser i ALLOWED_EMAILS släpps in. OBS: gör även motsvarande
   spärr i Supabase (Authentication → Sign In / Up → stäng av "Allow new
   users to sign up" och skapa användaren manuellt) — då kan ingen annan
   logga in ens om de manipulerar klientkoden.

   Engångskonfiguration görs direkt på låsskärmen: klistra in projektets
   URL + anon-nyckel från supabase.com (Settings → API). Anon-nyckeln är
   publik per design — säkerheten ligger i Supabase-inställningarna.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const Faktura = (window.Faktura = window.Faktura || {});

  const CFG_KEY = "faktura.auth.cfg.v1";
  const ALLOWED_EMAILS = ["brolinjosef@gmail.com"];
  const SDK_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";

  let client = null;
  let overlayEl = null;

  /* ── Konfiguration (Supabase URL + anon key) ──────────────────────────── */
  function getCfg() {
    try {
      const c = JSON.parse(localStorage.getItem(CFG_KEY) || "null");
      return c && c.url && c.anonKey ? c : null;
    } catch (e) {
      return null;
    }
  }
  function setCfg(url, anonKey) {
    localStorage.setItem(CFG_KEY, JSON.stringify({ url: url.trim(), anonKey: anonKey.trim() }));
  }

  function loadSdk() {
    return new Promise((resolve, reject) => {
      if (window.supabase && window.supabase.createClient) return resolve();
      const s = document.createElement("script");
      s.src = SDK_URL;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Kunde inte ladda inloggningsbiblioteket (CDN)."));
      document.head.appendChild(s);
    });
  }

  function isAllowed(email) {
    return ALLOWED_EMAILS.indexOf(String(email || "").trim().toLowerCase()) >= 0;
  }

  /* ── Låsskärm ─────────────────────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function showOverlay() {
    if (overlayEl) overlayEl.remove();
    const configured = !!getCfg();
    overlayEl = document.createElement("div");
    overlayEl.className = "lock-overlay";
    overlayEl.innerHTML =
      '<div class="lock-box">' +
      '<div class="brand" style="justify-content:center;margin-bottom:6px"><span class="brand-dot"></span> Lugn <small>FAKTURA</small></div>' +
      '<h1 class="lock-title">Logga in</h1>' +
      '<p class="lock-sub">Faktura-delen är privat. Ange din e-postadress så skickas en inloggningslänk.</p>' +
      '<div class="lock-form">' +
      '<input type="email" id="lockEmail" placeholder="namn@exempel.se" value="' +
      esc(ALLOWED_EMAILS[0]) +
      '" autocomplete="email">' +
      '<button class="btn btn-primary" id="lockSend"' +
      (configured ? "" : " disabled") +
      ">Skicka inloggningslänk</button>" +
      "</div>" +
      '<p class="lock-status" id="lockStatus"></p>' +
      (configured
        ? ""
        : '<div class="lock-setup"><h3>Engångskonfiguration</h3>' +
          "<p>1. Skapa gratisprojekt på <strong>supabase.com</strong><br>" +
          "2. Authentication → Sign In/Up: stäng av <em>Allow new users to sign up</em><br>" +
          "3. Authentication → Users → Add user: <strong>" +
          esc(ALLOWED_EMAILS[0]) +
          "</strong> (auto-confirm)<br>" +
          "4. Authentication → URL Configuration: lägg till denna sidas adress som Redirect URL<br>" +
          "5. Settings → API: kopiera URL + anon-nyckel hit:</p>" +
          '<input type="text" id="cfgUrl" placeholder="https://xxxx.supabase.co">' +
          '<input type="text" id="cfgKey" placeholder="anon-nyckel (eyJ...)">' +
          '<button class="btn btn-coral" id="cfgSave">Spara &amp; aktivera inloggning</button>' +
          "</div>") +
      "</div>";
    document.body.appendChild(overlayEl);

    const status = overlayEl.querySelector("#lockStatus");
    const sendBtn = overlayEl.querySelector("#lockSend");
    if (sendBtn)
      sendBtn.onclick = async () => {
        const email = overlayEl.querySelector("#lockEmail").value.trim().toLowerCase();
        if (!isAllowed(email)) {
          status.textContent = "Den adressen har inte behörighet.";
          status.className = "lock-status err";
          return;
        }
        sendBtn.disabled = true;
        sendBtn.textContent = "Skickar …";
        try {
          const { error } = await client.auth.signInWithOtp({
            email: email,
            options: { emailRedirectTo: location.origin + location.pathname },
          });
          if (error) throw error;
          status.textContent = "Inloggningslänk skickad — kolla din mejl och klicka på länken.";
          status.className = "lock-status ok";
          sendBtn.textContent = "Skicka igen";
        } catch (e) {
          status.textContent = "Kunde inte skicka: " + e.message;
          status.className = "lock-status err";
          sendBtn.textContent = "Skicka inloggningslänk";
        }
        sendBtn.disabled = false;
      };

    const cfgSave = overlayEl.querySelector("#cfgSave");
    if (cfgSave)
      cfgSave.onclick = () => {
        const url = overlayEl.querySelector("#cfgUrl").value.trim();
        const key = overlayEl.querySelector("#cfgKey").value.trim();
        if (!/^https:\/\/.+\.supabase\.co\/?$/.test(url)) {
          alert("URL:en ser inte ut som en Supabase-projekt-URL (https://xxxx.supabase.co).");
          return;
        }
        if (key.length < 20) {
          alert("Anon-nyckeln ser för kort ut.");
          return;
        }
        setCfg(url, key);
        location.reload();
      };
  }

  function hideOverlay() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  }

  /* ── Utloggningsknapp i topbaren ──────────────────────────────────────── */
  function addLogoutButton(email) {
    const bar = document.querySelector(".topbar-right");
    if (!bar || document.getElementById("logoutBtn")) return;
    const btn = document.createElement("button");
    btn.id = "logoutBtn";
    btn.className = "btn btn-ghost btn-sm";
    btn.title = "Inloggad som " + email;
    btn.textContent = "Logga ut";
    btn.onclick = async () => {
      try {
        await client.auth.signOut();
      } catch (e) {}
      location.reload();
    };
    bar.appendChild(btn);
  }

  /* ── Init ─────────────────────────────────────────────────────────────── */
  async function init() {
    showOverlay(); // lås direkt — släpp först vid giltig session

    const cfg = getCfg();
    if (!cfg) return; // okonfigurerat: låsskärmen visar setup-stegen

    try {
      await loadSdk();
      client = window.supabase.createClient(cfg.url, cfg.anonKey);
    } catch (e) {
      const st = document.getElementById("lockStatus");
      if (st) {
        st.textContent = e.message;
        st.className = "lock-status err";
      }
      return;
    }

    // Befintlig session? (detectSessionInUrl fångar magic link-redirecten)
    const check = (session) => {
      const email = session && session.user ? session.user.email : null;
      if (email && isAllowed(email)) {
        hideOverlay();
        addLogoutButton(email);
      } else if (email) {
        // Inloggad men ej behörig — kasta ut.
        client.auth.signOut();
        const st = document.getElementById("lockStatus");
        if (st) {
          st.textContent = "Kontot " + email + " har inte behörighet.";
          st.className = "lock-status err";
        }
      }
    };

    const { data } = await client.auth.getSession();
    check(data ? data.session : null);
    client.auth.onAuthStateChange((_event, session) => check(session));
  }

  Faktura.Auth = { init, isAllowed, ALLOWED_EMAILS };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
