const DB_NAME = "ruankaoPracticeDb";
const DB_VERSION = 3;
const ATTEMPTS_STORE = "attempts";
const BOOKMARKS_STORE = "bookmarks";
const META_STORE = "meta";
const ESSAY_SAMPLES_STORE = "essaySamples";

export function openPracticeDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ATTEMPTS_STORE)) {
        const attempts = db.createObjectStore(ATTEMPTS_STORE, { keyPath: "id", autoIncrement: true });
        attempts.createIndex("questionId", "questionId", { unique: false });
        attempts.createIndex("answeredAt", "answeredAt", { unique: false });
        attempts.createIndex("correct", "correct", { unique: false });
      }
      if (!db.objectStoreNames.contains(BOOKMARKS_STORE)) {
        const bookmarks = db.createObjectStore(BOOKMARKS_STORE, { keyPath: "questionId" });
        bookmarks.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(ESSAY_SAMPLES_STORE)) {
        db.createObjectStore(ESSAY_SAMPLES_STORE, { keyPath: "essayId" });
      }
    };
  });
}

export async function addAttempt(attempt) {
  const db = await openPracticeDb();
  return write(db, ATTEMPTS_STORE, {
    ...attempt,
    answeredAt: attempt.answeredAt || new Date().toISOString(),
  });
}

export async function getAttempts() {
  const db = await openPracticeDb();
  return readAll(db, ATTEMPTS_STORE);
}

export async function clearAttempts() {
  const db = await openPracticeDb();
  return clearStore(db, ATTEMPTS_STORE);
}

export async function clearProgressData() {
  const db = await openPracticeDb();
  await clearStore(db, ATTEMPTS_STORE);
  await clearStore(db, BOOKMARKS_STORE);
}

export async function getBookmarks() {
  const db = await openPracticeDb();
  return readAll(db, BOOKMARKS_STORE);
}

export async function getEssaySamples() {
  const db = await openPracticeDb();
  return (await readAll(db, ESSAY_SAMPLES_STORE)).filter(isEssaySample);
}

export async function saveEssaySample(sample) {
  const db = await openPracticeDb();
  return put(db, ESSAY_SAMPLES_STORE, normalizeEssaySample(sample));
}

export async function deleteEssaySample(essayId) {
  if (typeof essayId !== "string" || !essayId.trim()) return;
  const db = await openPracticeDb();
  return deleteOne(db, ESSAY_SAMPLES_STORE, essayId.trim());
}

export async function toggleBookmark(questionId, subjectId = "architect") {
  const db = await openPracticeDb();
  const existing = await readOne(db, BOOKMARKS_STORE, questionId);
  if (existing) {
    await deleteOne(db, BOOKMARKS_STORE, questionId);
    return { questionId, bookmarked: false };
  }
  await put(db, BOOKMARKS_STORE, { questionId, subjectId, createdAt: new Date().toISOString() });
  return { questionId, bookmarked: true };
}

export async function exportProgress() {
  const attempts = await getAttempts();
  const bookmarks = await getBookmarks();
  const essaySamples = await getEssaySamples();
  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    attempts,
    bookmarks,
    essaySamples,
  };
}

export async function importProgress(payload) {
  if (!payload || ![1, 2].includes(payload.schemaVersion) || !Array.isArray(payload.attempts)) {
    throw new Error("导入文件格式不正确");
  }
  const db = await openPracticeDb();
  await clearStore(db, ATTEMPTS_STORE);
  await clearStore(db, BOOKMARKS_STORE);
  for (const attempt of payload.attempts) {
    const { id: _id, ...record } = attempt;
    await write(db, ATTEMPTS_STORE, record);
  }
  for (const bookmark of payload.bookmarks || []) {
    if (bookmark.questionId) await put(db, BOOKMARKS_STORE, bookmark);
  }
  if (payload.schemaVersion === 2) {
    await clearStore(db, ESSAY_SAMPLES_STORE);
    for (const sample of payload.essaySamples || []) await put(db, ESSAY_SAMPLES_STORE, normalizeEssaySample(sample));
  }
  return getAttempts();
}

function write(db, storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.add(value);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve({ ...value, id: request.result });
  });
}

function put(db, storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.put(value);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(value);
  });
}

function readAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(sortRecords(request.result));
  });
}

function readOne(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

function deleteOne(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const request = tx.objectStore(storeName).delete(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

function clearStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const request = tx.objectStore(storeName).clear();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

function sortRecords(records) {
  return records.sort((a, b) => String(b.answeredAt || b.generatedAt || b.createdAt).localeCompare(String(a.answeredAt || a.generatedAt || a.createdAt)));
}

function normalizeEssaySample(sample) {
  const essayId = typeof sample?.essayId === "string" ? sample.essayId.trim() : "";
  const content = typeof sample?.content === "string" ? sample.content.trim() : "";
  if (!essayId || !content) throw new Error("范文数据不完整");
  return {
    essayId,
    subjectId: typeof sample.subjectId === "string" ? sample.subjectId.trim() : "architect",
    title: typeof sample.title === "string" ? sample.title.trim() : "",
    content,
    model: typeof sample.model === "string" ? sample.model.trim() : "",
    status: sample.status === "draft" ? "draft" : "valid",
    validationErrors: Array.isArray(sample.validationErrors)
      ? sample.validationErrors.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
      : [],
    generatedAt: typeof sample.generatedAt === "string" && !Number.isNaN(Date.parse(sample.generatedAt))
      ? sample.generatedAt
      : new Date().toISOString(),
  };
}

function isEssaySample(sample) {
  return typeof sample?.essayId === "string" && typeof sample.content === "string" && Boolean(sample.content.trim());
}
