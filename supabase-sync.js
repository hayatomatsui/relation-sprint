(() => {
  "use strict";

  const config = window.RELATION_SUPABASE || {};
  const listeners = new Set();
  let client = null;
  let syncTimer = null;
  let latestStore = null;
  let syncing = false;
  let resyncRequested = false;
  let state = {
    configured: false,
    user: null,
    status: "local",
    message: "この端末に保存中",
  };

  function emit(patch = {}) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener({ ...state }));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function blankStore() {
    return { version: 1, records: {}, history: {} };
  }

  function mergeStores(localInput, remoteInput) {
    const local = localInput && typeof localInput === "object" ? localInput : blankStore();
    const remote = remoteInput && typeof remoteInput === "object" ? remoteInput : blankStore();
    const records = { ...(remote.records || {}) };

    Object.entries(local.records || {}).forEach(([id, localRecord]) => {
      const remoteRecord = records[id];
      if (!remoteRecord || (localRecord.lastSeen || 0) >= (remoteRecord.lastSeen || 0)) {
        records[id] = localRecord;
      }
    });

    const history = { ...(remote.history || {}) };
    Object.entries(local.history || {}).forEach(([date, count]) => {
      history[date] = Math.max(Number(history[date]) || 0, Number(count) || 0);
    });

    return { version: 1, records, history };
  }

  async function init() {
    const key = config.publishableKey || config.anonKey;
    if (!config.url || !key || !window.supabase?.createClient) {
      emit({ configured: false, user: null, status: "local", message: "この端末に保存中" });
      return { ...state };
    }

    client = window.supabase.createClient(config.url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    emit({ configured: true, status: "checking", message: "ログイン状態を確認中" });

    const { data, error } = await client.auth.getSession();
    if (error) {
      emit({ user: null, status: "error", message: "ログイン状態を確認できません" });
    } else {
      const user = data.session?.user || null;
      emit({ user, status: user ? "ready" : "signed_out", message: user ? "同期できます" : "ログインすると同期できます" });
    }

    client.auth.onAuthStateChange((_event, session) => {
      const user = session?.user || null;
      emit({ user, status: user ? "ready" : "signed_out", message: user ? "同期できます" : "ログインすると同期できます" });
    });
    return { ...state };
  }

  async function signIn(email, password) {
    if (!client) throw new Error("Supabaseが設定されていません");
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  }

  async function signUp(email, password) {
    if (!client) throw new Error("Supabaseが設定されていません");
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw error;
    return { user: data.user, requiresConfirmation: !data.session };
  }

  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
    emit({ user: null, status: "signed_out", message: "ログアウトしました" });
  }

  async function sync(localStore) {
    latestStore = clone(localStore || blankStore());
    if (!client || !state.user) return latestStore;
    if (syncing) {
      resyncRequested = true;
      return latestStore;
    }
    syncing = true;
    emit({ status: "syncing", message: "同期中…" });

    try {
      const { data, error: readError } = await client
        .from("user_progress")
        .select("progress, updated_at")
        .eq("user_id", state.user.id)
        .maybeSingle();
      if (readError) throw readError;

      const merged = mergeStores(latestStore, data?.progress);
      const { error: writeError } = await client.from("user_progress").upsert(
        {
          user_id: state.user.id,
          progress: merged,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (writeError) throw writeError;

      latestStore = merged;
      emit({ status: "synced", message: "同期済み" });
      return merged;
    } catch (error) {
      const offline = !navigator.onLine || error?.message?.includes("Failed to fetch");
      emit({ status: offline ? "offline" : "error", message: offline ? "オフライン：端末に保存中" : "同期できませんでした" });
      throw error;
    } finally {
      syncing = false;
      if (resyncRequested) {
        resyncRequested = false;
        queueSync(latestStore);
      }
    }
  }

  function queueSync(localStore) {
    latestStore = clone(localStore || blankStore());
    if (!client || !state.user) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => sync(latestStore).catch(() => {}), 700);
  }

  function onStateChange(listener) {
    listeners.add(listener);
    listener({ ...state });
    return () => listeners.delete(listener);
  }

  window.RelationCloud = {
    init,
    signIn,
    signUp,
    signOut,
    sync,
    queueSync,
    onStateChange,
    mergeStores,
    getState: () => ({ ...state }),
  };
})();
