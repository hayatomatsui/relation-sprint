(() => {
  "use strict";

  const DATA = window.RELATION_DATA;
  const STORAGE_KEY = "relation-sprint-progress-v1";
  const app = document.querySelector("#app");
  const settingsDialog = document.querySelector("#settingsDialog");
  const authDialog = document.querySelector("#authDialog");
  const authForm = document.querySelector("#authForm");
  const accountButton = document.querySelector(".account-button");
  const sectionById = Object.fromEntries(DATA.sections.map((item) => [item.id, item]));
  const patternById = Object.fromEntries(DATA.patterns.map((item) => [item.id, item]));
  const exampleById = Object.fromEntries(DATA.examples.map((item) => [item.id, item]));

  const state = {
    view: "train",
    section: "all",
    mode: "speak",
    strategy: "daily",
    sessionSize: "10",
    queue: [],
    index: 0,
    revealed: false,
    hint: false,
    typed: "",
    ratings: [],
    inSession: false,
    summary: false,
    search: "",
    librarySection: "all",
  };

  let store = loadStore();
  let authMode = "signIn";
  let cloudState = { configured: false, user: null, status: "local", message: "この端末に保存中" };
  let activeCloudUserId = null;

  function loadStore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && saved.records && saved.history) return saved;
    } catch (_) {}
    return { version: 1, records: {}, history: {} };
  }

  function saveStore(sync = true) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    if (sync) window.RelationCloud?.queueSync(store);
  }

  async function syncCloudProgress(showNotice = false) {
    if (!cloudState.user) return;
    try {
      store = await window.RelationCloud.sync(store);
      saveStore(false);
      render();
      if (showNotice) toast("進捗を同期しました");
    } catch (_) {
      if (showNotice) toast("同期できませんでした。端末には保存されています");
    }
  }

  function updateCloudUI() {
    const label = document.querySelector("#accountLabel");
    if (!label || !accountButton) return;
    accountButton.dataset.status = cloudState.status;
    if (cloudState.user) label.textContent = cloudState.status === "syncing" ? "同期中" : "同期済み";
    else label.textContent = cloudState.configured ? "ログイン" : "端末保存";
    document.querySelector("#syncStatusText")?.replaceChildren(document.createTextNode(cloudState.message));
  }

  function renderAuthDialog() {
    const signedIn = Boolean(cloudState.user);
    document.querySelector("#authSignedOut").hidden = signedIn;
    document.querySelector("#authSignedIn").hidden = !signedIn;
    document.querySelector("#authDialogTitle").textContent = signedIn ? "アカウント同期" : authMode === "signUp" ? "アカウント作成" : "アカウント同期";
    if (signedIn) {
      document.querySelector("#signedInEmail").textContent = cloudState.user.email || "ログイン済み";
      document.querySelector("#syncStatusText").textContent = cloudState.message;
      return;
    }
    const submit = document.querySelector(".auth-submit");
    const toggle = document.querySelector('[data-action="toggle-auth-mode"]');
    submit.textContent = authMode === "signUp" ? "アカウントを作成" : "ログイン";
    submit.disabled = !cloudState.configured;
    toggle.textContent = authMode === "signUp" ? "アカウントをお持ちの方：ログイン" : "初めての方：アカウントを作成";
    const message = document.querySelector("#authMessage");
    message.className = "auth-message";
    message.textContent = cloudState.configured ? "" : "クラウド同期の接続設定を準備中です。";
  }

  async function initializeCloud() {
    if (!window.RelationCloud) return;
    window.RelationCloud.onStateChange((nextState) => {
      cloudState = nextState;
      updateCloudUI();
      if (authDialog.open) renderAuthDialog();
      const nextUserId = nextState.user?.id || null;
      if (nextUserId && nextUserId !== activeCloudUserId) {
        activeCloudUserId = nextUserId;
        setTimeout(() => syncCloudProgress(), 0);
      } else if (!nextUserId) {
        activeCloudUserId = null;
      }
    });
    await window.RelationCloud.init();
  }

  function esc(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function recordFor(id) {
    return store.records[id] || { attempts: 0, correct: 0, lapses: 0, strength: 0, due: 0, lastSeen: 0 };
  }

  function statusFor(id) {
    const record = recordFor(id);
    if (!record.attempts) return { key: "new", label: "未学習" };
    if (record.strength >= 4) return { key: "mastered", label: "定着" };
    return { key: "learning", label: "学習中" };
  }

  function todayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function stats() {
    const now = Date.now();
    const records = DATA.examples.map((example) => recordFor(example.id));
    return {
      total: DATA.examples.length,
      learned: records.filter((record) => record.attempts > 0).length,
      mastered: records.filter((record) => record.strength >= 4).length,
      due: records.filter((record) => record.attempts > 0 && record.due <= now).length,
      today: store.history[todayKey()] || 0,
    };
  }

  function sectionOptions(selected, includeAll = true) {
    return [
      includeAll ? `<option value="all" ${selected === "all" ? "selected" : ""}>全7章（66文）</option>` : "",
      ...DATA.sections.map((section) =>
        `<option value="${section.id}" ${selected === section.id ? "selected" : ""}>${section.number}. ${esc(section.title)}（${section.exampleCount}文）</option>`
      ),
    ].join("");
  }

  function setView(view) {
    state.view = view;
    state.inSession = false;
    state.summary = false;
    document.querySelectorAll(".nav-item").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === view);
    });
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function render() {
    if (state.view === "library") renderLibrary();
    else if (state.view === "patterns") renderPatterns();
    else if (state.inSession || state.summary) renderSession();
    else renderSetup();
  }

  function renderSetup() {
    const current = stats();
    app.innerHTML = `
      <section class="page">
        <div class="hero-grid">
          <article class="hero-copy">
            <span class="eyebrow">66 SENTENCES · 24 PATTERNS</span>
            <h1>考える前に、<br>英語が出る。</h1>
            <p>日本語を見たら、まず声に出す。答えを開いて自己採点する。<strong>苦手な文ほど早く戻ってくる</strong>ので、全66例文を無理なく定着させられます。</p>
            <div class="hero-chips">
              <span class="chip">日本語 → 英語</span><span class="chip">音声再生</span><span class="chip">間隔反復</span><span class="chip">端末内に自動保存</span>
            </div>
          </article>
          <aside class="setup-panel">
            <span class="eyebrow">START A SESSION</span>
            <h2>今日のトレーニング</h2>
            <div class="field">
              <label class="field-label" for="sectionSelect">出題範囲 <small>章ごとに集中できます</small></label>
              <select id="sectionSelect">${sectionOptions(state.section)}</select>
            </div>
            <div class="field">
              <span class="field-label">出題方法</span>
              <div class="segmented">
                ${segment("strategy", "daily", "今日", state.strategy)}
                ${segment("strategy", "weak", "苦手順", state.strategy)}
                ${segment("strategy", "all", "ランダム", state.strategy)}
              </div>
            </div>
            <div class="field">
              <span class="field-label">解答スタイル</span>
              <div class="segmented two">
                ${segment("mode", "speak", "声に出す", state.mode)}
                ${segment("mode", "type", "入力する", state.mode)}
              </div>
            </div>
            <div class="field">
              <span class="field-label">問題数</span>
              <div class="segmented">
                ${segment("size", "10", "10問", state.sessionSize)}
                ${segment("size", "20", "20問", state.sessionSize)}
                ${segment("size", "all", "すべて", state.sessionSize)}
              </div>
            </div>
            <button class="primary-button" data-action="start-session">トレーニングを始める →</button>
          </aside>
        </div>
        <div class="metrics" aria-label="学習状況">
          <div class="metric-card accent"><strong>${current.mastered}<small> / ${current.total}</small></strong><span>定着した例文</span></div>
          <div class="metric-card"><strong>${current.learned}</strong><span>一度以上学習</span></div>
          <div class="metric-card warm"><strong>${current.due}</strong><span>今日の復習待ち</span></div>
          <div class="metric-card"><strong>${current.today}</strong><span>今日の解答数</span></div>
        </div>
      </section>`;
  }

  function segment(group, value, label, selected) {
    return `<button class="segment ${value === selected ? "is-active" : ""}" data-action="set-${group}" data-value="${value}">${label}</button>`;
  }

  function buildQueue() {
    let pool = DATA.examples.filter((example) => state.section === "all" || example.sectionId === state.section);
    const now = Date.now();

    if (state.strategy === "daily") {
      const due = pool.filter((example) => {
        const record = recordFor(example.id);
        return record.attempts > 0 && record.due <= now;
      }).sort((a, b) => recordFor(a.id).due - recordFor(b.id).due);
      const fresh = shuffle(pool.filter((example) => !recordFor(example.id).attempts));
      const later = pool.filter((example) => recordFor(example.id).attempts && recordFor(example.id).due > now)
        .sort((a, b) => recordFor(a.id).strength - recordFor(b.id).strength);
      pool = [...due, ...fresh, ...later];
    } else if (state.strategy === "weak") {
      pool = shuffle(pool).sort((a, b) => {
        const left = recordFor(a.id);
        const right = recordFor(b.id);
        return left.strength - right.strength || right.lapses - left.lapses;
      });
    } else {
      pool = shuffle(pool);
    }

    const limit = state.sessionSize === "all" ? pool.length : Number(state.sessionSize);
    return pool.slice(0, limit).map((example) => example.id);
  }

  function startSession(queue = null) {
    state.queue = queue || buildQueue();
    state.index = 0;
    state.revealed = false;
    state.hint = false;
    state.typed = "";
    state.ratings = [];
    state.inSession = true;
    state.summary = false;
    render();
  }

  function renderSession() {
    if (state.summary || state.index >= state.queue.length) {
      renderSummary();
      return;
    }
    const example = exampleById[state.queue[state.index]];
    const pattern = patternById[example.patternId];
    const section = sectionById[example.sectionId];
    const status = statusFor(example.id);
    const progress = ((state.index + (state.revealed ? .5 : 0)) / state.queue.length) * 100;
    const accuracy = state.revealed && state.mode === "type" ? similarity(state.typed, example.en) : null;

    app.innerHTML = `
      <section class="study-shell">
        <div class="session-top">
          <button data-action="exit-session">← 終了</button>
          <div class="progress-track" role="progressbar" aria-valuenow="${Math.round(progress)}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${progress}%"></div></div>
          <span class="session-count">${state.index + 1} / ${state.queue.length}</span>
        </div>
        <article class="study-card">
          <div class="card-meta">
            <span class="section-tag">CHAPTER ${section.number}</span>
            <span class="status-pill ${status.key}">${status.label}</span>
          </div>
          <p class="pattern-line">型：${esc(pattern.label)}</p>
          <span class="prompt-label">JAPANESE PROMPT</span>
          <h1 class="jp-prompt">${esc(example.ja)}</h1>
          ${state.hint ? `<div class="hint-box"><strong>型のヒント</strong><br>${esc(pattern.label)}${pattern.gloss ? `<br><small>${esc(pattern.gloss)}</small>` : ""}</div>` : ""}
          ${state.mode === "type" && !state.revealed ? `<label class="field-label" for="typeAnswer">英文を入力</label><textarea id="typeAnswer" class="type-input" autocomplete="off" autocapitalize="sentences" placeholder="Type your answer here...">${esc(state.typed)}</textarea>` : ""}
          ${!state.revealed ? `
            <div class="study-actions">
              <button class="hint-button" data-action="toggle-hint">${state.hint ? "ヒントを隠す" : "型を見る"}</button>
              <button class="reveal-button" data-action="reveal-answer">${state.mode === "type" ? "答え合わせ" : "答えを表示"}</button>
            </div>` : renderAnswer(example, pattern, accuracy)}
        </article>
        <div class="keyboard-help">ショートカット：<kbd>Space</kbd> 答えを見る　<kbd>H</kbd> ヒント　${state.revealed ? "<kbd>1</kbd>〜<kbd>4</kbd> 自己採点" : ""}</div>
      </section>`;

    if (state.mode === "type" && !state.revealed) {
      requestAnimationFrame(() => document.querySelector("#typeAnswer")?.focus());
    }
  }

  function renderAnswer(example, pattern, accuracy) {
    return `
      <div class="answer-panel">
        ${accuracy !== null ? `<div class="accuracy"><strong>${accuracy}%</strong><span>文字一致率（大文字・句読点は無視）</span></div>` : ""}
        ${state.mode === "type" && state.typed ? `<div class="answer-label">YOUR ANSWER</div><p class="english-answer" style="font-size:18px;color:var(--muted)">${esc(state.typed)}</p>` : ""}
        <div class="answer-label">MODEL ANSWER</div>
        <p class="english-answer">${esc(example.en)}</p>
        <div class="answer-tools"><button class="speak-button" data-action="speak" data-text="${esc(example.en)}">▶ 英文を聞く</button></div>
        ${pattern.note ? `<div class="note-box"><strong>注意</strong>　${esc(pattern.note)}</div>` : ""}
        <p class="grade-prompt">どのくらいスムーズに言えましたか？</p>
        <div class="grade-grid">
          <button class="grade-button again" data-action="grade" data-rating="0">1　もう一度<small>10分後</small></button>
          <button class="grade-button hard" data-action="grade" data-rating="1">2　難しい<small>1日後</small></button>
          <button class="grade-button good" data-action="grade" data-rating="2">3　言えた<small>間隔を延ばす</small></button>
          <button class="grade-button easy" data-action="grade" data-rating="3">4　余裕<small>大きく延ばす</small></button>
        </div>
      </div>`;
  }

  function applyRating(rating) {
    const id = state.queue[state.index];
    const previous = recordFor(id);
    const now = Date.now();
    const day = 86_400_000;
    let strength = previous.strength;
    let due = now;

    if (rating === 0) {
      strength = Math.max(0, strength - 1);
      due = now + 10 * 60_000;
    } else if (rating === 1) {
      strength = Math.max(1, strength);
      due = now + day;
    } else {
      strength = Math.min(6, strength + (rating === 3 ? 2 : 1));
      const intervals = rating === 3 ? [3, 7, 14, 30, 60, 90] : [1, 3, 7, 14, 30, 60];
      const intervalIndex = rating === 3 ? Math.max(0, strength - 2) : Math.max(0, strength - 1);
      due = now + intervals[Math.min(intervalIndex, intervals.length - 1)] * day;
    }

    store.records[id] = {
      attempts: previous.attempts + 1,
      correct: previous.correct + (rating >= 2 ? 1 : 0),
      lapses: previous.lapses + (rating === 0 ? 1 : 0),
      strength,
      due,
      lastSeen: now,
    };
    const key = todayKey();
    store.history[key] = (store.history[key] || 0) + 1;
    saveStore();

    state.ratings.push({ id, rating });
    state.index += 1;
    state.revealed = false;
    state.hint = false;
    state.typed = "";
    if (state.index >= state.queue.length) state.summary = true;
    render();
  }

  function renderSummary() {
    const confident = state.ratings.filter((item) => item.rating >= 2).length;
    const misses = state.ratings.filter((item) => item.rating < 2).map((item) => item.id);
    const percent = state.ratings.length ? Math.round((confident / state.ratings.length) * 100) : 0;
    app.innerHTML = `
      <section class="page">
        <article class="summary-card">
          <div class="summary-ring" data-label="${percent}%" style="--score:${percent * 3.6}deg"></div>
          <span class="eyebrow">SESSION COMPLETE</span>
          <h2>おつかれさまでした。</h2>
          <p>${state.ratings.length}文を練習し、${confident}文をスムーズに言えました。${misses.length ? `難しかった${misses.length}文は、早めに復習へ戻ります。` : "今日は全問クリアです。"}</p>
          <div class="summary-actions">
            ${misses.length ? `<button class="secondary-button" data-action="retry-misses" data-ids="${misses.join(",")}">難しかった文だけ復習</button>` : ""}
            <button class="primary-button" style="margin:0" data-action="back-home">トップへ戻る</button>
          </div>
        </article>
      </section>`;
  }

  function renderLibrary() {
    const query = state.search.toLocaleLowerCase();
    const examples = DATA.examples.filter((example) => {
      if (state.librarySection !== "all" && example.sectionId !== state.librarySection) return false;
      const haystack = `${example.ja} ${example.en} ${patternById[example.patternId].label}`.toLocaleLowerCase();
      return !query || haystack.includes(query);
    });
    const current = stats();

    app.innerHTML = `
      <section class="page">
        <div class="page-head">
          <div><span class="eyebrow">COMPLETE LIBRARY</span><h2>全66例文</h2><p>資料に収録された例文を、章・型・定着状況と一緒に確認できます。</p></div>
          <span class="chip">定着 ${current.mastered} / ${current.total}</span>
        </div>
        <div class="toolbar">
          <input id="librarySearch" class="search-input" type="search" value="${esc(state.search)}" placeholder="日本語・英語・型を検索">
          <select id="librarySection">${sectionOptions(state.librarySection)}</select>
        </div>
        <div class="library-list">
          ${examples.length ? examples.map((example) => libraryRow(example)).join("") : `<div class="empty-state">条件に合う例文がありません。</div>`}
        </div>
      </section>`;
  }

  function libraryRow(example) {
    const status = statusFor(example.id);
    const pattern = patternById[example.patternId];
    return `
      <article class="library-row">
        <span class="example-number">${example.id.slice(1)}</span>
        <div>
          <p class="ja">${esc(example.ja)}</p>
          <p class="en" lang="en">${esc(example.en)}</p>
          <div class="mini-pattern">${esc(pattern.label)}</div>
        </div>
        <span class="status-pill ${status.key}">${status.label}</span>
      </article>`;
  }

  function renderPatterns() {
    app.innerHTML = `
      <section class="page">
        <div class="page-head">
          <div><span class="eyebrow">PATTERN MAP</span><h2>24の型を俯瞰する</h2><p>まず型を理解し、例文で反射に変える。注意点は元資料の内容をそのまま紐づけています。</p></div>
        </div>
        <div class="pattern-layout">
          <div class="pattern-stack">
            ${DATA.patterns.map((pattern, index) => patternCard(pattern, index)).join("")}
          </div>
          <aside class="reference-panel">
            <span class="eyebrow">QUICK REFERENCE</span><h3>重要表現</h3>
            ${DATA.quickReference.map((item) => `<div class="reference-row"><div class="ja">${esc(item.ja)}</div><div class="en">${esc(item.en)}</div></div>`).join("")}
          </aside>
        </div>
      </section>`;
  }

  function patternCard(pattern, index) {
    const examples = DATA.examples.filter((example) => example.patternId === pattern.id);
    const section = sectionById[pattern.sectionId];
    return `
      <details class="pattern-card" ${index === 0 ? "open" : ""}>
        <summary>
          <span class="pattern-index">${String(index + 1).padStart(2, "0")}</span>
          <h3>${esc(pattern.label)}</h3>
          <span class="pattern-count">CH.${section.number} · ${pattern.exampleCount}文</span>
        </summary>
        <div class="pattern-body">
          ${pattern.gloss ? `<p>${esc(pattern.gloss)}</p>` : ""}
          ${pattern.note ? `<div class="note-box"><strong>注意</strong>　${esc(pattern.note)}</div>` : ""}
          ${examples.map((example) => `<div class="pattern-example"><div class="en">${esc(example.en)}</div><div class="ja">${esc(example.ja)}</div></div>`).join("")}
        </div>
      </details>`;
  }

  function normalizeAnswer(text) {
    return text
      .toLocaleLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/[^a-z0-9']+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function similarity(actual, expected) {
    const left = normalizeAnswer(actual);
    const right = normalizeAnswer(expected);
    if (!left) return 0;
    const rows = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
    for (let i = 0; i <= left.length; i += 1) rows[i][0] = i;
    for (let j = 0; j <= right.length; j += 1) rows[0][j] = j;
    for (let i = 1; i <= left.length; i += 1) {
      for (let j = 1; j <= right.length; j += 1) {
        rows[i][j] = Math.min(
          rows[i - 1][j] + 1,
          rows[i][j - 1] + 1,
          rows[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
        );
      }
    }
    return Math.max(0, Math.round((1 - rows[left.length][right.length] / Math.max(left.length, right.length)) * 100));
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) {
      toast("このブラウザでは音声再生を利用できません");
      return;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.84;
    speechSynthesis.speak(utterance);
  }

  function toast(message) {
    document.querySelector(".toast")?.remove();
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = message;
    document.body.append(node);
    setTimeout(() => node.remove(), 2500);
  }

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  app.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "set-strategy") { state.strategy = target.dataset.value; render(); }
    if (action === "set-mode") { state.mode = target.dataset.value; render(); }
    if (action === "set-size") { state.sessionSize = target.dataset.value; render(); }
    if (action === "start-session") startSession();
    if (action === "exit-session") { state.inSession = false; state.summary = false; render(); }
    if (action === "toggle-hint") { state.hint = !state.hint; render(); }
    if (action === "reveal-answer") {
      state.typed = document.querySelector("#typeAnswer")?.value || state.typed;
      state.revealed = true;
      render();
    }
    if (action === "speak") speak(target.dataset.text);
    if (action === "grade") applyRating(Number(target.dataset.rating));
    if (action === "retry-misses") startSession(target.dataset.ids.split(","));
    if (action === "back-home") { state.inSession = false; state.summary = false; render(); }
  });

  app.addEventListener("change", (event) => {
    if (event.target.id === "sectionSelect") state.section = event.target.value;
    if (event.target.id === "librarySection") { state.librarySection = event.target.value; render(); }
  });

  app.addEventListener("input", (event) => {
    if (event.target.id === "typeAnswer") state.typed = event.target.value;
    if (event.target.id === "librarySearch") {
      state.search = event.target.value;
      const cursor = event.target.selectionStart;
      render();
      const input = document.querySelector("#librarySearch");
      input?.focus();
      input?.setSelectionRange(cursor, cursor);
    }
  });

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target || target.closest("#app")) return;
    const action = target.dataset.action;
    if (action === "go-train") { event.preventDefault(); setView("train"); }
    if (action === "open-settings") settingsDialog.showModal();
    if (action === "open-auth") {
      renderAuthDialog();
      authDialog.showModal();
    }
    if (action === "close-auth") authDialog.close();
    if (action === "toggle-auth-mode") {
      authMode = authMode === "signIn" ? "signUp" : "signIn";
      document.querySelector("#authPassword").autocomplete = authMode === "signUp" ? "new-password" : "current-password";
      renderAuthDialog();
    }
    if (action === "sync-now") syncCloudProgress(true);
    if (action === "sign-out") {
      window.RelationCloud.signOut()
        .then(() => {
          authDialog.close();
          toast("ログアウトしました。進捗はこの端末にも残っています");
        })
        .catch(() => toast("ログアウトできませんでした"));
    }
    if (action === "export-progress") {
      const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `relation-sprint-${todayKey()}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast("進捗を書き出しました");
    }
    if (action === "reset-progress" && window.confirm("全66例文の学習進捗をリセットしますか？")) {
      store = { version: 1, records: {}, history: {} };
      saveStore();
      settingsDialog.close();
      render();
      toast("進捗をリセットしました");
    }
  });

  document.querySelector("#importProgress").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const incoming = JSON.parse(await file.text());
      if (!incoming.records || !incoming.history) throw new Error("invalid");
      store = { version: 1, records: incoming.records, history: incoming.history };
      saveStore();
      settingsDialog.close();
      render();
      toast("進捗を読み込みました");
    } catch (_) {
      toast("このファイルは読み込めませんでした");
    } finally {
      event.target.value = "";
    }
  });

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.querySelector("#authEmail").value.trim();
    const password = document.querySelector("#authPassword").value;
    const submit = document.querySelector(".auth-submit");
    const message = document.querySelector("#authMessage");
    submit.disabled = true;
    message.className = "auth-message";
    message.textContent = authMode === "signUp" ? "アカウントを作成中…" : "ログイン中…";
    try {
      if (authMode === "signUp") {
        const result = await window.RelationCloud.signUp(email, password);
        if (result.requiresConfirmation) {
          message.className = "auth-message success";
          message.textContent = "確認メールを送りました。メール内のリンクを開いてからログインしてください。";
        } else {
          message.className = "auth-message success";
          message.textContent = "アカウントを作成しました。";
        }
      } else {
        await window.RelationCloud.signIn(email, password);
        message.className = "auth-message success";
        message.textContent = "ログインしました。進捗を同期しています。";
      }
    } catch (error) {
      message.textContent = error?.message || "処理できませんでした。入力内容をご確認ください。";
    } finally {
      submit.disabled = !cloudState.configured;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (state.view !== "train" || !state.inSession || state.summary) return;
    const typing = event.target.matches("input, textarea, select");
    if (!typing && event.key.toLowerCase() === "h") {
      state.hint = !state.hint;
      render();
    }
    if (!typing && event.code === "Space" && !state.revealed) {
      event.preventDefault();
      state.revealed = true;
      render();
    }
    if (state.revealed && ["1", "2", "3", "4"].includes(event.key)) {
      applyRating(Number(event.key) - 1);
    }
    if (state.mode === "type" && !state.revealed && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      state.typed = document.querySelector("#typeAnswer")?.value || state.typed;
      state.revealed = true;
      render();
    }
  });

  render();
  initializeCloud().catch(() => {
    cloudState = { configured: false, user: null, status: "error", message: "クラウドへ接続できません" };
    updateCloudUI();
  });
})();
