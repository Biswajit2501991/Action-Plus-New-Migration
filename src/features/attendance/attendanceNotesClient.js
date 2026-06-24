/**
 * @param {(path: string, init?: RequestInit) => Promise<any>} backendJson
 * @param {object} payload
 */
export async function createAttendanceNoteApi(backendJson, payload) {
  return backendJson('/attendance/notes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * @param {(path: string, init?: RequestInit) => Promise<any>} backendJson
 * @param {{ startDate: string, endDate: string, staffLoginId?: string }} query
 */
export async function fetchAttendanceNotesApi(backendJson, query) {
  const params = new URLSearchParams();
  params.set('startDate', String(query.startDate || '').slice(0, 10));
  params.set('endDate', String(query.endDate || '').slice(0, 10));
  if (query.staffLoginId) params.set('staffLoginId', String(query.staffLoginId));
  const data = await backendJson(`/attendance/notes?${params.toString()}`);
  return Array.isArray(data?.notes) ? data.notes : [];
}

/**
 * @param {(path: string, init?: RequestInit) => Promise<any>} backendJson
 * @param {{ staffLoginId?: string, date: string }} query
 */
export async function fetchLatestAttendanceNoteApi(backendJson, query) {
  const params = new URLSearchParams();
  if (query.staffLoginId) params.set('staffLoginId', String(query.staffLoginId));
  params.set('date', String(query.date || '').slice(0, 10));
  const data = await backendJson(`/attendance/notes/latest?${params.toString()}`);
  return data?.note || null;
}

/**
 * @param {(path: string, init?: RequestInit) => Promise<any>} backendJson
 * @returns {Promise<object|null>}
 */
export async function fetchSelfAttendanceTodayApi(backendJson) {
  const data = await backendJson('/attendance/records/self/today');
  return data?.record || null;
}
