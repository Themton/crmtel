import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://sfwbzcrvesbeymvlsxsu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmd2J6Y3J2ZXNiZXltdmxzeHN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNTMzNTgsImV4cCI6MjA4ODkyOTM1OH0.E4Zvq43f0M29hAZzKg78W9HRpthv0I9U37LDo_0Pyvo";
const USE_DEMO = false;
// Realtime client (ใช้เฉพาะ subscribe เปลี่ยนแปลงแบบ push แทน polling — ส่วน REST ยังใช้ wrapper เดิมด้านล่าง)
const sbRealtime = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabase = { from: (t) => { const req = async (m, o = {}) => { let u = `${SUPABASE_URL}/rest/v1/${t}`; if (o.mf) u += `?${o.mf}`; const h = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json", Prefer: m === "POST" ? "return=representation" : (m === "PATCH" || m === "DELETE") ? "return=representation" : undefined }; Object.keys(h).forEach((k) => h[k] === undefined && delete h[k]); try { const r = await fetch(u, { method: m, headers: h, body: o.body ? JSON.stringify(o.body) : undefined }); const d = await r.json().catch(() => null); return r.ok ? { data: d } : { error: d }; } catch (err) { return { error: err, data: null }; } }; const fetchAll = async () => { let all = []; let offset = 0; const PAGE = 1000; while (true) { const u = `${SUPABASE_URL}/rest/v1/${t}?limit=${PAGE}&offset=${offset}`; const h = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }; try { const r = await fetch(u, { headers: h }); const d = await r.json().catch(() => []); if (!Array.isArray(d) || d.length === 0) break; all = all.concat(d); if (d.length < PAGE) break; offset += PAGE; } catch { break; } } return { data: all }; }; return { select: () => ({ order: () => ({ then: (r, j) => fetchAll().then(r).catch(j) }), then: (r, j) => fetchAll().then(r).catch(j) }), insert: (rows) => ({ then: (r, j) => req("POST", { body: [].concat(rows) }).then(r).catch(j) }), update: (v) => ({ eq: (c, val) => ({ then: (r, j) => req("PATCH", { body: v, mf: `${c}=eq.${val}` }).then(r).catch(j) }), in: (c, vals) => ({ then: (r, j) => req("PATCH", { body: v, mf: `${c}=in.(${vals.join(",")})` }).then(r).catch(j) }) }), delete: () => ({ eq: (c, val) => ({ then: (r, j) => req("DELETE", { mf: `${c}=eq.${val}` }).then(r).catch(j) }), in: (c, vals) => ({ then: (r, j) => req("DELETE", { mf: `${c}=in.(${vals.join(",")})` }).then(r).catch(j) }), gte: (c, val) => ({ then: (r, j) => req("DELETE", { mf: `${c}=gte.${val}` }).then(r).catch(j) }) }) }; } };

// ---- Lightweight filtered query (paginated) for incremental sync ----
const sbQuery = async (table, mf) => {
  let all = []; let offset = 0; const PAGE = 1000;
  while (true) {
    const qs = [mf, `limit=${PAGE}`, `offset=${offset}`].filter(Boolean).join("&");
    const u = `${SUPABASE_URL}/rest/v1/${table}?${qs}`;
    const h = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
    try {
      const r = await fetch(u, { headers: h });
      const d = await r.json().catch(() => null);
      if (!Array.isArray(d)) return { data: all, ok: false, error: d };
      all = all.concat(d);
      if (d.length < PAGE) break;
      offset += PAGE;
    } catch (e) { return { data: all, ok: false, error: e }; }
  }
  return { data: all, ok: true };
};

// ---- Enrich customers with employee nickname / assigned_email mapping ----
const enrichCustomers = (c, allEmp) => {
  const empNickMap = {};
  const empNameToEmail = {};
  (allEmp || []).forEach(emp => {
    const n = (emp.name || "").trim();
    const empEmail = (emp.email || emp.username || "").toLowerCase().trim();
    if (n) {
      empNickMap[n] = n;
      if (empEmail) empNameToEmail[n] = empEmail;
      const m = n.match(/\(([^)]+)\)/);
      if (m) { empNickMap[m[1].trim()] = n; if (empEmail) empNameToEmail[m[1].trim()] = empEmail; }
    }
    const nick = (emp.nickname || "").trim();
    if (nick && nick !== n) {
      empNickMap[nick] = n || nick;
      if (empEmail) empNameToEmail[nick] = empEmail;
      const m2 = nick.match(/\(([^)]+)\)/);
      if (m2) { empNickMap[m2[1].trim()] = n || nick; if (empEmail) empNameToEmail[m2[1].trim()] = empEmail; }
    }
  });
  return (c || []).map((cust) => {
    if (!cust.assigned_to) return cust;
    const fullName = empNickMap[cust.assigned_to];
    const assignedEmail = cust.assigned_email || empNameToEmail[cust.assigned_to] || "";
    return { ...cust, nickname: fullName || cust.nickname, assigned_email: assignedEmail };
  });
};

// ---- Max updated_at among rows (returns ISO string or fallback) ----
const maxUpdatedAt = (rows, fallback) => {
  let max = fallback || null; let maxMs = max ? Date.parse(max) : -Infinity;
  (rows || []).forEach((r) => {
    if (!r || !r.updated_at) return;
    const ms = Date.parse(r.updated_at);
    if (!isNaN(ms) && ms > maxMs) { maxMs = ms; max = r.updated_at; }
  });
  return max;
};

const COLOR_PRESETS = [
  { color: "#059669", bg: "#d1fae5" }, { color: "#d97706", bg: "#fef3c7" }, { color: "#dc2626", bg: "#fee2e2" },
  { color: "#d4a017", bg: "#fef3c7" }, { color: "#7c3aed", bg: "#ede9fe" }, { color: "#db2777", bg: "#fce7f3" },
  { color: "#0891b2", bg: "#cffafe" }, { color: "#6b7280", bg: "#f3f4f6" }, { color: "#ea580c", bg: "#fff7ed" },
  { color: "#16a34a", bg: "#f0fdf4" }, { color: "#334155", bg: "#e2e8f0" }, { color: "#0d9488", bg: "#ccfbf1" },
];
const RATING_COLORS = { 0: "#9ca3af", 1: "#6b7280", 2: "#2563eb", 3: "#16a34a", 4: "#d97706", 5: "#dc2626" };

// ---- DEMO DATA ----
const DEMO_STATUSES = [
  { id: 1, key: "not_called", label: "ยังไม่ได้โทร", color: "#d97706" },
  { id: 2, key: "not_available", label: "ไม่สะดวกคุย", color: "#ea580c" },
  { id: 3, key: "answered", label: "รับสาย", color: "#16a34a" },
  { id: 4, key: "no_answer", label: "ไม่รับสาย", color: "#dc2626" },
  { id: 5, key: "vvip", label: "Vvip", color: "#d4a017" },
  { id: 6, key: "reserved", label: "จอง", color: "#0891b2" },
];
const DEMO_CALL_SUBJECTS = [
  { id: 1, label: "ดูแลหลังการขาย", color: "#ea580c" },
  { id: 2, label: "Re_order", color: "#16a34a" },
  { id: 3, label: "3-5วัน", color: "#d97706" },
  { id: 4, label: "10-15วัน", color: "#dc2626" },
  { id: 5, label: "20-25วัน", color: "#dc2626" },
  { id: 6, label: "30วัน", color: "#dc2626" },
  { id: 7, label: "CROSS", color: "#7c3aed" },
  { id: 8, label: "UpSell", color: "#db2777" },
];
const DEMO_SUPERVISORS = [
  { id: 1, name: "คุณสมศักดิ์", phone: "081-111-0001", email: "somsak@co.com", department: "ฝ่ายขาย" },
  { id: 2, name: "คุณวิไล", phone: "081-111-0002", email: "wilai@co.com", department: "ฝ่ายบริการ" },
];
const DEMO_EMPLOYEES = [
  { id: 1, name: "Kiri Suksawat", username: "kiri", password: "1234", email: "kiri@co.com", role: "Sales", phone: "081-000-0001", active: true },
  { id: 2, name: "ออย(ญ)", username: "oiy", password: "1234", email: "oiy@co.com", role: "Sales", phone: "081-000-0002", active: true },
  { id: 3, name: "ฝน", username: "fon", password: "1234", email: "fon@co.com", role: "Sales", phone: "081-000-0003", active: true },
  { id: 4, name: "sawatdee", username: "sawatdee", password: "1234", email: "sawatdee@co.com", role: "Sales", phone: "081-000-0004", active: true },
  { id: 5, name: "KHUNFLUKE", username: "fluke", password: "1234", email: "fluke@co.com", role: "Sales", phone: "081-000-0005", active: true },
  { id: 6, name: "อาหมวย", username: "muay", password: "1234", email: "muay@co.com", role: "Sales", phone: "081-000-0006", active: true },
];
// Customer + Call fields merged
const DEMO_CUSTOMERS = [
  { id: 1, name: "พุทิสา.ชิดชอบ", phone: "0800015319", note: "สุรินทร์ เมือง กาเกาะ 15ม.7ต.อ.จ.", previous_promo: "หลงเลย 1แถม1(190)", order_date: "2026-03-18T10:56:57", received_product: true, status: "answered", assigned_to: "Kiri Suksawat", supervisor: "คุณสมศักดิ์", created_at: "2026-03-01", call_date: "2026-03-21", call_subject: "ดูแลหลังการขาย", call_note: "21/3..หมองคล้ำ อยากให้ใส 23/3..โทรมาสั่ง 2...", customer_relation: 5, next_follow: "2026-04-18", offer: "ขายได้", product_price: 190 },
  { id: 2, name: "สมหญิง รักเรียน", phone: "0899876543", note: "456 ถ.พหลโยธิน กรุงเทพฯ", previous_promo: "หลงเลย 1แถม1(190)", order_date: "2026-03-15T14:30:00", received_product: false, status: "not_called", assigned_to: "ออย(ญ)", supervisor: "คุณวิไล", created_at: "2026-03-05", call_date: "2026-03-21", call_subject: "10-15วัน", call_note: "21/3..ดีใช้เหลือ 1กป", customer_relation: 2, next_follow: "2026-03-27", offer: "", product_price: 0 },
  { id: 3, name: "วิชัย มั่นคง", phone: "0621112233", note: "789 ม.สุขสันต์ เชียงใหม่", previous_promo: "หลงเลย 1แถม1(190)", order_date: "2026-02-20T09:00:00", received_product: true, status: "vvip", assigned_to: "Kiri Suksawat", supervisor: "คุณสมศักดิ์", created_at: "2026-02-15", call_date: "2026-03-21", call_subject: "10-15วัน", call_note: "21/3..มรส", customer_relation: 1, next_follow: "2026-03-27", offer: "", product_price: 0 },
  { id: 4, name: "นารี สุขใส", phone: "0954445566", note: "12 ซ.ลาดพร้าว 71 กรุงเทพฯ", previous_promo: "หลงเลย 1แถม1(190)", order_date: "", received_product: false, status: "no_answer", assigned_to: "ฝน", supervisor: "", created_at: "2026-03-20", call_date: "2026-03-21", call_subject: "10-15วัน", call_note: "21/3..ชุดแรก ดีเหลือ 1", customer_relation: 3, next_follow: "2026-03-27", offer: "", product_price: 0 },
  { id: 5, name: "ธนา รุ่งเรือง", phone: "0889990011", note: "99 ถ.ราชดำเนิน นครราชสีมา", previous_promo: "หลงเลย 1แถม1(190)", order_date: "2026-03-22T16:20:00", received_product: true, status: "answered", assigned_to: "sawatdee", supervisor: "คุณวิไล", created_at: "2026-03-18", call_date: "2026-03-21", call_subject: "10-15วัน", call_note: "21/3..มรส", customer_relation: 1, next_follow: "2026-03-27", offer: "", product_price: 0 },
  { id: 6, name: "พิมพ์ ดาวประดับ", phone: "0632223344", note: "", previous_promo: "", order_date: "", received_product: false, status: "not_called", assigned_to: "", supervisor: "", created_at: "2026-03-25", call_date: "", call_subject: "", call_note: "", customer_relation: 0, next_follow: "", offer: "", product_price: 0 },
  { id: 7, name: "กิตติ บุญมา", phone: "0917778899", note: "55 ถ.มิตรภาพ ขอนแก่น", previous_promo: "หลงเลย 1แถม1(190)", order_date: "2026-03-12T11:00:00", received_product: true, status: "reserved", assigned_to: "KHUNFLUKE", supervisor: "คุณสมศักดิ์", created_at: "2026-03-08", call_date: "2026-03-21", call_subject: "10-15วัน", call_note: "21/3..ตัดสาย", customer_relation: 1, next_follow: "2026-03-27", offer: "", product_price: 0 },
  { id: 8, name: "อรุณ แสงทอง", phone: "0845556677", note: "88 ถ.เพชรเกษม นครปฐม", previous_promo: "หลงเลย 1แถม1(190)", order_date: "", received_product: false, status: "not_available", assigned_to: "อาหมวย", supervisor: "", created_at: "2026-03-24", call_date: "2026-03-21", call_subject: "10-15วัน", call_note: "21/3..ดีขึ้น ใช้กระปุก 2", customer_relation: 2, next_follow: "2026-03-27", offer: "", product_price: 0 },
  { id: 9, name: "ปรีชา จันทร์เพ็ญ", phone: "0923334455", note: "3 ม.3 บ.เล่า ต.โนนทอง เกษตรสมบูรณ์ ชัยภูมิ", previous_promo: "หลงเลย 1แถม1(190)", order_date: "2026-03-23T09:44:26", received_product: false, status: "not_called", assigned_to: "", supervisor: "", created_at: "2026-03-26", call_date: "", call_subject: "", call_note: "", customer_relation: 0, next_follow: "", offer: "", product_price: 0 },
  { id: 10, name: "มานี สุดสวย", phone: "0867778800", note: "2 ม.1 ต.ลำสมพุง มวกเหล็ก สระบุรี", previous_promo: "หลงเลย 1แถม1(190)", order_date: "2026-03-23T09:44:26", received_product: true, status: "answered", assigned_to: "ออย(ญ)", supervisor: "คุณวิไล", created_at: "2026-03-19", call_date: "2026-03-21", call_subject: "10-15วัน", call_note: "21/3...ชุดแรก//ฝ้า หมองคล้ำ พักผ่อนน้อย ไม่สบ...", customer_relation: 2, next_follow: "2026-03-27", offer: "", product_price: 0 },
];

// ---- ICONS ----
const I = {
  Users: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
  User: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Plus: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Edit: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Trash: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
  Search: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  X: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Chart: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  Check: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
  Settings: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  Shield: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Tag: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  Send: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  Undo: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>,
  ChevDown: () => <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>,
  ChevUp: () => <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>,
  Upload: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>,
  Download: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Menu: () => <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  FileDown: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg>,
  Trash2: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>,
  Restore: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>,
};

// ---- COMPONENTS ----
function PillDropdown({ label, value, options, onChange, color = "#2563eb" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const sel = options.find((o) => o.value === value);
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(!open)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 20, border: `2px solid ${color}`, background: value !== "all" ? `${color}15` : "#fff", color, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
        {sel?.badge ? <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 14, fontWeight: 700, color: "#fff", background: sel.badge }}>{sel.label}</span> : (sel?.label || label)}
        {open ? <I.ChevUp /> : <I.ChevDown />}
      </button>
      {open && <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, background: "#fff", borderRadius: 14, boxShadow: "0 8px 30px rgba(0,0,0,0.15)", border: "1px solid #e5e7eb", padding: 8, zIndex: 200, minWidth: 200, maxHeight: 360, overflowY: "auto", animation: "fadeIn .15s" }}>
        {options.map((o) => (<button key={o.value} onClick={() => { onChange(o.value); setOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", border: "none", background: value === o.value ? "#fffbeb" : "transparent", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: value === o.value ? 700 : 400, color: "#1e293b", textAlign: "left" }}
          onMouseEnter={(e) => { if (value !== o.value) e.currentTarget.style.background = "#f8fafc"; }} onMouseLeave={(e) => { if (value !== o.value) e.currentTarget.style.background = "transparent"; }}>
          {o.badge ? <span style={{ padding: "3px 10px", borderRadius: 8, fontSize: 14, fontWeight: 700, color: "#fff", background: o.badge }}>{o.label}</span> : o.label}
          {value === o.value && <span style={{ marginLeft: "auto", color: "#d4a017" }}><I.Check /></span>}
        </button>))}
      </div>}
    </div>
  );
}

function InlineStatusDropdown({ value, statuses, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const cur = statuses.find((s) => s.key === value);
  useEffect(() => { const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(!open)} style={{ padding: "2px 8px", borderRadius: 6, border: "none", background: cur?.color || "#9ca3af", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>{cur?.label || "—"} <I.ChevDown /></button>
      {open && <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "#fff", borderRadius: 14, boxShadow: "0 8px 30px rgba(0,0,0,0.18)", border: "1px solid #e5e7eb", padding: 6, zIndex: 200, minWidth: 170, animation: "fadeIn .15s" }}>
        {statuses.map((s) => (<button key={s.id} onClick={() => { onChange(s.key); setOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", border: "none", background: value === s.key ? "#fffbeb" : "transparent", borderRadius: 8, cursor: "pointer", textAlign: "left" }}
          onMouseEnter={(e) => { if (value !== s.key) e.currentTarget.style.background = "#f8fafc"; }} onMouseLeave={(e) => { if (value !== s.key) e.currentTarget.style.background = "transparent"; }}>
          <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 14, fontWeight: 700, color: "#fff", background: s.color }}>{s.label}</span>
          {value === s.key && <span style={{ marginLeft: "auto", color: "#d4a017" }}><I.Check /></span>}
        </button>))}
      </div>}
    </div>
  );
}

function SubjectDropdown({ value, subjects, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const cur = subjects.find((s) => s.label === value) || subjects.find((s) => s.label.toLowerCase().trim() === (value || "").toLowerCase().trim());
  useEffect(() => { const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(!open)} style={{ padding: "2px 8px", borderRadius: 6, border: "none", background: cur?.color || "#9ca3af", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>{value || "เลือก"} <I.ChevDown /></button>
      {open && <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "#fff", borderRadius: 14, boxShadow: "0 8px 30px rgba(0,0,0,0.18)", border: "1px solid #e5e7eb", padding: 6, zIndex: 200, minWidth: 180, maxHeight: 320, overflowY: "auto", animation: "fadeIn .15s" }}>
        {subjects.map((s) => (<button key={s.id} onClick={() => { onChange(s.label); setOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", border: "none", background: value === s.label ? "#fffbeb" : "transparent", borderRadius: 8, cursor: "pointer", textAlign: "left" }}
          onMouseEnter={(e) => { if (value !== s.label) e.currentTarget.style.background = "#f8fafc"; }} onMouseLeave={(e) => { if (value !== s.label) e.currentTarget.style.background = "transparent"; }}>
          <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 14, fontWeight: 700, color: "#fff", background: s.color }}>{s.label}</span>
          {value === s.label && <span style={{ marginLeft: "auto", color: "#d4a017" }}><I.Check /></span>}
        </button>))}
      </div>}
    </div>
  );
}

const OFFER_OPTIONS = [
  { value: "ขายได้", color: "#059669", bg: "#d1fae5" },
  { value: "ขายไม่ได้", color: "#dc2626", bg: "#fee2e2" },
];
function OfferDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const cur = OFFER_OPTIONS.find((o) => o.value === value);
  useEffect(() => { const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(!open)} style={{ padding: "4px 12px", borderRadius: 8, border: "none", background: cur?.color || "#9ca3af", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>{value || "เลือก"} <I.ChevDown /></button>
      {open && <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "#fff", borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.18)", border: "1px solid #e5e7eb", padding: 6, zIndex: 200, minWidth: 140, animation: "fadeIn .15s" }}>
        <button onClick={() => { onChange(""); setOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", border: "none", background: !value ? "#fffbeb" : "transparent", borderRadius: 8, cursor: "pointer", fontSize: 14, color: "#6b7280" }}
          onMouseEnter={(e) => { if (value) e.currentTarget.style.background = "#f8fafc"; }} onMouseLeave={(e) => { if (value) e.currentTarget.style.background = "transparent"; }}>
          — ว่าง —
        </button>
        {OFFER_OPTIONS.map((o) => (
          <button key={o.value} onClick={() => { onChange(o.value); setOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", border: "none", background: value === o.value ? "#fffbeb" : "transparent", borderRadius: 8, cursor: "pointer", textAlign: "left" }}
            onMouseEnter={(e) => { if (value !== o.value) e.currentTarget.style.background = "#f8fafc"; }} onMouseLeave={(e) => { if (value !== o.value) e.currentTarget.style.background = "transparent"; }}>
            <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 15, fontWeight: 700, color: "#fff", background: o.color }}>{o.value}</span>
            {value === o.value && <span style={{ marginLeft: "auto", color: "#d4a017" }}><I.Check /></span>}
          </button>
        ))}
      </div>}
    </div>
  );
}

function RatingSelector({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(!open)} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, minWidth: 36, height: 30, borderRadius: 8, border: "none", background: RATING_COLORS[value] || "#e5e7eb", color: value !== null && value !== undefined ? "#fff" : "#9ca3af", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
        {value !== null && value !== undefined ? value : "—"} <I.ChevDown />
      </button>
      {open && <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "#fff", borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.18)", border: "1px solid #e5e7eb", padding: 6, zIndex: 200, minWidth: 140, animation: "fadeIn .15s" }}>
        {[0,1,2,3,4,5].map((n) => (
          <button key={n} onClick={() => { onChange(n); setOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 12px", border: "none", background: value === n ? "#fffbeb" : "transparent", borderRadius: 8, cursor: "pointer", textAlign: "left", fontSize: 15 }}
            onMouseEnter={(e) => { if (value !== n) e.currentTarget.style.background = "#f8fafc"; }} onMouseLeave={(e) => { if (value !== n) e.currentTarget.style.background = "transparent"; }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: RATING_COLORS[n], color: "#fff", fontWeight: 700, fontSize: 15, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
            <span style={{ color: "#374151" }}>{{ 0: "ยังไม่ประเมิน", 1: "น้อยมาก", 2: "น้อย", 3: "ปานกลาง", 4: "ดี", 5: "ดีมาก" }[n]}</span>
            {value === n && <span style={{ marginLeft: "auto", color: "#d4a017" }}><I.Check /></span>}
          </button>
        ))}
      </div>}
    </div>
  );
}

function EditableCell({ value, onSave, type = "text", style: sx = {} }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || "");
  const ref = useRef(null);
  useEffect(() => { setVal(value || ""); }, [value]);
  useEffect(() => { if (editing && ref.current) { ref.current.focus(); if ((type === "date" || type === "datetime") && ref.current.showPicker) { try { ref.current.showPicker(); } catch {} } } }, [editing]);
  const save = () => { setEditing(false); if (val !== (value || "")) onSave(val); };
  const inputType = type === "datetime" ? "datetime-local" : type === "date" ? "date" : "text";
  if (editing) {
    return type === "textarea" ? (
      <textarea ref={ref} value={val} onChange={(e) => setVal(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === "Escape") { setVal(value || ""); setEditing(false); } }}
        style={{ width: "100%", minWidth: 140, minHeight: 50, padding: "5px 8px", borderRadius: 8, border: "2px solid #d4a017", fontSize: 14, fontWeight: 600, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
    ) : (
      <input ref={ref} type={inputType} value={val} onChange={(e) => { setVal(e.target.value); if (type === "date" || type === "datetime") { setEditing(false); if (e.target.value !== (value || "")) onSave(e.target.value); } }} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setVal(value || ""); setEditing(false); } }}
        style={{ width: "100%", minWidth: type === "date" || type === "datetime" ? 140 : 80, padding: "5px 8px", borderRadius: 8, border: "2px solid #d4a017", fontSize: 14, fontWeight: 600, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
    );
  }
  let display = value || "—";
  if (type === "datetime" && value) { try { display = new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch {} }
  if (type === "date" && value) { try { display = new Date(value + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch {} }
  return (
    <div onClick={() => setEditing(true)} style={{ cursor: "pointer", padding: "2px 4px", borderRadius: 4, border: "1px solid transparent", minHeight: 18, ...sx }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#fde68a"; e.currentTarget.style.background = "#fffbeb"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "transparent"; }}>
      <span style={{ fontSize: 14, color: value ? "#1e293b" : "#c0c0c0", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{display}</span>
    </div>
  );
}

// ---- LOGIN ----
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [allUsers, setAllUsers] = useState([]);

  useEffect(() => {
    // ใช้ crm_employees สำหรับ login (standalone)
    supabase.from("crm_employees").select().then((res) => {
      if (res.data) {
        const empUsers = res.data.filter(a=>a.active !== false).map((a) => ({ username: a.username || a.email, password: String(a.password || "1234"), name: a.name || a.nickname || a.email, nickname: a.nickname || "", email: a.email || a.username || "", role: a.role==="admin"?"admin":"employee" }));
        setAllUsers(empUsers);
      }
    });
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const user = allUsers.find((u) => u.username === username && u.password === password);
    if (user) { onLogin(user); }
    else { setError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"); setTimeout(() => setError(""), 3000); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #2a1d06 0%, #3d2a0a 50%, #4a3310 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Sarabun','Noto Sans Thai',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ width: "100%", maxWidth: 420, padding: 20 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <img src={import.meta.env.BASE_URL + "logo.png"} alt="Logo" style={{ width: 140, height: 140, objectFit: "contain", marginBottom: 16 }} />
          <h1 style={{ color: "#fff", fontSize: 28, fontWeight: 700, margin: 0 }}>CRM THE MT</h1>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginTop: 8 }}>เพราะคุณคือ สุดยอดนักขายมือทอง</p>
        </div>

        {/* Login Card */}
        <div style={{ background: "#fff", borderRadius: 20, padding: "36px 32px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#3d2a0a", marginBottom: 28, textAlign: "center" }}>เข้าสู่ระบบ</h2>

          {error && <div style={{ background: "#fee2e2", color: "#dc2626", padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: 14, fontWeight: 600, textAlign: "center", animation: "fadeIn .2s" }}>{error}</div>}

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 8 }}>ชื่อผู้ใช้</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }}>
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username"
                style={{ width: "100%", padding: "12px 14px 12px 44px", borderRadius: 12, border: "2px solid #e5e7eb", fontSize: 15, outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}
                onFocus={(e) => { e.target.style.borderColor = "#d4a017"; e.target.style.fontWeight = "700"; }} onBlur={(e) => { e.target.style.borderColor = "#e5e7eb"; e.target.style.fontWeight = "400"; }} />
            </div>
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 8 }}>รหัสผ่าน</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }}>
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              </span>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type={showPass ? "text" : "password"} placeholder="password"
                style={{ width: "100%", padding: "12px 44px 12px 44px", borderRadius: 12, border: "2px solid #e5e7eb", fontSize: 15, outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}
                onFocus={(e) => { e.target.style.borderColor = "#d4a017"; e.target.style.fontWeight = "700"; }} onBlur={(e) => { e.target.style.borderColor = "#e5e7eb"; e.target.style.fontWeight = "400"; }}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(e); }} />
              <button onClick={() => setShowPass(!showPass)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 0 }}>
                {showPass ? <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                : <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
              </button>
            </div>
          </div>

          <button onClick={handleSubmit}
            style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #d4a017, #b8860b)", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(212,160,23,0.3)", transition: "transform 0.1s" }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}>
            เข้าสู่ระบบ
          </button>


        </div>
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

// ---- MAIN WRAPPER ----
export default function AppWrapper() {
  const [user, setUser] = useState(() => {
    try { const s = sessionStorage.getItem("crm_user"); if(s) return JSON.parse(s); } catch {}
    return null;
  });
  const handleLogin = (u) => { setUser(u); sessionStorage.setItem("crm_user", JSON.stringify(u)); };
  const handleLogout = () => { setUser(null); sessionStorage.removeItem("crm_user"); };
  if (!user) return <LoginScreen onLogin={handleLogin} />;
  return <CRMApp currentUser={user} onLogout={handleLogout} />;
}

// ---- CRM APP ----
function CRMApp({ currentUser, onLogout }) {
  // ---- ALL STATE ----
  const [tab, setTab] = useState(() => sessionStorage.getItem("crm_tab") || (currentUser?.role === "admin" ? "customers" : "dashboard"));
  const [customers, setCustomers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [callSubjects, setCallSubjects] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [search, setSearch] = useState(() => sessionStorage.getItem("crm_search") || "");
  const [modal, setModal] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);
  const [settingsSubTab, setSettingsSubTab] = useState("statuses");
  const [selectedSupervisor, setSelectedSupervisor] = useState(null);
  const [assignSelected, setAssignSelected] = useState([]);
  const [toast, setToast] = useState(null);
  const [successModal, setSuccessModal] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showNotif, setShowNotif] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [quickUpdate, setQuickUpdate] = useState(null);
  const [trash, setTrash] = useState([]);
  const [trashSearch, setTrashSearch] = useState("");
  const [colWidths, setColWidths] = useState({});
  const [footerStats, setFooterStats] = useState({});
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [toolbarTab, setToolbarTab] = useState(null);
  const [advFilters, setAdvFilters] = useState(() => { try { const raw = JSON.parse(sessionStorage.getItem("crm_advFilters")) || []; const DATE_F = ["call_date","next_follow","order_date","created_at"]; const normD = (s) => { if (!s) return s; let m = String(s).match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`; m = String(s).match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/); if (m) { let y = parseInt(m[3],10); if (y > 2400) y -= 543; return `${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`; } return s; }; return raw.map(af => DATE_F.includes(af.field) ? { ...af, value: normD(af.value), value2: normD(af.value2) } : af); } catch { return []; } });
  const [filterFieldOpen, setFilterFieldOpen] = useState(null);
  const [filterOpOpen, setFilterOpOpen] = useState(null);
  const [filterFieldSearch, setFilterFieldSearch] = useState("");
  const [filterOpSearch, setFilterOpSearch] = useState("");
  const [empFilter, setEmpFilter] = useState(() => { try { return JSON.parse(sessionStorage.getItem("crm_empFilter")) || []; } catch { return []; } });
  const [empSearch, setEmpSearch] = useState("");
  const [sortCol, setSortCol] = useState("");
  const [sortDir, setSortDir] = useState("asc");
  const [assignEmployees, setAssignEmployees] = useState([]);
  const [promoFilter, setPromoFilter] = useState(() => sessionStorage.getItem("crm_promoFilter") || "");
  const [multiAddEmp, setMultiAddEmp] = useState(null);
  const [multiEditEmp, setMultiEditEmp] = useState(null);
  const [quickAddRows, setQuickAddRows] = useState(null);
  const [colOrder, setColOrder] = useState([]);
  const [dragCol, setDragCol] = useState(null);
  const [colOrderLoaded, setColOrderLoaded] = useState(false);
  const fileRef = useRef(null);
  const [pageSize, setPageSize] = useState(100);
  const [viewMode, setViewMode] = useState("table"); // "table" or "list"
  const PAGE_SIZE = pageSize;
  const [lastChecked, setLastChecked] = useState(null);

  // Helper: จับคู่พนักงานด้วย name, nickname, ชื่อในวงเล็บ, หรือ email/username
  const myNames = useMemo(() => {
    if (!currentUser) return new Set();
    const s = new Set();
    [currentUser.name, currentUser.nickname, currentUser.username, currentUser.email].forEach(v => {
      if (!v) return;
      s.add(v.toLowerCase().trim());
      // ดึงชื่อในวงเล็บ เช่น "ธนากานต์ (ปอนด์)" → "ปอนด์"
      const m = v.match(/\(([^)]+)\)/);
      if (m) s.add(m[1].toLowerCase().trim());
    });
    return s;
  }, [currentUser]);
  const isMe = useCallback((val) => {
    if (!val || !currentUser) return false;
    return myNames.has(val.toLowerCase().trim());
  }, [currentUser, myNames]);

  // ---- EFFECTS ----
  useEffect(() => { setPage(1); }, [search, promoFilter]);

  // Persist filters to sessionStorage
  useEffect(() => { sessionStorage.setItem("crm_search", search); }, [search]);
  useEffect(() => { sessionStorage.setItem("crm_tab", tab); }, [tab]);
  useEffect(() => { sessionStorage.setItem("crm_advFilters", JSON.stringify(advFilters)); }, [advFilters]);
  useEffect(() => { sessionStorage.setItem("crm_empFilter", JSON.stringify(empFilter)); }, [empFilter]);
  useEffect(() => { sessionStorage.setItem("crm_promoFilter", promoFilter); }, [promoFilter]);

  // ---- FETCH ALL DATA FROM SUPABASE ----
  const normalizePhone = (p) => { let s = String(p || "").replace(/\D/g, ""); if (s.length === 9) s = "0" + s; return s; };
  const lastSyncRef = useRef(null);   // max updated_at ที่ sync ไปแล้ว (สำหรับ incremental)
  const employeesRef = useRef([]);    // รายชื่อพนักงานล่าสุด (ใช้ตอน enrich แบบ incremental)
  const fetchAll = useCallback(async () => {
    try {
      const safeFetch = async (table) => { try { const r = await supabase.from(table).select(); return r.data || []; } catch { return []; } };
      const [c, e, s, cs, sv, tr] = await Promise.all([
        safeFetch("crm_customers"), safeFetch("crm_employees"), safeFetch("crm_statuses"),
        safeFetch("crm_call_subjects"), safeFetch("crm_supervisors"), safeFetch("crm_trash"),
      ]);
      // ลบพนักงานซ้ำ (เก็บแค่รายการแรกต่อ email)
      const seenEmail = new Set();
      const allEmp = (e || []).filter(emp => {
        const key = (emp.email || emp.username || emp.name || "").toLowerCase().trim();
        if (!key || seenEmail.has(key)) return false;
        seenEmail.add(key);
        return true;
      });

      // เติมชื่อเล่น/อีเมลพนักงานให้ลูกค้า (ใช้ helper เดียวกับ incremental sync)
      const enrichedCust = enrichCustomers(c, allEmp);

      // One-time sync: เขียน assigned_email ลง DB สำหรับลูกค้าที่ยังไม่มี
      if (!sessionStorage.getItem("crm_email_synced") && currentUser?.role === "admin") {
        const needSync = enrichedCust.filter(cust => cust.assigned_to && cust.assigned_email && !c.find(orig => orig.id === cust.id)?.assigned_email);
        if (needSync.length > 0) {
          console.log("Syncing assigned_email for", needSync.length, "customers...");
          const BATCH = 50;
          for (let i = 0; i < needSync.length; i += BATCH) {
            const batch = needSync.slice(i, i + BATCH);
            await Promise.all(batch.map(cust => supabase.from("crm_customers").update({ assigned_email: cust.assigned_email }).eq("id", cust.id)));
          }
          console.log("assigned_email sync done ✅");
        }
        sessionStorage.setItem("crm_email_synced", "1");
      }

      setCustomers(enrichedCust); setEmployees(allEmp); setStatuses(s); setCallSubjects(cs); setSupervisors(sv); setTrash(tr);
      employeesRef.current = allEmp;
      lastSyncRef.current = maxUpdatedAt(c, lastSyncRef.current);
    } catch (err) { console.error("Fetch error:", err); }
    setLoading(false);
  }, []);

  // ---- INCREMENTAL SYNC: โหลดเฉพาะลูกค้าที่เปลี่ยน + ตรวจการลบด้วย id อย่างเดียว ----
  // ตารางเล็ก (พนักงาน/สถานะ/หัวข้อ/หัวหน้า) รีเฟรชเต็มได้เพราะข้อมูลน้อย egress แทบเป็นศูนย์
  // ตารางลูกค้า (ก้อนใหญ่) ดึงเฉพาะแถวที่ updated_at ใหม่กว่าครั้งก่อน -> ลด egress มหาศาล
  const syncCustomers = useCallback(async () => {
    const since = lastSyncRef.current;
    // ยังไม่มีฐานเวลา หรือ DB ยังไม่มีคอลัมน์ updated_at -> โหลดเต็มแบบเดิม (ปลอดภัย)
    if (!since) { await fetchAll(); return; }

    // 1) รีเฟรชตารางเล็ก (cheap) เพื่อให้การเปลี่ยนพนักงาน/สถานะ propagate
    try {
      const [e, s, cs, sv] = await Promise.all([
        sbQuery("crm_employees", ""), sbQuery("crm_statuses", ""),
        sbQuery("crm_call_subjects", ""), sbQuery("crm_supervisors", ""),
      ]);
      if (e.ok) {
        const seen = new Set();
        const allEmp = (e.data || []).filter(emp => { const k = (emp.email || emp.username || emp.name || "").toLowerCase().trim(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
        employeesRef.current = allEmp; setEmployees(allEmp);
      }
      if (s.ok) setStatuses(s.data || []);
      if (cs.ok) setCallSubjects(cs.data || []);
      if (sv.ok) setSupervisors(sv.data || []);
    } catch {}

    // 2) ดึงเฉพาะลูกค้าที่เปลี่ยนตั้งแต่ครั้งก่อน
    const res = await sbQuery("crm_customers", `updated_at=gte.${encodeURIComponent(since)}`);
    if (!res.ok) { await fetchAll(); return; }   // ถ้า query พลาด (เช่นยังไม่มี updated_at) -> fallback โหลดเต็ม
    const changed = res.data || [];

    // 3) ดึงเฉพาะ id ทั้งหมด (payload เล็กมาก) เพื่อตรวจว่ามีลูกค้าถูกลบไหม
    const idsRes = await sbQuery("crm_customers", "select=id");
    const serverIds = idsRes.ok ? new Set((idsRes.data || []).map((r) => r.id)) : null;

    const enriched = changed.length ? enrichCustomers(changed, employeesRef.current) : [];
    setCustomers((prev) => {
      let next = serverIds ? prev.filter((c) => serverIds.has(c.id)) : prev.slice();
      if (enriched.length) {
        const map = new Map(next.map((c) => [c.id, c]));
        enriched.forEach((c) => map.set(c.id, c));
        next = Array.from(map.values());
      }
      return next;
    });
    lastSyncRef.current = maxUpdatedAt(changed, since);
  }, [fetchAll]);

  // Throttle sync: ไม่จำเป็นแล้ว — Realtime subscribe crm_customers patch ให้ทุกการเปลี่ยน (รวม echo ของเครื่องตัวเอง)
  // คงฟังก์ชันไว้เป็น no-op เพื่อไม่ต้องแก้จุดที่เรียกทั้งหมด (broadcastChange ยังทำงานปกติ)
  const throttledFetchAll = useCallback(() => {}, []);

  // Load column order + employee polls for supervisor/admin changes
  useEffect(() => {
    const loadColOrder = async () => {
      try {
        const res = await supabase.from("crm_settings").select();
        const settings = res.data || [];
        const colSettings = settings.filter((s) => s.key.startsWith("col_order_"));
        if (colSettings.length === 0) return;
        
        if (currentUser?.role === "employee") {
          // Employee: find supervisor's or admin's setting
          let setting = null;
          const myCust = customers.find((cx) => isMe(cx.assigned_to) && cx.supervisor);
          if (myCust?.supervisor) setting = colSettings.find((s) => s.key === "col_order_" + myCust.supervisor);
          if (!setting) setting = colSettings.find((s) => s.key === "col_order_Admin");
          if (!setting) setting = colSettings[0];
          if (setting) {
            try {
              const newOrder = JSON.parse(setting.value);
              setColOrder((prev) => JSON.stringify(prev) !== JSON.stringify(newOrder) ? newOrder : prev);
            } catch {}
          }
        } else if (!colOrderLoaded) {
          // Admin/Supervisor: load own setting once
          let setting = colSettings.find((s) => s.key === "col_order_" + currentUser?.name);
          if (setting) { try { setColOrder(JSON.parse(setting.value)); } catch {} }
        }
      } catch {}
      setColOrderLoaded(true);
    };
    loadColOrder();
    // Realtime แทน poll: re-apply เมื่อ crm_settings เปลี่ยน (เช่น แก้ลำดับคอลัมน์)
    const chS = sbRealtime.channel("crm-settings-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_settings" }, () => loadColOrder())
      .subscribe();
    return () => sbRealtime.removeChannel(chS);
  }, [currentUser?.name, customers.length]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Realtime แทน poll last_updated: subscribe crm_customers แล้ว patch จาก payload ตรง ๆ
  // -> ตัดทั้ง poll ทุก 30 วิ และ id-scan (select=id) ที่ syncCustomers เคยทำทุกการเปลี่ยน
  const [lastKnownUpdate, setLastKnownUpdate] = useState("0"); // คงไว้กันโค้ดอื่นอ้างถึง
  useEffect(() => {
    const upsert = (row) => {
      const enriched = enrichCustomers([row], employeesRef.current)[0] || row;
      setCustomers((prev) => {
        const i = prev.findIndex((c) => c.id === enriched.id);
        if (i === -1) return [enriched, ...prev];   // ใหม่ -> เพิ่มหน้าสุด
        const next = prev.slice(); next[i] = enriched; return next;  // เดิม -> แทนที่
      });
    };
    const ch = sbRealtime.channel("crm-customers-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "crm_customers" }, (p) => upsert(p.new))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "crm_customers" }, (p) => upsert(p.new))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "crm_customers" }, (p) => setCustomers((prev) => prev.filter((c) => c.id !== p.old.id)))
      .subscribe();
    return () => sbRealtime.removeChannel(ch);
  }, []);

  // Real-time notification polling every 10 seconds
  useEffect(() => {
    if (!currentUser?.name) return;
    const pollNotifications = async () => {
      try {
        const res = await supabase.from("crm_notifications").select();
        if (res.data) {
          const unread = res.data.filter((n) => isMe(n.to_user) && !n.read);
          setNotifications((prev) => {
            if (unread.length > prev.length && prev.length > 0) {
              // New notification arrived - show toast
              const newest = unread.find((n) => !prev.some((p) => p.id === n.id));
              if (newest) showToast("🔔 " + newest.message);
            }
            return unread;
          });
        }
      } catch {}
    };
    pollNotifications();
    // Realtime แทน poll: ดึง notifications ใหม่เมื่อมีการเปลี่ยน (ตารางเล็ก + คงตรรกะ toast เดิม)
    const chN = sbRealtime.channel("crm-notif-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_notifications" }, () => pollNotifications())
      .subscribe();
    return () => sbRealtime.removeChannel(chN);
  }, [currentUser?.name]);

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };
  const tableMap = { crm_customers: setCustomers, crm_employees: setEmployees, crm_statuses: setStatuses, crm_supervisors: setSupervisors, crm_call_subjects: setCallSubjects };

  // ---- SAVE (ADD / EDIT) ----
  const handleSave = async (table, data, mode) => {
    if (mode === "add") {
      const { id, ...rest } = data;
      const res = await supabase.from(table).insert(rest);
      if (res.data) showToast("เพิ่มสำเร็จ");
      else showToast("เกิดข้อผิดพลาด", "warning");
    } else {
      const { id, ...rest } = data;
      // ถ้าแก้ชื่อพนักงาน → อัปเดต assigned_to ในลูกค้าทั้งหมดของคนนั้น
      if (table === "crm_employees") {
        const oldEmp = employees.find(em => em.id === id);
        if (oldEmp && rest.name && rest.name !== oldEmp.name) {
          const empEmail = oldEmp.email || oldEmp.username || "";
          // อัปเดตลูกค้าที่ assigned_email ตรงกัน
          if (empEmail) {
            await supabase.from("crm_customers").update({ assigned_to: rest.name }).eq("assigned_email", empEmail);
          }
          // อัปเดตลูกค้าที่ assigned_to = ชื่อเก่า (กรณียังไม่มี assigned_email)
          await supabase.from("crm_customers").update({ assigned_to: rest.name, assigned_email: empEmail }).eq("assigned_to", oldEmp.name);
          // อัปเดตชื่อเล่นเก่าด้วย (เช่น "ปอนด์")
          const oldNick = oldEmp.name.match(/\(([^)]+)\)/);
          if (oldNick) {
            await supabase.from("crm_customers").update({ assigned_to: rest.name, assigned_email: empEmail }).eq("assigned_to", oldNick[1].trim());
          }
          showToast("อัปเดตชื่อในลูกค้าทั้งหมดแล้ว ✓");
        }
      }
      await supabase.from(table).update(rest).eq("id", id);
      showToast("บันทึกแล้ว");
    }
    setModal(null);
    throttledFetchAll(); broadcastChange();
  };

  // ---- DELETE → MOVE TO TRASH ----
  // คอลัมน์ที่มีอยู่จริงใน crm_trash (ไม่รวม id, ที่ระบบเติมเองภายหลัง)
  const TRASH_COLS = ["name","phone","note","previous_promo","order_date","received_product","status","supervisor","assigned_to","created_at","call_date","call_subject","call_note","customer_relation","next_follow","offer","product_price"];
  const buildTrashRow = (item) => {
    const row = { original_id: item.id, deleted_at: new Date().toISOString(), deleted_by: currentUser?.name || "admin" };
    TRASH_COLS.forEach((k) => { if (item[k] !== undefined) row[k] = item[k]; });
    return row;
  };

  const handleDelete = async (table, id) => {
    if (!confirm("ต้องการลบ?")) return;
    setProgress({ current: 0, total: 2, label: "กำลังลบข้อมูล..." });
    if (table === "crm_customers") {
      const item = customers.find((c) => c.id === id);
      if (item) {
        const res = await supabase.from("crm_trash").insert(buildTrashRow(item));
        if (res?.error) {
          setProgress(null);
          console.error("Trash insert failed:", res.error);
          alert("⚠️ ไม่สามารถย้ายไปถังขยะได้ จึงยกเลิกการลบเพื่อไม่ให้ข้อมูลหาย\n\n" + JSON.stringify(res.error));
          return;
        }
      }
    }
    setProgress({ current: 1, total: 2, label: "กำลังลบข้อมูล..." });
    await supabase.from(table).delete().eq("id", id);
    setProgress({ current: 2, total: 2, label: "กำลังลบข้อมูล..." });
    setProgress(null);
    throttledFetchAll(); broadcastChange();
    showToast("ลบสำเร็จ ✓");
  };

  const handleBulkDelete = async () => {
    if (!selectedRows.length || !confirm("ลบทั้งหมด " + selectedRows.length + " รายการ?\n\n⚠️ ข้อมูลจะย้ายไปถังขยะ")) return;
    const total = selectedRows.length;
    const BATCH = 100;
    setProgress({ current: 0, total, label: "กำลังลบข้อมูล..." });
    // เตรียม row สำหรับถังขยะ — กรองเฉพาะคอลัมน์ที่ crm_trash รองรับ
    const trashRows = selectedRows.map((rid) => {
      const item = customers.find((c) => c.id === rid);
      return item ? buildTrashRow(item) : null;
    }).filter(Boolean);

    // Batch insert to trash — เช็ค error ทุกชุด ถ้าพังให้หยุดทันที (ไม่ลบข้อมูลต้นฉบับ)
    const insertedIds = [];
    for (let b = 0; b < Math.ceil(trashRows.length / BATCH); b++) {
      const slice = trashRows.slice(b * BATCH, (b + 1) * BATCH);
      const res = await supabase.from("crm_trash").insert(slice);
      if (res?.error) {
        setProgress(null);
        console.error("Trash insert failed at batch", b, res.error);
        alert("⚠️ ย้ายไปถังขยะไม่สำเร็จ ที่ batch " + (b+1) + "\nระบบหยุดการลบเพื่อป้องกันข้อมูลหาย\n\nรายละเอียด: " + JSON.stringify(res.error).slice(0, 300));
        throttledFetchAll();
        return;
      }
      // เก็บ original_id ของชุดที่ insert สำเร็จแล้ว
      slice.forEach(r => insertedIds.push(r.original_id));
      setProgress({ current: Math.min((b + 1) * BATCH, total) * 0.5, total, label: "กำลังย้ายไปถังขยะ..." });
    }

    // Batch delete — ลบเฉพาะ id ที่ใส่ถังขยะสำเร็จแล้วเท่านั้น
    for (let b = 0; b < Math.ceil(insertedIds.length / BATCH); b++) {
      const batch = insertedIds.slice(b * BATCH, (b + 1) * BATCH);
      await supabase.from("crm_customers").delete().in("id", batch);
      setProgress({ current: Math.round(total * 0.5 + Math.min((b + 1) * BATCH, total) * 0.5), total, label: "กำลังลบข้อมูล..." });
    }
    setProgress(null);
    setSelectedRows([]);
    throttledFetchAll(); broadcastChange();
    showToast("ลบ " + total + " รายการสำเร็จ ✓");
  };

  // ---- RESTORE FROM TRASH ----
  const handleRestore = async (id) => {
    const item = trash.find((t) => t.id === id);
    if (!item) return;
    setProgress({ current: 0, total: 2, label: "กำลังกู้คืน..." });
    const { id: tid, original_id, deleted_at, deleted_by, ...rest } = item;
    await supabase.from("crm_customers").insert(rest);
    setProgress({ current: 1, total: 2, label: "กำลังกู้คืน..." });
    await supabase.from("crm_trash").delete().eq("id", tid);
    setProgress({ current: 2, total: 2, label: "กำลังกู้คืน..." });
    setProgress(null);
    throttledFetchAll(); broadcastChange();
    showToast("กู้คืนสำเร็จ ✓");
  };

  const handlePermanentDelete = async (id) => {
    if (!confirm("ลบถาวร?")) return;
    setProgress({ current: 0, total: 1, label: "กำลังลบถาวร..." });
    await supabase.from("crm_trash").delete().eq("id", id);
    setProgress({ current: 1, total: 1, label: "กำลังลบถาวร..." });
    setProgress(null);
    throttledFetchAll(); broadcastChange();
    showToast("ลบถาวรสำเร็จ ✓");
  };

  const handleEmptyTrash = async () => {
    if (!confirm("ลบถาวรทั้งหมด " + trash.length + " รายการ?\n\n⚠️ ลบแล้วกู้คืนไม่ได้")) return;
    const total = trash.length;
    setProgress({ current: 0, total: 1, label: "กำลังล้างถังขยะ..." });
    await supabase.from("crm_trash").delete().gte("id", 0);
    setProgress(null);
    throttledFetchAll(); broadcastChange();
    showToast("ล้างถังขยะ " + total + " รายการสำเร็จ ✓");
  };

  // ---- INLINE UPDATE ----
  const broadcastChange = async () => {
    try { await supabase.from("crm_settings").delete().eq("key", "last_updated"); await supabase.from("crm_settings").insert({ key: "last_updated", value: Date.now().toString() }); } catch {}
  };
  const upd = async (id, f, v) => {
    setCustomers((p) => p.map((c) => c.id === id ? { ...c, [f]: v } : c));
    await supabase.from("crm_customers").update({ [f]: v }).eq("id", id);
    broadcastChange();
  };

  // ---- IMPORT CSV ----
  // ---- IMPORT CSV / XLSX ----
  // แปลงค่าวันที่ให้เป็น ISO (YYYY-MM-DD) หรือ null ถ้าแปลงไม่ได้
  const parseDate = (val) => {
    if (val === null || val === undefined || val === "") return null;
    // Excel serial date
    if (typeof val === "number" && val > 25569 && val < 60000) {
      const d = new Date((val - 25569) * 86400 * 1000);
      if (!isNaN(d)) return d.toISOString().slice(0, 10);
    }
    let s = String(val).trim();
    if (!s) return null;
    // ลบเวลาที่นำหน้า เช่น "19:00 30/04/2026"
    s = s.replace(/^\d{1,2}:\d{2}(:\d{2})?\s+/, "");
    // YYYY-MM-DD หรือ YYYY/MM/DD
    let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    // DD/MM/YYYY หรือ DD-MM-YYYY (รองรับปี พ.ศ. 25xx → ลบ 543)
    m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
    if (m) {
      let y = parseInt(m[3], 10);
      if (y > 2400) y -= 543;
      return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
    const d = new Date(s);
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
    return null;
  };
  // ดึงเฉพาะตัวเลขออกจากค่า (สำหรับราคา)
  const parseNum = (val) => {
    if (val === null || val === undefined || val === "") return 0;
    if (typeof val === "number") return val;
    const m = String(val).match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : 0;
  };

  const handleImport = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    let rows = []; // array of arrays — แถวแรกคือ headers
    try {
      if (ext === "xlsx" || ext === "xls") {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
        rows = rows.filter((r) => r.some((c) => String(c || "").trim()));
      } else {
        // ลองอ่านเป็น UTF-8 ก่อน ถ้า header ภาษาไทยใช้ไม่ได้ ลอง Windows-874 (TIS-620)
        const buf = await file.arrayBuffer();
        const tryDecode = (enc) => {
          try { return new TextDecoder(enc, { fatal: false }).decode(buf); }
          catch { return null; }
        };
        // ── Parser อ่านทีละตัวอักษร — รองรับ newline ในเครื่องหมายคำพูด + escaped quote ("") ──
        const parseCSV = (text) => {
          const rows = []; let row = []; let cur = ""; let inQuote = false;
          for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (inQuote) {
              if (ch === '"') {
                if (text[i + 1] === '"') { cur += '"'; i++; }
                else { inQuote = false; }
              } else { cur += ch; }
            } else {
              if (ch === '"') inQuote = true;
              else if (ch === ',') { row.push(cur); cur = ""; }
              else if (ch === '\r') { /* skip */ }
              else if (ch === '\n') {
                row.push(cur);
                if (row.some((c) => String(c).trim())) rows.push(row);
                row = []; cur = "";
              } else cur += ch;
            }
          }
          if (cur || row.length > 0) {
            row.push(cur);
            if (row.some((c) => String(c).trim())) rows.push(row);
          }
          return rows;
        };
        const isHeaderUsable = (text) => {
          if (!text) return false;
          if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
          const r = parseCSV(text);
          if (!r.length) return false;
          const cells = r[0].map((h) => String(h || "").toLowerCase());
          return cells.some((c) => c.includes("ชื่อ") || c.includes("name") || c.includes("เบอร์") || c.includes("โทร") || c.includes("phone"));
        };
        let text = tryDecode("utf-8");
        if (!isHeaderUsable(text)) {
          const alt = tryDecode("windows-874");
          if (isHeaderUsable(alt)) text = alt;
          else {
            const alt2 = tryDecode("tis-620");
            if (isHeaderUsable(alt2)) text = alt2;
          }
        }
        if (!text) { alert("อ่านไฟล์ไม่ได้ — รหัสอักขระไม่รองรับ"); e.target.value = ""; return; }
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        rows = parseCSV(text);
      }
    } catch (err) {
      console.error("File read error:", err);
      alert("อ่านไฟล์ไม่ได้: " + (err.message || err));
      e.target.value = ""; return;
    }
    if (rows.length < 2) { showToast("ไฟล์ว่างหรือไม่มีข้อมูล", "warning"); e.target.value = ""; return; }

    const headers = rows[0].map((h) => String(h || "").replace(/"/g, "").toLowerCase().trim());
    const find = (...keys) => headers.findIndex((h) => keys.some((k) => h.includes(k)));
    const idx = {
      name: find("name", "ชื่อ"),
      phone: find("phone", "เบอร์", "โทร"),
      note: find("note", "ที่อยู่", "address"),
      promo: find("promo", "โปรก่อน", "โปรเก่า"),
      subject: find("หัวข้อโทร", "call_subject", "subject"),
      orderDate: find("วันที่สั่ง", "order_date", "สั่งซื้อ"),
      received: find("ได้รับสิน", "received", "รับสินค้า"),
      nickname: find("ชื่อเล่น", "nickname"),
      relation: find("ความสัมพันธ์", "customer_relation", "relation"),
      status: find("สถานะ", "status"),
      assigned: find("มอบหมาย", "assigned"),
      supervisor: find("หัวหน้า", "supervisor"),
      callDate: find("วันที่โทร", "call_date"),
      callNote: find("หมายเหตุ", "call_note"),
      nextFollow: find("ครั้งถัดไป", "next_follow", "ติดตาม"),
      productPrice: find("โปรสินค้า", "product_price", "ราคา"),
    };
    if (idx.name === -1 && idx.phone === -1) {
      alert("ไม่พบคอลัมน์ ชื่อ หรือ เบอร์โทร ในไฟล์\n\nคอลัมน์ที่พบในไฟล์:\n" + headers.join(", "));
      e.target.value = ""; return;
    }

    const existingPhoneMap = new Map(customers.filter(c => c.phone).map((c) => { const p = c.phone.replace(/\D/g, ""); return p ? [p, c.name || "(ไม่ระบุ)"] : null; }).filter(Boolean));
    const successList = []; const dupeList = []; const allRows = [];
    const get = (row, i) => i >= 0 ? row[i] : "";

    for (let i = 1; i < rows.length; i++) {
      const v = rows[i];
      const name = String(get(v, idx.name) || "").trim();
      const phone = String(get(v, idx.phone) || "").trim();
      if (!name && !phone) continue;
      const cleanPhone = phone.replace(/\D/g, "");
      if (cleanPhone && existingPhoneMap.has(cleanPhone)) { dupeList.push({ name, phone, existingName: existingPhoneMap.get(cleanPhone) }); continue; }
      if (cleanPhone) existingPhoneMap.set(cleanPhone, name);

      const rawSubject = String(get(v, idx.subject) || "").trim();
      const matchedSubject = callSubjects.find((s) => s.label.toLowerCase() === rawSubject.toLowerCase());
      const rawStatusText = String(get(v, idx.status) || "").trim();
      const matchedStatus = statuses.find((s) => s.label === rawStatusText) || statuses.find((s) => s.label.toLowerCase() === rawStatusText.toLowerCase());
      const receivedRaw = String(get(v, idx.received) || "").toLowerCase();
      const received = receivedRaw.includes("ได้รับ") || receivedRaw === "true" || receivedRaw === "1" || receivedRaw === "yes";

      // สร้าง row โดยใส่เฉพาะ field ที่มีค่า — ป้องกัน null/empty ทำให้ schema reject
      const row = {
        name: name || "(ไม่ระบุ)",
        phone,
        status: matchedStatus ? matchedStatus.key : "not_called",
        received_product: received,
      };
      const note = String(get(v, idx.note) || "").trim(); if (note) row.note = note;
      const promo = String(get(v, idx.promo) || "").trim(); if (promo) row.previous_promo = promo;
      if (matchedSubject || rawSubject) row.call_subject = matchedSubject ? matchedSubject.label : rawSubject;
      const orderDate = parseDate(get(v, idx.orderDate)); if (orderDate) row.order_date = orderDate;
      const nickname = String(get(v, idx.nickname) || "").trim(); if (nickname) row.nickname = nickname;
      const relation = idx.relation >= 0 ? parseNum(get(v, idx.relation)) : 0; row.customer_relation = relation;
      const assigned = String(get(v, idx.assigned) || "").trim(); if (assigned) row.assigned_to = assigned;
      const sv = String(get(v, idx.supervisor) || "").trim(); if (sv) row.supervisor = sv;
      const callDate = parseDate(get(v, idx.callDate)); if (callDate) row.call_date = callDate;
      const callNote = String(get(v, idx.callNote) || "").trim(); if (callNote) row.call_note = callNote;
      const nextFollow = parseDate(get(v, idx.nextFollow)); if (nextFollow) row.next_follow = nextFollow;
      const price = idx.productPrice >= 0 ? parseNum(get(v, idx.productPrice)) : 0; if (price > 0) row.product_price = price;

      allRows.push(row);
    }

    if (!allRows.length) {
      setImportResult({ success: successList, dupes: dupeList });
      e.target.value = "";
      return;
    }

    // ── INSERT แบบเร็ว: BATCH ใหญ่ + parallel + return=minimal ──
    const BATCH = 500;
    const CONCURRENT = 5;
    const batches = [];
    for (let i = 0; i < allRows.length; i += BATCH) batches.push(allRows.slice(i, i + BATCH));

    const fastInsert = async (rows) => {
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/crm_customers`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal", // ไม่ต้องส่งข้อมูลกลับ → เร็วขึ้นมาก
          },
          body: JSON.stringify(rows),
        });
        if (r.ok) return { ok: true };
        const err = await r.json().catch(() => ({ message: r.statusText }));
        return { ok: false, error: err };
      } catch (err) { return { ok: false, error: { message: String(err) } }; }
    };

    const failed = [];
    let completed = 0;
    setProgress({ current: 0, total: allRows.length, label: "กำลังนำเข้าข้อมูล..." });

    // ยิง batch แบบ concurrent ทีละ CONCURRENT ชุด
    for (let i = 0; i < batches.length; i += CONCURRENT) {
      const chunk = batches.slice(i, i + CONCURRENT);
      const results = await Promise.all(chunk.map((b) => fastInsert(b)));
      for (let j = 0; j < chunk.length; j++) {
        const batch = chunk[j];
        const res = results[j];
        if (res.ok) {
          batch.forEach((r) => successList.push({ name: r.name, phone: r.phone }));
        } else {
          // batch fail → ค่อย insert ทีละแถวเพื่อหาแถวที่มีปัญหา
          for (const row of batch) {
            const r2 = await fastInsert([row]);
            if (r2.ok) successList.push({ name: row.name, phone: row.phone });
            else failed.push({ name: row.name, phone: row.phone, reason: (r2.error?.message || JSON.stringify(r2.error)).slice(0, 120) });
          }
        }
        completed += batch.length;
      }
      setProgress({ current: Math.min(completed, allRows.length), total: allRows.length, label: "กำลังนำเข้าข้อมูล..." });
    }

    // Refresh เฉพาะตาราง customers (เร็วกว่า fetchAll ทั้งหมด)
    try {
      const fresh = await supabase.from("crm_customers").select();
      if (fresh?.data) setCustomers(fresh.data);
    } catch {}
    broadcastChange();
    setProgress(null);
    setImportResult({ success: successList, dupes: dupeList, failed });
    e.target.value = "";
  };

  // ---- SUPERVISOR ASSIGN ----
  const handleAssign = async () => {
    if (!assignSelected.length || !assignEmployees.length) return;
    const total = assignSelected.length;
    setProgress({ current: 0, total, label: "กำลังมอบหมาย..." });
    const chunks = [];
    for (let i = 0; i < assignEmployees.length; i++) chunks.push([]);
    assignSelected.forEach((rid, idx) => chunks[idx % assignEmployees.length].push(rid));
    let done = 0;
    for (let i = 0; i < assignEmployees.length; i++) {
      const BATCH = 100;
      for (let b = 0; b < Math.ceil(chunks[i].length / BATCH); b++) {
        const batch = chunks[i].slice(b * BATCH, (b + 1) * BATCH);
        await supabase.from("crm_customers").update({ assigned_to: assignEmployees[i], assigned_email: (employees.find(em => em.name === assignEmployees[i]) || {}).email || (employees.find(em => em.name === assignEmployees[i]) || {}).username || "", supervisor: selectedSupervisor?.name || "" }).in("id", batch);
        done += batch.length;
        setProgress({ current: done, total, label: "กำลังมอบหมาย..." });
      }
    }
    setProgress(null);
    throttledFetchAll(); broadcastChange();
    const summary = assignEmployees.map((name, i) => name + " (" + chunks[i].length + ")").join(", ");
    // Send notifications to assigned employees
    for (let i = 0; i < assignEmployees.length; i++) {
      if (chunks[i].length > 0) {
        try { await supabase.from("crm_notifications").insert({ to_user: assignEmployees[i], from_user: currentUser?.name || "admin", message: "มอบหมายลูกค้า " + chunks[i].length + " คนให้คุณ", type: "assign", count: chunks[i].length, read: false, created_at: new Date().toISOString() }); } catch {}
      }
    }
    showToast("กระจาย " + total + " ลูกค้าสำเร็จ ✓ → " + summary);
    setSuccessModal({ count: total, detail: summary });
    setAssignSelected([]); setAssignEmployees([]);
  };
  const handleRevoke = async () => {
    if (!assignSelected.length || !confirm("ถอนสิทธิ์?")) return;
    const BATCH = 100;
    setProgress({ current: 0, total: assignSelected.length, label: "กำลังถอนสิทธิ์..." });
    for (let b = 0; b < Math.ceil(assignSelected.length / BATCH); b++) {
      const batch = assignSelected.slice(b * BATCH, (b + 1) * BATCH);
      await supabase.from("crm_customers").update({ assigned_to: "", supervisor: "" }).in("id", batch);
      setProgress({ current: Math.min((b + 1) * BATCH, assignSelected.length), total: assignSelected.length, label: "กำลังถอนสิทธิ์..." });
    }
    setProgress(null);
    throttledFetchAll(); broadcastChange();
    showToast("ถอนสิทธิ์แล้ว", "warning");
    setAssignSelected([]);
  };

  const handleExport = () => {
    const h = ["ชื่อ","เบอร์โทร","ที่อยู่","โปรก่อนหน้า","วันที่สั่งซื้อ","ได้รับสินค้า","สถานะ","มอบหมาย","หัวหน้า","หัวข้อโทร","วันที่โทร","หมายเหตุ","ความสัมพันธ์","ครั้งถัดไป","โปรสินค้า","ชื่อเล่น"];
    const rows = customers.map((c) => [c.name,c.phone,c.note,c.previous_promo,c.order_date,c.received_product,c.status,c.assigned_to,c.supervisor,c.call_subject,c.call_date,c.call_note,c.customer_relation,c.next_follow,c.product_price,c.nickname].map((v) => '"' + String(v||"").replace(/"/g,'""') + '"').join(","));
    const blob = new Blob(["\uFEFF" + [h.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "crm_" + new Date().toISOString().slice(0,10) + ".csv"; a.click();
  };

  const extractPromoPrice = (promo) => { const m = String(promo || "").match(/\((\d+)\)/); return m ? m[1] : null; };
  const fc = (() => {
    let result = customers.filter((c) => {
      if (currentUser?.role === "employee" && !isMe(c.assigned_to) && !isMe(c.assigned_email)) return false;
      if (currentUser?.role === "supervisor" && !isMe(c.supervisor) && !isMe(c.assigned_to) && !isMe(c.assigned_email)) return false;
      // Promo filter
      if (promoFilter && extractPromoPrice(c.previous_promo) !== promoFilter) return false;
      // Search
      if (search) { const q = search.toLowerCase(); if (![c.name, c.phone, c.note, c.previous_promo, c.order_date, c.assigned_to, c.supervisor, c.call_date, c.call_subject, c.call_note, c.nickname, c.created_at, String(c.product_price ?? ""), String(c.customer_relation ?? "")].some((v) => v?.toLowerCase().includes(q))) return false; }
      // Employee filter — เทียบทั้งชื่อ, ชื่อเล่น, อีเมล
      if (empFilter.length > 0) {
        const matchAny = empFilter.some(empName => {
          const emp = employees.find(em => em.name === empName);
          if (!emp) return c.assigned_to === empName;
          const a = (c.assigned_to || "").toLowerCase();
          const ae = (c.assigned_email || "").toLowerCase();
          if (a === emp.name.toLowerCase() || a === (emp.nickname || "").toLowerCase()) return true;
          if (ae && (ae === (emp.email || "").toLowerCase() || ae === (emp.username || "").toLowerCase())) return true;
          const m = emp.name.match(/\(([^)]+)\)/);
          if (m && a === m[1].trim().toLowerCase()) return true;
          return false;
        });
        if (!matchAny) return false;
      }
      // Advanced filters — ฟิลด์เดียวกัน = OR, ต่างฟิลด์ = AND
      const activeFilters = advFilters.filter(af => af.field && (af.value || af.value === "__empty__" || af.op === "range" || af.op === "not_range" || af.op === "empty" || af.op === "has_value"));
      if (activeFilters.length > 0) {
        // จัดกลุ่มตามฟิลด์
        const grouped = {};
        activeFilters.forEach(af => { if (!grouped[af.field]) grouped[af.field] = []; grouped[af.field].push(af); });
        for (const [field, filters] of Object.entries(grouped)) {
          // OR ภายในกลุ่มเดียวกัน — ต้อง match อย่างน้อย 1 ตัว
          const anyMatch = filters.some(af => {
            // กรอง "ไม่มีค่า" / "มีค่า"
            if (af.value === "__empty__" || af.op === "empty") {
              const raw = c[af.field];
              const isEmpty = raw === null || raw === undefined || String(raw).trim() === "";
              if (af.op === "neq") return !isEmpty;
              return isEmpty;
            }
            if (af.op === "has_value") {
              const raw = c[af.field];
              return raw !== null && raw !== undefined && String(raw).trim() !== "";
            }
            if (af.field === "assigned_to" && af.value === "__unassigned__") {
              if (af.op === "eq") return !c.assigned_to;
              if (af.op === "neq") return !!c.assigned_to;
              return false;
            }
            if (af.field === "assigned_to" && af.value !== "__unassigned__") {
              const emp = employees.find(em => em.name === af.value);
              if (emp) {
                const a = (c.assigned_to || "").toLowerCase();
                const ae = (c.assigned_email || "").toLowerCase();
                const matched = a === emp.name.toLowerCase() || a === (emp.nickname || "").toLowerCase() || (ae && (ae === (emp.email || "").toLowerCase() || ae === (emp.username || "").toLowerCase())) || (() => { const m = emp.name.match(/\(([^)]+)\)/); return m && a === m[1].trim().toLowerCase(); })();
                if (af.op === "eq" || af.op === "contains") return matched;
                if (af.op === "neq") return !matched;
              }
            }
            const raw = c[af.field];
            const cv = String(raw !== null && raw !== undefined ? raw : "").toLowerCase();
            const fv = (af.value || "").toLowerCase();
            if (af.op === "contains") return cv.includes(fv);
            if (af.op === "eq") return cv === fv;
            if (af.op === "neq") return cv !== fv;
            // -- Date normalization helper: handles YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY --
            const toISO = (s) => { const r = String(s ?? "").trim(); if (!r) return ""; let m = r.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`; m = r.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/); if (m) { let y = parseInt(m[3],10); if (y > 2400) y -= 543; return `${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`; } return r.slice(0,10); };
            if (af.op === "gte") { const d = toISO(raw); const fv = toISO(af.value); return d.length >= 10 && d >= fv; }
            if (af.op === "lte") { const d = toISO(raw); const fv = toISO(af.value); return d.length >= 10 && d <= fv; }
            if (af.op === "range") {
              const d = toISO(raw);
              if (!d || d.length < 10) return false;
              const fv1 = toISO(af.value); const fv2 = toISO(af.value2);
              if (fv1 && d < fv1) return false;
              if (fv2 && d > fv2) return false;
              return true;
            }
            if (af.op === "not_range") {
              const d = toISO(raw);
              if (!d || d.length < 10) return true;
              const fv1 = toISO(af.value); const fv2 = toISO(af.value2);
              if (fv1 && fv2) return d < fv1 || d > fv2;
              if (fv1) return d < fv1;
              if (fv2) return d > fv2;
              return true;
            }
            return true;
          });
          if (!anyMatch) return false;
        }
      }
      return true;
    });
    // Sort
    if (sortCol) {
      result = [...result].sort((a, b) => {
        const av = a[sortCol] ?? ""; const bv = b[sortCol] ?? "";
        const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
        return sortDir === "desc" ? -cmp : cmp;
      });
    }
    return result;
  })();

  const myCustomers = currentUser?.role === "employee" ? customers.filter((c) => isMe(c.assigned_to) || isMe(c.assigned_email)) : currentUser?.role === "supervisor" ? customers.filter((c) => isMe(c.supervisor) || isMe(c.assigned_to) || isMe(c.assigned_email)) : customers;
  const totalPages = Math.max(1, Math.ceil(fc.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedFc = fc.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const stats = [{ l: "ทั้งหมด", v: myCustomers.length, c: "#d4a017" }, ...statuses.map((s) => ({ l: s.label, v: myCustomers.filter((c) => c.status === s.key).length, c: s.color }))];
  const svC = selectedSupervisor ? customers.filter((c) => c.supervisor === selectedSupervisor.name) : [];
  const unC = customers.filter((c) => !c.supervisor && !c.assigned_to);

  const bp = { display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #d4a017, #b8860b)", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer", boxShadow: "0 2px 8px rgba(212,160,23,0.3)" };
  const bd = { display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: "none", background: "#fee2e2", color: "#dc2626", fontWeight: 600, fontSize: 15, cursor: "pointer" };
  const bi = (d) => ({ padding: "6px 8px", borderRadius: 8, border: "1px solid " + (d ? "#fee2e2" : "#e5e7eb"), background: "#fff", cursor: "pointer", color: d ? "#ef4444" : "#6b7280", display: "flex", alignItems: "center" });
  const bo = { display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: 10, border: "2px solid #e5e7eb", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer" };
  const iS = { width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 14, outline: "none", boxSizing: "border-box" };
  const lS = { display: "block", fontSize: 15, fontWeight: 600, color: "#374151", marginBottom: 6 };

  // Column definitions - key, label, render function
  const COL_DEFS = {
    name: { label: "ชื่อ", render: (c) => <EditableCell value={c.name} onSave={(v) => upd(c.id, "name", v)} style={{ fontWeight: 600, color: "#3d2a0a" }} />, minW: 140 },
    phone: { label: "เบอร์โทร", render: (c) => <EditableCell value={c.phone} onSave={(v) => upd(c.id, "phone", v)} /> },
    note: { label: "ที่อยู่", render: (c) => <EditableCell value={c.note} onSave={(v) => upd(c.id, "note", v)} type="textarea" />, maxW: 180 },
    previous_promo: { label: "โปรก่อนหน้า", render: (c) => <EditableCell value={c.previous_promo} onSave={(v) => upd(c.id, "previous_promo", v)} /> },
    order_date: { label: "วันที่สั่งซื้อ", render: (c) => <EditableCell value={c.order_date} onSave={(v) => upd(c.id, "order_date", v)} type="datetime" /> },
    received_product: { label: "ได้รับสินค้า", render: (c) => c.received_product ? <span style={{ color: "#059669", fontWeight: 600, cursor: "pointer", fontSize: 9 }} onClick={() => upd(c.id, "received_product", false)}>✓ได้รับ</span> : <span style={{ color: "#d97706", cursor: "pointer", fontSize: 9 }} onClick={() => upd(c.id, "received_product", true)}>รอส่ง</span> },
    status: { label: "สถานะ", render: (c) => <InlineStatusDropdown value={c.status} statuses={statuses} onChange={(v) => { upd(c.id, "status", v); if (c.status === "not_called" && v !== "not_called") upd(c.id, "call_date", new Date().toISOString().slice(0, 10)); }} />, minW: 120 },
    call_subject: { label: "หัวข้อโทร", render: (c) => <SubjectDropdown value={c.call_subject} subjects={callSubjects} onChange={(v) => upd(c.id, "call_subject", v)} /> },
    call_date: { label: "วันที่โทร", render: (c) => <EditableCell value={c.call_date} onSave={(v) => upd(c.id, "call_date", v)} type="date" /> },
    call_note: { label: "หมายเหตุ", render: (c) => <EditableCell value={c.call_note} onSave={(v) => upd(c.id, "call_note", v)} type="textarea" />, minW: 300 },
    customer_relation: { label: "ความสัมพันธ์ลูกค้า", render: (c) => <RatingSelector value={c.customer_relation} onChange={(v) => upd(c.id, "customer_relation", v)} /> },
    next_follow: { label: "ครั้งถัดไป", render: (c) => <EditableCell value={c.next_follow} onSave={(v) => upd(c.id, "next_follow", v)} type="date" /> },
    product_price: { label: "โปรสินค้า", render: (c) => <EditableCell value={c.product_price ? String(c.product_price) : ""} onSave={(v) => upd(c.id, "product_price", Number(v) || 0)} /> },
    assigned_to: { label: "มอบหมาย", render: (c) => <span style={{ fontSize: 9, color: c.assigned_to ? "#92400e" : "#d97706", fontWeight: 600, whiteSpace: "nowrap" }}>{c.assigned_to || "ยังไม่มอบหมาย"}</span> },
    nickname: { label: "ชื่อเล่น", render: (c) => <span style={{ fontSize: 12, color: "#6b7280" }}>{c.nickname || "—"}</span> },
    created_at: { label: "วันที่สร้าง", render: (c) => <span style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap" }}>{c.created_at ? (() => { try { const d = new Date(c.created_at); return d.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "2-digit" }); } catch { return c.created_at; } })() : "—"}</span> },
  };
  const DEFAULT_COL_ORDER = ["name","phone","note","previous_promo","order_date","received_product","status","call_subject","call_date","call_note","customer_relation","next_follow","product_price","assigned_to","nickname","created_at"];
  const activeColOrder = (colOrder.length ? colOrder : DEFAULT_COL_ORDER).filter((k) => COL_DEFS[k]);
  const TH = activeColOrder.map((k) => COL_DEFS[k].label);

  return (
    <div style={{ fontFamily: "'Sarabun','Noto Sans Thai',sans-serif", background: "#f0f2f5", minHeight: "100vh", color: "#1a1a2e" }}>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <header style={{ background: "linear-gradient(135deg, #3d2a0a, #2a1d06)", padding: "0 32px", height: 64, display: "flex", alignItems: "center", gap: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.15)" }}>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}><I.Menu /></button>
        <img src={import.meta.env.BASE_URL + "logo.png"} alt="Logo" style={{ height: 36, objectFit: "contain" }} />
        <span style={{ color: "#fff", fontSize: 20, fontWeight: 700 }}>CRM THE MT</span>
        {USE_DEMO && <span style={{ background: "#fbbf24", color: "#78350f", fontSize: 15, padding: "2px 10px", borderRadius: 12, fontWeight: 600 }}>DEMO</span>}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 15 }}>{currentUser?.name} ({({ admin: "ผู้ดูแล", employee: "พนักงาน", supervisor: "หัวหน้า" }[currentUser?.role]) || currentUser?.role})</span>
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowNotif(!showNotif)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 6, position: "relative", fontSize: 20 }} className={notifications.length > 0 ? "bell-shake" : ""}>
              🔔
              {notifications.length > 0 && <span style={{ position: "absolute", top: 0, right: 0, background: "#ef4444", color: "#fff", fontSize: 14, fontWeight: 700, borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>{notifications.length}</span>}
            </button>
            {showNotif && <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, background: "#fff", borderRadius: 14, boxShadow: "0 8px 30px rgba(0,0,0,0.2)", border: "1px solid #e5e7eb", width: 340, zIndex: 200, animation: "fadeIn .15s" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#374151" }}>🔔 แจ้งเตือน ({notifications.length})</span>
                {notifications.length > 0 && <button onClick={async () => { for (const n of notifications) { await supabase.from("crm_notifications").update({ read: true }).eq("id", n.id); } setNotifications([]); }} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 14, cursor: "pointer" }}>อ่านทั้งหมด</button>}
              </div>
              <div style={{ maxHeight: 320, overflowY: "auto" }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: 30, textAlign: "center", color: "#9ca3af", fontSize: 15 }}>ไม่มีแจ้งเตือน</div>
                ) : notifications.map((n) => (
                  <div key={n.id} style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6", background: "#fffbeb" }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#3d2a0a", marginBottom: 4 }}>{n.message}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 15, color: "#9ca3af" }}>จาก {n.from_user} • {(() => { try { return new Date(n.created_at).toLocaleString("th-TH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } })()}</span>
                      <button onClick={async () => { await supabase.from("crm_notifications").update({ read: true }).eq("id", n.id); setNotifications(notifications.filter((x) => x.id !== n.id)); }} style={{ background: "none", border: "none", color: "#d4a017", fontSize: 15, cursor: "pointer", fontWeight: 600 }}>✓ อ่านแล้ว</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>}
          </div>
          <button onClick={onLogout} style={{ padding: "6px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>ออกจากระบบ</button>
        </div>
      </header>
      <div style={{ display: "flex", minHeight: "calc(100vh - 64px)" }}>
        <nav style={{ width: sidebarOpen ? 220 : 60, background: "#fff", borderRight: "1px solid #e5e7eb", padding: "20px 0", flexShrink: 0, transition: "width 0.25s ease", overflow: "hidden" }}>
          {[{ key: "dashboard", label: "แดชบอร์ด", icon: <I.Chart />, role: "all" }, { key: "customers", label: "ลูกค้า", icon: <I.Users />, role: "all" }, { key: "employees", label: "พนักงาน", icon: <I.User />, role: "admin" }, { key: "trash", label: "ข้อมูลที่ลบแล้ว (" + (currentUser?.role === "admin" ? trash.length : trash.filter((t) => currentUser?.role === "supervisor" ? (isMe(t.supervisor) || isMe(t.assigned_to) || isMe(t.deleted_by)) : (isMe(t.assigned_to) || isMe(t.deleted_by))).length) + ")", icon: <I.Trash2 />, role: "all" }, { key: "settings", label: "ตั้งค่าระบบ", icon: <I.Settings />, role: "admin" }].filter((item) => item.role === "all" || currentUser?.role === "admin").map((item) => (
            <button key={item.key} onClick={() => { setTab(item.key); setSearch(""); setSelectedRows([]); setAdvFilters([]); setEmpFilter([]); setToolbarTab(null); setAssignSelected([]); setPromoFilter(""); setPage(1); }}
              title={item.label}
              style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: sidebarOpen ? "12px 24px" : "12px 18px", border: "none", background: tab === item.key ? "linear-gradient(90deg, #fffbeb, #fef3c7)" : "transparent", color: tab === item.key ? "#92400e" : "#6b7280", fontWeight: tab === item.key ? 600 : 400, fontSize: 14, cursor: "pointer", textAlign: "left", borderRight: tab === item.key ? "3px solid #d4a017" : "3px solid transparent", whiteSpace: "nowrap" }}>
              <span style={{ flexShrink: 0 }}>{item.icon}</span> {sidebarOpen && item.label}
            </button>))}
        </nav>
        <main style={{ flex: 1, padding: 28, overflowY: tab === "customers" ? "hidden" : "auto", overflowX: "hidden" }}>

          {/* DASHBOARD */}
          {tab === "dashboard" && (() => {
            const maxVal = Math.max(...stats.map((s) => s.v), 1);
            // Daily call stats - count customers where status != not_called, grouped by call_date
            const dailyCalls = {};
            myCustomers.forEach((c) => {
              if (c.status !== "not_called" && c.call_date) {
                const d = c.call_date.slice(0, 10);
                if (!dailyCalls[d]) dailyCalls[d] = { total: 0, byEmp: {} };
                dailyCalls[d].total++;
                // Count by status
                const stLabel = statuses.find((s) => s.key === c.status)?.label || c.status;
                if (!dailyCalls[d][stLabel]) dailyCalls[d][stLabel] = 0;
                dailyCalls[d][stLabel]++;
                // Count by employee
                const emp = c.assigned_to || "ไม่ระบุ";
                if (!dailyCalls[d].byEmp[emp]) dailyCalls[d].byEmp[emp] = 0;
                dailyCalls[d].byEmp[emp]++;
              }
            });
            const dailyKeys = Object.keys(dailyCalls).sort((a, b) => b.localeCompare(a)).slice(0, 14);
            const maxDaily = Math.max(...dailyKeys.map((k) => dailyCalls[k].total), 1);
            return <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#3d2a0a", margin: 0 }}>แดชบอร์ด</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 15, color: "#22c55e", fontWeight: 600 }}>⚡ เรียลทาม</span>
                <button onClick={() => fetchAll()} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 14px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", color: "#d4a017", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>🔄 รีเฟรช</button>
              </div>
            </div>
            {/* Summary cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginBottom: 28 }}>
              {stats.map((s, i) => <div key={i} style={{ background: "#fff", borderRadius: 14, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", borderLeft: "4px solid " + s.c }}><div style={{ fontSize: 14, color: "#6b7280", marginBottom: 6 }}>{s.l}</div><div style={{ fontSize: 28, fontWeight: 700, color: s.c }}>{s.v}</div></div>)}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
              {/* Bar chart - สถานะ */}
              <div style={{ background: "#fff", borderRadius: 14, padding: 28, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#3d2a0a", marginBottom: 24 }}>สถานะลูกค้า</h3>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 220, padding: "0 10px" }}>
                  {stats.filter((_, i) => i > 0).map((s, i) => {
                    const pct = (s.v / maxVal) * 100;
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: s.c }}>{s.v}</span>
                        <div style={{ width: "100%", maxWidth: 50, borderRadius: "8px 8px 0 0", background: s.c, height: `${Math.max(pct, 5)}%`, transition: "height 0.5s ease", minHeight: 8 }} />
                        <span style={{ fontSize: 14, color: "#6b7280", textAlign: "center", fontWeight: 600, lineHeight: 1.2 }}>{s.l}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Daily calls chart */}
              <div style={{ background: "#fff", borderRadius: 14, padding: 28, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#3d2a0a", marginBottom: 24 }}>โทรรายวัน (สถานะ ≠ ยังไม่ได้โทร)</h3>
                {dailyKeys.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#9ca3af", padding: 40 }}>ยังไม่มีข้อมูลการโทร</div>
                ) : (
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 220, padding: "0 4px" }}>
                    {dailyKeys.reverse().map((d) => {
                      const pct = (dailyCalls[d].total / maxDaily) * 100;
                      const dateStr = (() => { try { const dt = new Date(d + "T00:00:00"); return dt.toLocaleDateString("th-TH", { day: "2-digit", month: "short" }); } catch { return d; } })();
                      return (
                        <div key={d} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#d4a017" }}>{dailyCalls[d].total}</span>
                          <div style={{ width: "100%", maxWidth: 40, borderRadius: "8px 8px 0 0", background: "linear-gradient(180deg, #2563eb, #38bdf8)", height: `${Math.max(pct, 5)}%`, transition: "height 0.5s ease", minHeight: 8, cursor: "pointer", position: "relative" }}
                            title={Object.entries(dailyCalls[d]).filter(([k]) => k !== "total").map(([k, v]) => k + ": " + v).join(", ")} />
                          <span style={{ fontSize: 9, color: "#6b7280", textAlign: "center", fontWeight: 600, lineHeight: 1.1 }}>{dateStr}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Daily detail table */}
            {dailyKeys.length > 0 && <div style={{ background: "#fff", borderRadius: 14, padding: 28, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "#3d2a0a", marginBottom: 16 }}>สรุปรายวัน</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
                  <thead><tr style={{ background: "#f8fafc", borderBottom: "2px solid #e5e7eb" }}>
                    <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#374151" }}>วันที่โทร</th>
                    <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, color: "#d4a017" }}>โทรแล้ว</th>
                    {statuses.filter((s) => s.key !== "not_called").map((s) => <th key={s.id} style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, color: s.color }}>{s.label}</th>)}
                    <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#92400e" }}>พนักงาน</th>
                  </tr></thead>
                  <tbody>
                    {[...dailyKeys].reverse().map((d, idx) => {
                      const dateStr = (() => { try { return new Date(d + "T00:00:00").toLocaleDateString("th-TH", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }); } catch { return d; } })();
                      return <tr key={d} style={{ borderBottom: "1px solid #f3f4f6", background: idx === 0 ? "#fffbeb" : "transparent" }}>
                        <td style={{ padding: "10px 14px", fontWeight: idx === 0 ? 700 : 400, color: idx === 0 ? "#1e40af" : "#374151" }}>{dateStr} {idx === 0 && <span style={{ background: "#d4a017", color: "#fff", padding: "2px 8px", borderRadius: 10, fontSize: 14, fontWeight: 700, marginLeft: 6 }}>ล่าสุด</span>}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, color: "#d4a017", fontSize: 16 }}>{dailyCalls[d].total}</td>
                        {statuses.filter((s) => s.key !== "not_called").map((s) => <td key={s.id} style={{ padding: "10px 14px", textAlign: "center" }}>{dailyCalls[d][s.label] ? <span style={{ padding: "3px 10px", borderRadius: 8, fontSize: 14, fontWeight: 700, color: "#fff", background: s.color }}>{dailyCalls[d][s.label]}</span> : <span style={{ color: "#d1d5db" }}>—</span>}</td>)}
                        <td style={{ padding: "10px 14px", fontSize: 14 }}>{Object.entries(dailyCalls[d].byEmp || {}).sort((a, b) => b[1] - a[1]).map(([name, cnt]) => <span key={name} style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, background: "#fef3c7", color: "#92400e", fontWeight: 600, fontSize: 15, marginRight: 4, marginBottom: 2 }}>{name} ({cnt})</span>)}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </div>}
          </div>;
          })()}

          {/* CUSTOMERS — SINGLE BIG TABLE with call columns */}
          {tab === "customers" && <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#3d2a0a", margin: 0 }}>ลูกค้า ({fc.length})</h2>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {selectedRows.length > 0 && currentUser?.role === "admin" && <>
                  <button onClick={() => setQuickUpdate({ fields: [], fieldValues: {} })} style={{ ...bo, border: "2px solid #d4a017", background: "#fffbeb", color: "#d4a017" }}><I.Edit /> อัปเดตด่วน ({selectedRows.length})</button>
                  <button onClick={handleBulkDelete} style={bd}><I.Trash /> ลบ {selectedRows.length}</button>
                </>}
                <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" onChange={handleImport} style={{ display: "none" }} />
                <button onClick={() => fileRef.current?.click()} style={bo}><I.Upload /> Import</button>
                <a href={import.meta.env.BASE_URL + "ตัวอย่าง_import_ลูกค้า.csv"} download style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 10, border: "2px dashed #d1d5db", background: "#fff", color: "#6b7280", fontWeight: 500, fontSize: 15, cursor: "pointer", textDecoration: "none" }}><I.FileDown /> ไฟล์ตัวอย่าง</a>
                <button onClick={handleExport} style={bo}><I.Download /> Export</button>
                <button onClick={() => setQuickAddRows([{ name: "", phone: "", note: "", previous_promo: "", assigned_to: "" }])} style={{ ...bp, background: "linear-gradient(135deg, #059669, #047857)" }}><I.Plus /> เพิ่มด่วน</button>
                <button onClick={() => setModal({ type: "customer", mode: "add", data: { status: "not_called" } })} style={bp}><I.Plus /> เพิ่มลูกค้า</button>
              </div>
            </div>
            {/* TOOLBAR */}
            <div style={{ background: "#fff", borderRadius: "14px 14px 0 0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", marginBottom: 0 }}>
              {/* PROMO PRICE QUICK FILTER */}
              {(() => {
                const extractPrice = (promo) => { const m = String(promo || "").match(/\((\d+)\)/); return m ? m[1] : null; };
                const myC = currentUser?.role === "employee" ? customers.filter((c) => isMe(c.assigned_to) || isMe(c.assigned_email)) : currentUser?.role === "supervisor" ? customers.filter((c) => isMe(c.supervisor) || isMe(c.assigned_to) || isMe(c.assigned_email)) : customers;
                const allPrices = [...new Set(myC.map((c) => extractPrice(c.previous_promo)).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
                if (allPrices.length === 0) return null;
                return <div style={{ display: "flex", gap: 8, padding: "10px 20px", borderBottom: "1px solid #e5e7eb", alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#6b7280" }}>โปร:</span>
                  <button onClick={() => setPromoFilter("")} style={{ padding: "4px 14px", borderRadius: 8, border: !promoFilter ? "2px solid #ea580c" : "1px solid #e5e7eb", background: !promoFilter ? "#fff7ed" : "#fff", color: !promoFilter ? "#ea580c" : "#6b7280", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>ทั้งหมด ({myC.length})</button>
                  {allPrices.map((p) => {
                    const count = myC.filter((c) => extractPrice(c.previous_promo) === p).length;
                    return <button key={p} onClick={() => setPromoFilter(promoFilter === p ? "" : p)} style={{ padding: "4px 14px", borderRadius: 8, border: promoFilter === p ? "2px solid #ea580c" : "1px solid #e5e7eb", background: promoFilter === p ? "#fff7ed" : "#fff", color: promoFilter === p ? "#ea580c" : "#6b7280", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{p} <span style={{ color: "#9ca3af", fontSize: 15 }}>({count})</span></button>;
                  })}
                </div>;
              })()}
              <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e5e7eb", overflowX: "auto" }}>
                {[
                  { key: "filter", label: "ตัวกรอง", icon: "▼" },
                  ...(currentUser?.role === "admin" || currentUser?.role === "supervisor" ? [{ key: "employee", label: "พนักงาน", icon: "👤" }] : []),
                  ...(currentUser?.role === "admin" || currentUser?.role === "supervisor" ? [{ key: "columns", label: "สลับคอลัมน์", icon: "⇄" }] : []),
                ].map((t) => (
                  <button key={t.key} onClick={() => setToolbarTab(toolbarTab === t.key ? null : t.key)}
                    style={{ padding: "10px 20px", border: "none", background: toolbarTab === t.key ? "#d4a017" : "transparent", color: toolbarTab === t.key ? "#fff" : "#6b7280", fontWeight: 600, fontSize: 15, cursor: "pointer", whiteSpace: "nowrap", borderRadius: toolbarTab === t.key ? "8px 8px 0 0" : 0, display: "flex", alignItems: "center", gap: 6 }}>
                    {t.icon} {t.label}
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                <div style={{ padding: "6px 12px", display: "flex", alignItems: "center" }}>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }}><I.Search /></span>
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา..." style={{ padding: "7px 12px 7px 34px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 15, outline: "none", width: 180 }} />
                  </div>
                </div>
              </div>

              {/* FILTER PANEL */}
              {toolbarTab === "filter" && (<>
                <div onClick={() => { setToolbarTab(null); setFilterFieldOpen(null); setFilterOpOpen(null); }} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", top: 4, left: 20, background: "#fff", borderRadius: 14, boxShadow: "0 8px 30px rgba(0,0,0,0.18)", border: "1px solid #e5e7eb", width: 620, zIndex: 100, animation: "fadeIn .15s" }}>
                    <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #f3f4f6" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#374151" }}>กรอง</span>
                          <span style={{ fontSize: 15, color: "#9ca3af" }}>ตรงตามเงื่อนไขทั้งหมด ▾</span>
                        </div>
                        <button onClick={() => { setToolbarTab(null); setFilterFieldOpen(null); setFilterOpOpen(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 18 }}>✕</button>
                      </div>
                    </div>
                    <div style={{ padding: "12px 16px" }}>
                      {(() => {
                        const FIELD_ICONS = { name: { icon: "T", bg: "#8b5cf6" }, phone: { icon: "📞", bg: "#3b82f6" }, note: { icon: "📍", bg: "#f59e0b" }, previous_promo: { icon: "🏷", bg: "#ec4899" }, order_date: { icon: "📅", bg: "#ef4444" }, received_product: { icon: "📦", bg: "#22c55e" }, status: { icon: "⚡", bg: "#f97316" }, call_subject: { icon: "📋", bg: "#06b6d4" }, call_date: { icon: "📅", bg: "#8b5cf6" }, call_note: { icon: "📝", bg: "#6366f1" }, customer_relation: { icon: "⭐", bg: "#eab308" }, next_follow: { icon: "📅", bg: "#14b8a6" }, product_price: { icon: "💰", bg: "#22c55e" }, assigned_to: { icon: "👤", bg: "#ef4444" }, nickname: { icon: "😊", bg: "#ec4899" }, created_at: { icon: "📅", bg: "#6366f1" } };
                        const OP_LABELS = { contains: "เป็นของ", eq: "คือ", neq: "ไม่ใช่", has_value: "มีค่า", empty: "ไม่มีค่า", range: "ระยะเวลา", not_range: "ไม่อยู่ในช่วงเวลา", gte: "ตั้งแต่", lte: "ถึง" };
                        const DATE_FIELDS = ["call_date", "next_follow", "order_date", "created_at"];
                        return advFilters.map((af, idx) => {
                          const isDateField = DATE_FIELDS.includes(af.field);
                          const prevAf = idx > 0 ? advFilters[idx - 1] : null;
                          const sameField = prevAf && prevAf.field && af.field && prevAf.field === af.field;
                          const fi = FIELD_ICONS[af.field] || { icon: "⬡", bg: "#9ca3af" };
                          return (<div key={idx}>
                            {idx > 0 && <div style={{ textAlign: "center", margin: "2px 0", fontSize: 13, fontWeight: 700, color: sameField ? "#059669" : "#d4a017" }}>{sameField ? "หรือ" : "และ"}</div>}
                            <div style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
                              {/* FIELD SELECTOR PILL */}
                              <div style={{ position: "relative" }}>
                                <button onClick={(e) => { e.stopPropagation(); setFilterFieldOpen(filterFieldOpen === idx ? null : idx); setFilterOpOpen(null); setFilterFieldSearch(""); }}
                                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 20, border: "1px solid #e5e7eb", background: af.field ? "#f0fdf4" : "#f9fafb", cursor: "pointer", fontSize: 13, fontWeight: 600, color: af.field ? "#374151" : "#9ca3af", whiteSpace: "nowrap" }}>
                                  {af.field ? (<><span style={{ width: 22, height: 22, borderRadius: 6, background: fi.bg, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff" }}>{fi.icon}</span> {COL_DEFS[af.field]?.label}</>) : "เลือกฟิลด์"}
                                  <span style={{ fontSize: 10, color: "#9ca3af" }}>▼</span>
                                </button>
                                {/* FIELD POPUP */}
                                {filterFieldOpen === idx && (<>
                                  <div onClick={() => setFilterFieldOpen(null)} style={{ position: "fixed", inset: 0, zIndex: 109 }} />
                                  <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: "#fff", borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.18)", border: "1px solid #e5e7eb", width: 240, zIndex: 110, maxHeight: 360, overflow: "hidden" }}>
                                    <div style={{ padding: "10px 12px 8px" }}>
                                      <div style={{ position: "relative" }}>
                                        <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: 14 }}>🔍</span>
                                        <input value={filterFieldSearch} onChange={(e) => setFilterFieldSearch(e.target.value)} placeholder="ค้นหา..." autoFocus
                                          style={{ width: "100%", padding: "8px 10px 8px 30px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                                      </div>
                                    </div>
                                    <div style={{ maxHeight: 280, overflowY: "auto", padding: "0 4px 8px" }}>
                                      {af.field && (<>
                                        <div style={{ padding: "4px 12px", fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>ล่าสุด</div>
                                        {(() => { const fi2 = FIELD_ICONS[af.field] || { icon: "⬡", bg: "#9ca3af" }; return (
                                          <div onClick={() => { setFilterFieldOpen(null); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: "pointer", background: "#e0f2fe", borderRadius: 8, margin: "0 4px 4px" }}>
                                            <span style={{ width: 26, height: 26, borderRadius: 7, background: fi2.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff" }}>{fi2.icon}</span>
                                            <span style={{ fontSize: 14, fontWeight: 600, color: "#1e40af" }}>{COL_DEFS[af.field]?.label}</span>
                                          </div>
                                        ); })()}
                                      </>)}
                                      <div style={{ padding: "4px 12px", fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>สนามที่เหลืออยู่</div>
                                      {Object.entries(COL_DEFS).filter(([k, v]) => k !== af.field && (!filterFieldSearch || v.label.toLowerCase().includes(filterFieldSearch.toLowerCase()) || k.toLowerCase().includes(filterFieldSearch.toLowerCase()))).map(([k, v]) => {
                                        const fi3 = FIELD_ICONS[k] || { icon: "⬡", bg: "#9ca3af" };
                                        return <div key={k} onClick={() => { const nf = [...advFilters]; nf[idx].field = k; nf[idx].value = ""; nf[idx].value2 = ""; if (DATE_FIELDS.includes(k)) { nf[idx].op = "range"; } else { nf[idx].op = "contains"; } setAdvFilters(nf); setFilterFieldOpen(null); }}
                                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: "pointer", borderRadius: 8, margin: "0 4px" }}
                                          onMouseEnter={(e) => e.currentTarget.style.background = "#f3f4f6"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                                          <span style={{ width: 26, height: 26, borderRadius: 7, background: fi3.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff" }}>{fi3.icon}</span>
                                          <span style={{ fontSize: 14, color: "#374151" }}>{v.label}</span>
                                        </div>;
                                      })}
                                    </div>
                                  </div>
                                </>)}
                              </div>

                              {/* OPERATOR SELECTOR PILL */}
                              {af.field && (
                                <div style={{ position: "relative" }}>
                                  <button onClick={(e) => { e.stopPropagation(); setFilterOpOpen(filterOpOpen === idx ? null : idx); setFilterFieldOpen(null); setFilterOpSearch(""); }}
                                    style={{ display: "flex", alignItems: "center", gap: 4, padding: "7px 12px", borderRadius: 20, border: "1px solid #e5e7eb", background: "#f9fafb", cursor: "pointer", fontSize: 13, color: "#374151", whiteSpace: "nowrap" }}>
                                    {OP_LABELS[af.op] || af.op} <span style={{ fontSize: 10, color: "#9ca3af" }}>▼</span>
                                  </button>
                                  {filterOpOpen === idx && (<>
                                    <div onClick={() => setFilterOpOpen(null)} style={{ position: "fixed", inset: 0, zIndex: 109 }} />
                                    <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: "#fff", borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.18)", border: "1px solid #e5e7eb", width: 220, zIndex: 110, overflow: "hidden" }}>
                                      <div style={{ padding: "10px 12px 8px" }}>
                                        <div style={{ position: "relative" }}>
                                          <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: 14 }}>🔍</span>
                                          <input value={filterOpSearch} onChange={(e) => setFilterOpSearch(e.target.value)} placeholder={OP_LABELS[af.op] || "ค้นหา..."} autoFocus
                                            style={{ width: "100%", padding: "8px 10px 8px 30px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                                        </div>
                                      </div>
                                      <div style={{ maxHeight: 240, overflowY: "auto", padding: "0 0 6px" }}>
                                        {(isDateField ? [
                                          { v: "range", l: "ระยะเวลา" }, { v: "not_range", l: "ไม่อยู่ในช่วงเวลา" }, { v: "eq", l: "คือ" }, { v: "neq", l: "ไม่ใช่" }, { v: "has_value", l: "มีค่า" }, { v: "empty", l: "ไม่มีค่า" }
                                        ] : [
                                          { v: "contains", l: "เป็นของ" }, { v: "neq", l: "ไม่เป็นของ" }, { v: "has_value", l: "มีค่า" }, { v: "empty", l: "ไม่มีค่า" }
                                        ]).filter(o => !filterOpSearch || o.l.includes(filterOpSearch)).map((o) => (
                                          <div key={o.v} onClick={() => { const nf = [...advFilters]; nf[idx].op = o.v; if (o.v === "has_value" || o.v === "empty") { nf[idx].value = ""; } setAdvFilters(nf); setFilterOpOpen(null); }}
                                            style={{ padding: "10px 16px", cursor: "pointer", fontSize: 14, color: af.op === o.v ? "#1d4ed8" : "#374151", background: af.op === o.v ? "#e0f2fe" : "transparent", fontWeight: af.op === o.v ? 600 : 400 }}
                                            onMouseEnter={(e) => { if (af.op !== o.v) e.currentTarget.style.background = "#f3f4f6"; }} onMouseLeave={(e) => { if (af.op !== o.v) e.currentTarget.style.background = "transparent"; }}>
                                            {o.l}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </>)}
                                </div>
                              )}

                              {/* VALUE SELECTOR */}
                              {af.field && af.op !== "empty" && af.op !== "has_value" && (<>
                                {isDateField ? (
                                  (af.op === "range" || af.op === "not_range") ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, padding: "6px 12px", borderRadius: 20, border: "1px solid #e5e7eb", background: "#fff" }}>
                                      <input type="date" value={af.value || ""} onChange={(e) => { const v = e.target.value; setAdvFilters(prev => prev.map((f, i) => i === idx ? { ...f, value: v } : f)); }} style={{ border: "none", outline: "none", fontSize: 13, flex: 1, color: af.value ? "#374151" : "#9ca3af", cursor: "pointer", background: "transparent" }} />
                                      <span style={{ color: "#9ca3af", fontSize: 13 }}>→</span>
                                      <input type="date" value={af.value2 || ""} onChange={(e) => { const v = e.target.value; setAdvFilters(prev => prev.map((f, i) => i === idx ? { ...f, value2: v } : f)); }} style={{ border: "none", outline: "none", fontSize: 13, flex: 1, color: af.value2 ? "#374151" : "#9ca3af", cursor: "pointer", background: "transparent" }} />
                                      {(af.value || af.value2) && <button onClick={() => { const nf = [...advFilters]; nf[idx].value = ""; nf[idx].value2 = ""; setAdvFilters(nf); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 16, padding: 0 }}>×</button>}
                                    </div>
                                  ) : (
                                    <input type="date" value={af.value || ""} onChange={(e) => { const nf = [...advFilters]; nf[idx].value = e.target.value; setAdvFilters(nf); }} style={{ padding: "7px 12px", borderRadius: 20, border: "1px solid #e5e7eb", fontSize: 13, flex: 1, outline: "none", cursor: "pointer", color: af.value ? "#374151" : "#9ca3af" }} />
                                  )
                                ) : af.field === "status" ? (
                                  <select value={af.value} onChange={(e) => { const nf = [...advFilters]; nf[idx].value = e.target.value; setAdvFilters(nf); }} style={{ padding: "7px 12px", borderRadius: 20, border: "1px solid #e5e7eb", fontSize: 13, flex: 1 }}>
                                    <option value="">เลือก</option>{statuses.map((s) => <option key={s.id} value={s.key}>{s.label}</option>)}
                                  </select>
                                ) : af.field === "call_subject" ? (
                                  <select value={af.value} onChange={(e) => { const nf = [...advFilters]; nf[idx].value = e.target.value; setAdvFilters(nf); }} style={{ padding: "7px 12px", borderRadius: 20, border: "1px solid #e5e7eb", fontSize: 13, flex: 1 }}>
                                    <option value="">เลือก</option>{callSubjects.map((s) => <option key={s.id} value={s.label}>{s.label}</option>)}
                                  </select>
                                ) : af.field === "received_product" ? (
                                  <select value={af.value} onChange={(e) => { const nf = [...advFilters]; nf[idx].value = e.target.value; setAdvFilters(nf); }} style={{ padding: "7px 12px", borderRadius: 20, border: "1px solid #e5e7eb", fontSize: 13, flex: 1 }}>
                                    <option value="">เลือก</option><option value="true">ได้รับแล้ว</option><option value="false">รอส่ง</option>
                                  </select>
                                ) : af.field === "customer_relation" ? (
                                  <select value={af.value} onChange={(e) => { const nf = [...advFilters]; nf[idx].value = e.target.value; setAdvFilters(nf); }} style={{ padding: "7px 12px", borderRadius: 20, border: "1px solid #e5e7eb", fontSize: 13, flex: 1 }}>
                                    <option value="">เลือก</option>{[0,1,2,3,4,5].map((n) => <option key={n} value={String(n)}>{n}</option>)}
                                  </select>
                                ) : af.field === "assigned_to" ? (
                                  <select value={af.value} onChange={(e) => { const nf = [...advFilters]; nf[idx].value = e.target.value; setAdvFilters(nf); }} style={{ padding: "7px 12px", borderRadius: 20, border: "1px solid #e5e7eb", fontSize: 13, flex: 1 }}>
                                    <option value="">เลือก</option><option value="__unassigned__">ยังไม่มอบหมาย</option>{employees.map((em) => <option key={em.id} value={em.name}>{em.name}</option>)}
                                  </select>
                                ) : (() => {
                                  const vals = [...new Set(customers.map((c2) => { const v = c2[af.field]; return String(v !== null && v !== undefined ? v : ""); }).filter(Boolean))].sort();
                                  return vals.length > 0 && vals.length <= 500 ? (
                                    <select value={af.value} onChange={(e) => { const nf = [...advFilters]; nf[idx].value = e.target.value; setAdvFilters(nf); }} style={{ padding: "7px 12px", borderRadius: 20, border: "1px solid #e5e7eb", fontSize: 13, flex: 1 }}>
                                      <option value="">เลือก ({vals.length})</option>
                                      {vals.map((v) => <option key={v} value={v}>{v.length > 40 ? v.slice(0, 40) + "..." : v}</option>)}
                                    </select>
                                  ) : (
                                    <input value={af.value} onChange={(e) => { const nf = [...advFilters]; nf[idx].value = e.target.value; setAdvFilters(nf); }} placeholder="ค่า" style={{ padding: "7px 12px", borderRadius: 20, border: "1px solid #e5e7eb", fontSize: 13, flex: 1, outline: "none" }} />
                                  );
                                })()}
                              </>)}

                              {/* DELETE BUTTON */}
                              <button onClick={() => setAdvFilters(advFilters.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 16, padding: "0 4px" }}>×</button>
                            </div>
                          </div>);
                        });
                      })()}
                      <button onClick={() => { setAdvFilters([...advFilters, { field: "", op: "contains", value: "", value2: "" }]); setFilterFieldOpen(advFilters.length); setFilterOpOpen(null); setFilterFieldSearch(""); }} style={{ background: "none", border: "none", color: "#374151", fontSize: 15, cursor: "pointer", padding: "8px 0", display: "flex", alignItems: "center", gap: 4 }}>+ เพิ่มตัวกรอง</button>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderTop: "1px solid #f3f4f6" }}>
                      <button onClick={() => setAdvFilters([])} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 15, cursor: "pointer" }}>ลบทั้งหมด</button>
                      <span style={{ fontSize: 15, color: "#d1d5db" }}>บันทึกเป็นมุมมองใหม่</span>
                    </div>
                    {advFilters.length > 0 && <div style={{ padding: "6px 16px", background: "#fef3c7", fontSize: 11, color: "#92400e", borderTop: "1px solid #fde68a" }}>
                      DEBUG: {advFilters.map((af, i) => `[${i}] field=${af.field} op=${af.op} value="${af.value}" value2="${af.value2}"`).join(" | ")} | ลูกค้าทั้งหมด={customers.length} | ผ่าน filter={fc.length} | มี next_follow={customers.filter(c => c.next_follow && String(c.next_follow).trim()).length}
                    </div>}
                  </div>
                  <div style={{ height: 8 }}></div>
                </div>
              </>)}

              {/* EMPLOYEE FILTER PANEL */}
              {toolbarTab === "employee" && (<>
                <div onClick={() => setToolbarTab(null)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", top: 4, left: 20, background: "#fff", borderRadius: 14, boxShadow: "0 8px 30px rgba(0,0,0,0.18)", border: "1px solid #e5e7eb", width: 320, zIndex: 100, animation: "fadeIn .15s" }}>
                    <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #f3f4f6" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#374151" }}>กรองตามผู้คน</span>
                        <button onClick={() => setToolbarTab(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 18 }}>✕</button>
                      </div>
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: 14 }}>🔍</span>
                        <input value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} placeholder="ค้นหาพนักงาน" style={{ width: "100%", padding: "8px 12px 8px 34px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 15, outline: "none", boxSizing: "border-box" }} />
                      </div>
                    </div>
                    <div style={{ maxHeight: 320, overflowY: "auto", padding: "4px 0" }}>
                      <div onClick={() => setEmpFilter([])}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", cursor: "pointer", background: empFilter.length === 0 ? "#eff6ff" : "transparent" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = empFilter.length === 0 ? "#eff6ff" : "#f8fafc")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = empFilter.length === 0 ? "#eff6ff" : "transparent")}>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>👤</div>
                        <span style={{ fontSize: 15, color: "#374151" }}>บันทึกไม่มีคน</span>
                      </div>
                      {employees.filter((em) => !empSearch || em.name.toLowerCase().includes(empSearch.toLowerCase()) || (em.nickname || "").toLowerCase().includes(empSearch.toLowerCase())).map((em, ei) => {
                        const colors = ["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#ec4899"];
                        const isSelected = empFilter.includes(em.name);
                        return <div key={em.id} onClick={() => setEmpFilter(isSelected ? empFilter.filter((n) => n !== em.name) : [...empFilter, em.name])}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", cursor: "pointer", background: isSelected ? "#eff6ff" : "transparent" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = isSelected ? "#eff6ff" : "#f8fafc")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = isSelected ? "#eff6ff" : "transparent")}>
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: colors[ei % colors.length], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff" }}>{(em.nickname || em.name).slice(0, 1).toUpperCase()}</div>
                          <span style={{ flex: 1, fontSize: 15, color: "#374151", fontWeight: isSelected ? 600 : 400 }}>{em.nickname || em.name}</span>
                          {isSelected && <span style={{ color: "#3b82f6", fontSize: 16 }}>✓✓</span>}
                        </div>;
                      })}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderTop: "1px solid #f3f4f6" }}>
                      <button onClick={() => { setEmpFilter([]); }} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 15, cursor: "pointer" }}>ลบทั้งหมด</button>
                      <button onClick={() => setToolbarTab(null)} style={{ background: "none", border: "none", color: "#3b82f6", fontSize: 15, cursor: "pointer", fontWeight: 600 }}>บันทึกเป็นมุมมองใหม่</button>
                    </div>
                  </div>
                  <div style={{ height: 8 }}></div>
                </div>
              </>)}

              {/* COLUMN REORDER PANEL */}
              {toolbarTab === "columns" && (
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", background: "#f8fafc" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 12 }}>สลับคอลัมน์ <span style={{ color: "#9ca3af", fontWeight: 400 }}>(ลากหรือกดลูกศร)</span></div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                    {activeColOrder.map((key, idx) => (
                      <div key={key}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, background: dragCol === idx ? "linear-gradient(135deg, #d4a017, #b8860b)" : "#fff", border: dragCol === idx ? "2px solid #b8860b" : "2px solid #e5e7eb", fontSize: 15, fontWeight: 700, color: dragCol === idx ? "#fff" : "#3d2a0a", cursor: "grab", transition: "all 0.15s", boxShadow: dragCol === idx ? "0 4px 12px rgba(212,160,23,0.3)" : "none", transform: dragCol === idx ? "scale(1.05)" : "scale(1)" }}
                        draggable
                        onDragStart={(e) => { setDragCol(idx); e.dataTransfer.effectAllowed = "move"; }}
                        onDragEnd={() => setDragCol(null)}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                        onDragEnter={(e) => { e.currentTarget.style.borderColor = "#d4a017"; e.currentTarget.style.background = "#fffbeb"; }}
                        onDragLeave={(e) => { if (dragCol !== idx) { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "#fff"; } }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragCol !== null && dragCol !== idx) {
                            const newOrder = [...activeColOrder];
                            const [item] = newOrder.splice(dragCol, 1);
                            newOrder.splice(idx, 0, item);
                            setColOrder(newOrder);
                          }
                          setDragCol(null);
                          e.currentTarget.style.borderColor = "#e5e7eb";
                          e.currentTarget.style.background = "#fff";
                        }}
                        onMouseEnter={(e) => { if (dragCol === null) { e.currentTarget.style.borderColor = "#d4a017"; e.currentTarget.style.background = "#fffbeb"; } }}
                        onMouseLeave={(e) => { if (dragCol === null) { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "#fff"; } }}>
                        <span style={{ cursor: "grab", fontSize: 14, opacity: 0.5 }}>☰</span>
                        <button onClick={() => { if (idx > 0) { const n = [...activeColOrder]; [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; setColOrder(n); setDragCol(idx - 1); setTimeout(() => setDragCol(null), 400); } }} style={{ background: "none", border: "none", cursor: "pointer", color: dragCol === idx ? "#fff" : (idx > 0 ? "#d4a017" : "#e5e7eb"), fontSize: 16, padding: "2px 4px", fontWeight: 900, transition: "transform 0.1s" }}>◀</button>
                        <span style={{ fontSize: 14 }}>{COL_DEFS[key].label}</span>
                        <button onClick={() => { if (idx < activeColOrder.length - 1) { const n = [...activeColOrder]; [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]]; setColOrder(n); setDragCol(idx + 1); setTimeout(() => setDragCol(null), 400); } }} style={{ background: "none", border: "none", cursor: "pointer", color: dragCol === idx ? "#fff" : (idx < activeColOrder.length - 1 ? "#d4a017" : "#e5e7eb"), fontSize: 16, padding: "2px 4px", fontWeight: 900, transition: "transform 0.1s" }}>▶</button>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setColOrder(DEFAULT_COL_ORDER)} onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.95)"; e.currentTarget.style.background = "#f3f4f6"; }} onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = "#fff"; }} style={{ padding: "8px 20px", borderRadius: 8, border: "2px solid #e5e7eb", background: "#fff", color: "#6b7280", fontSize: 15, fontWeight: 600, cursor: "pointer", transition: "all 0.1s" }}>รีเซ็ต</button>
                    <button onClick={async () => {
                      const settingKey = "col_order_" + (currentUser?.name || "default");
                      await supabase.from("crm_settings").delete().eq("key", settingKey);
                      await supabase.from("crm_settings").insert({ key: settingKey, value: JSON.stringify(activeColOrder) });
                      showToast("บันทึกลำดับคอลัมน์สำเร็จ ✓ (พนักงานในทีมจะเห็นเหมือนกัน)");
                    }} onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.95)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(212,160,23,0.4)"; }} onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; }} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #d4a017, #b8860b)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", transition: "all 0.1s" }}>💾 บันทึก (มีผลกับพนักงาน)</button>
                  </div>
                </div>
              )}
            </div>
            {/* PAGINATION TOP */}
            {<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 20px", background: "#fff", borderRadius: "0 0 0 0", borderBottom: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 15, color: "#6b7280" }}>แสดง</span>
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 15, color: "#3d2a0a", fontWeight: 600, cursor: "pointer" }}>
                  <option value={100}>100</option><option value={300}>300</option><option value={500}>500</option>
                </select>
                <span style={{ fontSize: 15, color: "#6b7280" }}>| {((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, fc.length)} จาก <span style={{ color: "#d4a017", fontWeight: 700 }}>{fc.length}</span> รายการ</span>
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <button onClick={() => setPage(1)} disabled={safePage <= 1} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", fontSize: 14, cursor: safePage <= 1 ? "default" : "pointer", color: safePage <= 1 ? "#d1d5db" : "#374151" }}>«</button>
                <button onClick={() => setPage(safePage - 1)} disabled={safePage <= 1} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", fontSize: 14, cursor: safePage <= 1 ? "default" : "pointer", color: safePage <= 1 ? "#d1d5db" : "#374151" }}>‹</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2).map((p, idx, arr) => (
                  <span key={p}>{idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ padding: "6px 4px", color: "#9ca3af", fontSize: 14 }}>...</span>}
                  <button onClick={() => setPage(p)} style={{ padding: "6px 12px", borderRadius: 6, border: p === safePage ? "2px solid #d4a017" : "1px solid #d1d5db", background: p === safePage ? "#d4a017" : "#fff", color: p === safePage ? "#fff" : "#374151", fontWeight: p === safePage ? 700 : 400, fontSize: 15, cursor: "pointer" }}>{p}</button></span>
                ))}
                <button onClick={() => setPage(safePage + 1)} disabled={safePage >= totalPages} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", fontSize: 14, cursor: safePage >= totalPages ? "default" : "pointer", color: safePage >= totalPages ? "#d1d5db" : "#374151" }}>›</button>
                <button onClick={() => setPage(totalPages)} disabled={safePage >= totalPages} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", fontSize: 14, cursor: safePage >= totalPages ? "default" : "pointer", color: safePage >= totalPages ? "#d1d5db" : "#374151" }}>»</button>
              </div>
            </div>}
            <div style={{ background: "#fff", borderRadius: "0 0 14px 14px", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <div className="crm-scroll" style={{ overflowX: "scroll", overflowY: "auto", height: "calc(100vh - 260px)" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 14, tableLayout: "fixed", width: "max-content", minWidth: "100%" }} className="crm-table">
                  <thead style={{ position: "sticky", top: 0, zIndex: 5 }}><tr style={{ background: "#f8fafc", borderBottom: "2px solid #e5e7eb" }}>
                    <th style={{ padding: "4px 6px", width: 30, fontSize: 14, fontWeight: 700, color: "#9ca3af" }}>#</th>
                    <th style={{ padding: "4px 6px", width: 40 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <input type="checkbox" checked={selectedRows.length > 0} onChange={(e) => setSelectedRows(e.target.checked ? pagedFc.map((c) => c.id) : [])} style={{ accentColor: "#d4a017", width: 13, height: 13 }} />
                        <select onChange={(e) => { if (e.target.value === "page") setSelectedRows(pagedFc.map((c) => c.id)); else if (e.target.value === "all") setSelectedRows(fc.map((c) => c.id)); else setSelectedRows([]); e.target.value = ""; }} style={{ border: "none", background: "none", color: "#d4a017", fontSize: 9, cursor: "pointer", padding: 0, width: 12 }}>
                          <option value="">▾</option>
                          <option value="page">หน้าปัจจุบัน ({pagedFc.length})</option>
                          <option value="all">ทุกหน้า ({fc.length})</option>
                          <option value="none">ยกเลิกทั้งหมด</option>
                        </select>
                      </div>
                    </th>
                    {TH.map((h, i) => <th key={i} style={{ padding: "4px 5px", textAlign: "left", fontWeight: 700, color: "#374151", whiteSpace: "nowrap", width: colWidths[i] || "auto", minWidth: 40, position: "relative", userSelect: "none", fontSize: 14 }}>
                      {h}
                      <div onMouseDown={(e) => { e.preventDefault(); const startX = e.clientX; const th = e.target.parentElement; const startW = th.offsetWidth; const onMove = (ev) => { const diff = ev.clientX - startX; setColWidths((p) => ({ ...p, [i]: Math.max(40, startW + diff) })); }; const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); }; document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp); }} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 4, cursor: "col-resize", background: "transparent" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#d4a01740")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")} />
                    </th>)}
                  </tr></thead>
                  <tbody>
                    {pagedFc.map((c, idx) => (
                      <tr key={c.id} style={{ borderBottom: "1px solid #f0f0f0", height: 22 }} onMouseEnter={(e2) => (e2.currentTarget.style.background = "#fafafa")} onMouseLeave={(e2) => (e2.currentTarget.style.background = "transparent")}>
                        <td style={{ padding: "1px 6px", color: "#b0b0b0", fontSize: 9, textAlign: "center" }}>{(safePage - 1) * PAGE_SIZE + idx + 1}</td>
                        <td style={{ padding: "1px 6px" }}><input type="checkbox" checked={selectedRows.includes(c.id)} onChange={(e) => { if (e.nativeEvent.shiftKey && lastChecked !== null) { const curIdx = pagedFc.findIndex((x) => x.id === c.id); const lastIdx = pagedFc.findIndex((x) => x.id === lastChecked); if (curIdx >= 0 && lastIdx >= 0) { const start = Math.min(curIdx, lastIdx); const end2 = Math.max(curIdx, lastIdx); const rangeIds = pagedFc.slice(start, end2 + 1).map((x) => x.id); setSelectedRows((prev) => [...new Set([...prev, ...rangeIds])]); setLastChecked(c.id); return; } } setLastChecked(c.id); setSelectedRows(e.target.checked ? [...selectedRows, c.id] : selectedRows.filter((r) => r !== c.id)); }} style={{ accentColor: "#d4a017", width: 13, height: 13 }} /></td>
                        {activeColOrder.map((key) => { const col = COL_DEFS[key]; return <td key={key} style={{ padding: "1px 2px", minWidth: col.minW ? col.minW * 0.55 : undefined, maxWidth: col.maxW ? col.maxW * 0.6 : undefined }}>{col.render(c)}</td>; })}
                      </tr>
                    ))}
                    {fc.length === 0 && <tr><td colSpan={TH.length + 3} style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>ไม่พบข้อมูล</td></tr>}
                  </tbody>
                  <tfoot><tr style={{ background: "#fafaf8", borderTop: "2px solid #e5e7eb" }}>
                    <td colSpan={2} style={{ padding: "3px 4px", fontSize: 9, color: "#9ca3af", textAlign: "center" }}>📊</td>
                    {activeColOrder.map((key) => {
                      const values = fc.map((c) => String(c[key] ?? ""));
                      const total = values.length || 1;
                      const counts = {};
                      values.forEach((v) => { const k = v || ""; if (k) counts[k] = (counts[k] || 0) + 1; });
                      const top5 = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
                      const filled = values.filter(v => v).length;
                      const colors = ["#d4a017", "#3b82f6", "#059669", "#ef4444", "#8b5cf6", "#ec4899", "#0891b2", "#6b7280"];
                      const fs = footerStats[key];
                      return <td key={key} style={{ padding: "2px 2px", position: "relative" }}
                        onMouseEnter={(e) => { const popup = e.currentTarget.querySelector(".hist-popup"); if (popup) popup.style.display = "block"; }}
                        onMouseLeave={(e) => { const popup = e.currentTarget.querySelector(".hist-popup"); if (popup) popup.style.display = "none"; }}>
                        {fs ? <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, cursor: "pointer", padding: "0 2px" }} onClick={() => setFooterStats(p => { const modes = [null, "count", "filled", "empty", "unique"]; const cur = modes.indexOf(p[key]); return { ...p, [key]: modes[(cur + 1) % modes.length] }; })}>
                          {{ count: "นับ " + values.length, filled: "เต็ม " + filled, empty: "ว่าง " + (values.length - filled), unique: "เฉพาะ " + new Set(values.filter(Boolean)).size }[fs]}
                        </div> : <div style={{ display: "flex", height: 10, borderRadius: 4, overflow: "hidden", background: "#f3f4f6", cursor: "pointer" }} onClick={() => setFooterStats(p => ({ ...p, [key]: "count" }))}>
                          {top5.map(([label, cnt], ti) => <div key={ti} style={{ width: (cnt / total * 100) + "%", height: "100%", background: colors[ti % colors.length] }} />)}
                        </div>}
                        <div className="hist-popup" style={{ display: "none", position: "absolute", bottom: "100%", left: 0, background: "#fff", borderRadius: 10, boxShadow: "0 8px 30px rgba(0,0,0,0.2)", zIndex: 100, width: 200, overflow: "hidden", fontSize: 14, marginBottom: 4 }}>
                          <div style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb", fontWeight: 700, color: "#3d2a0a", fontSize: 15 }}>
                            📊 นับ {values.length} · เต็ม {filled} · ว่าง {values.length - filled}
                          </div>
                          <div style={{ padding: "6px 12px" }}>
                            {top5.map(([label, cnt], ti) => (
                              <div key={ti} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                <div style={{ width: 65, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#374151" }}>{label}</div>
                                <div style={{ flex: 1, height: 10, background: "#f3f4f6", borderRadius: 5, overflow: "hidden" }}><div style={{ width: (cnt / total * 100) + "%", height: "100%", background: colors[ti % colors.length], borderRadius: 5 }} /></div>
                                <span style={{ fontSize: 14, fontWeight: 600, color: "#374151", minWidth: 24, textAlign: "right" }}>{cnt}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>;
                    })}
                  </tr></tfoot>
                </table>
              </div>
            </div>
          </div>}

          {/* SUPERVISOR */}
          {tab === "supervisor" && (() => {
            // Extract promo prices from previous_promo
            const extractPrice = (promo) => { const m = String(promo || "").match(/\((\d+)\)/); return m ? m[1] : null; };
            const allPrices = [...new Set(customers.map((c) => extractPrice(c.previous_promo)).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
            const promoFilteredSvC = selectedSupervisor ? svC.filter((c) => !promoFilter || extractPrice(c.previous_promo) === promoFilter) : [];
            const promoFilteredUnC = unC.filter((c) => !promoFilter || extractPrice(c.previous_promo) === promoFilter);
            return <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24, color: "#3d2a0a" }}>หัวหน้า / มอบหมาย</h2>
            <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
              {supervisors.map((sv) => { const is2 = selectedSupervisor?.id === sv.id; return (
                <button key={sv.id} onClick={() => { setSelectedSupervisor(is2 ? null : sv); setAssignSelected([]); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderRadius: 14, border: is2 ? "2px solid #d4a017" : "2px solid #e5e7eb", background: is2 ? "#fffbeb" : "#fff", cursor: "pointer" }}>
                  <div style={{ width: 42, height: 42, borderRadius: "50%", background: is2 ? "#2563eb" : "#fde68a", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16, color: is2 ? "#fff" : "#92400e" }}>{sv.name?.charAt(0)}</div>
                  <div style={{ textAlign: "left" }}><div style={{ fontWeight: 700, fontSize: 14 }}>{sv.name}</div><div style={{ fontSize: 14, color: "#6b7280" }}>{sv.department} · {customers.filter((c2) => c2.supervisor === sv.name).length}</div></div>
                </button>); })}
            </div>
            {selectedSupervisor ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>
                <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                  <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <div><h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ลูกค้า — {selectedSupervisor.name}</h3><span style={{ fontSize: 14, color: "#9ca3af" }}>เลือก {assignSelected.length}</span></div>
                      <button onClick={() => setAssignSelected(assignSelected.length ? [] : [...promoFilteredSvC, ...promoFilteredUnC].map((c2) => c2.id))} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", fontSize: 14, cursor: "pointer", color: "#6b7280" }}>{assignSelected.length ? "ยกเลิก" : "เลือกทั้งหมด"}</button>
                    </div>
                    {/* Promo filter */}
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#6b7280" }}>กรองโปร:</span>
                      <button onClick={() => setPromoFilter("")} style={{ padding: "4px 12px", borderRadius: 8, border: !promoFilter ? "2px solid #d4a017" : "1px solid #e5e7eb", background: !promoFilter ? "#fffbeb" : "#fff", color: !promoFilter ? "#2563eb" : "#6b7280", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>ทั้งหมด</button>
                      {allPrices.map((p) => {
                        const count = [...(selectedSupervisor ? svC : []), ...unC].filter((c) => extractPrice(c.previous_promo) === p).length;
                        return <button key={p} onClick={() => setPromoFilter(promoFilter === p ? "" : p)} style={{ padding: "4px 12px", borderRadius: 8, border: promoFilter === p ? "2px solid #ea580c" : "1px solid #e5e7eb", background: promoFilter === p ? "#fff7ed" : "#fff", color: promoFilter === p ? "#ea580c" : "#6b7280", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{p} <span style={{ color: "#9ca3af", fontSize: 15 }}>({count})</span></button>;
                      })}
                    </div>
                  </div>
                  <div style={{ maxHeight: 500, overflowY: "auto" }}>
                    {promoFilteredSvC.length > 0 && <><div style={{ padding: "8px 20px", background: "#f0fdf4", fontSize: 14, fontWeight: 600, color: "#059669" }}>มอบหมายแล้ว ({promoFilteredSvC.length})</div>{promoFilteredSvC.map((c2) => (<label key={c2.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}><input type="checkbox" checked={assignSelected.includes(c2.id)} onChange={(e2) => setAssignSelected(e2.target.checked ? [...assignSelected, c2.id] : assignSelected.filter((r) => r !== c2.id))} style={{ accentColor: "#d4a017", width: 18, height: 18 }} /><div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{c2.name}</div><div style={{ fontSize: 14, color: "#6b7280" }}>{c2.phone} {c2.previous_promo && <span style={{ background: "#fef3c7", color: "#92400e", padding: "1px 6px", borderRadius: 4, fontSize: 14, fontWeight: 600, marginLeft: 4 }}>{extractPrice(c2.previous_promo)}</span>}</div></div>{c2.assigned_to && <span style={{ fontSize: 15, background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>{c2.assigned_to}</span>}</label>))}</>}
                    {promoFilteredUnC.length > 0 && <><div style={{ padding: "8px 20px", background: "#fef3c7", fontSize: 14, fontWeight: 600, color: "#92400e" }}>ยังไม่มอบหมาย ({promoFilteredUnC.length})</div>{promoFilteredUnC.map((c2) => (<label key={c2.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}><input type="checkbox" checked={assignSelected.includes(c2.id)} onChange={(e2) => setAssignSelected(e2.target.checked ? [...assignSelected, c2.id] : assignSelected.filter((r) => r !== c2.id))} style={{ accentColor: "#d4a017", width: 18, height: 18 }} /><div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{c2.name}</div><div style={{ fontSize: 14, color: "#6b7280" }}>{c2.phone} {c2.previous_promo && <span style={{ background: "#fef3c7", color: "#92400e", padding: "1px 6px", borderRadius: 4, fontSize: 14, fontWeight: 600, marginLeft: 4 }}>{extractPrice(c2.previous_promo)}</span>}</div></div></label>))}</>}
                    {promoFilteredSvC.length === 0 && promoFilteredUnC.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>ไม่พบข้อมูล</div>}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ background: "#fff", borderRadius: 14, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                    <h4 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#3d2a0a" }}>มอบหมายให้พนักงาน</h4>
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, maxHeight: 200, overflowY: "auto", marginBottom: 14 }}>
                      {employees.map((em) => (
                        <label key={em.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}
                          onMouseEnter={(e2) => (e2.currentTarget.style.background = "#fffbeb")} onMouseLeave={(e2) => (e2.currentTarget.style.background = "transparent")}>
                          <input type="checkbox" checked={assignEmployees.includes(em.name)} onChange={(e2) => setAssignEmployees(e2.target.checked ? [...assignEmployees, em.name] : assignEmployees.filter((n) => n !== em.name))} style={{ accentColor: "#d4a017", width: 18, height: 18 }} />
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "#92400e" }}>{em.name.slice(0, 1)}</div>
                          <span style={{ fontSize: 14 }}>{em.name}</span>
                        </label>
                      ))}
                    </div>
                    {assignEmployees.length > 1 && assignSelected.length > 0 && (
                      <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 14, color: "#92400e" }}>
                        กระจายเท่ากัน: {assignEmployees.map((name) => name + " (" + Math.floor(assignSelected.length / assignEmployees.length) + (assignEmployees.indexOf(name) < assignSelected.length % assignEmployees.length ? "+1" : "") + ")").join(", ")}
                      </div>
                    )}
                    <button onClick={handleAssign} disabled={!assignSelected.length || !assignEmployees.length} style={{ ...bp, width: "100%", justifyContent: "center", opacity: (!assignSelected.length || !assignEmployees.length) ? 0.5 : 1 }}>มอบหมาย {assignSelected.length} ลูกค้า → {assignEmployees.length} คน</button>
                  </div>
                  <div style={{ background: "#fff", borderRadius: 14, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                    <h4 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#dc2626" }}>ถอนสิทธิ์</h4>
                    <button onClick={handleRevoke} disabled={!assignSelected.length} style={{ ...bd, width: "100%", justifyContent: "center", padding: "10px", opacity: !assignSelected.length ? 0.5 : 1 }}>ถอนสิทธิ์ {assignSelected.length}</button>
                  </div>
                </div>
              </div>
            ) : <div style={{ background: "#fff", borderRadius: 14, padding: 60, textAlign: "center" }}><div style={{ fontSize: 48, opacity: 0.3 }}>👆</div><div style={{ color: "#6b7280" }}>เลือกหัวหน้าด้านบน</div></div>}
          </div>; })()}

          {/* EMPLOYEES */}
          {tab === "employees" && <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#3d2a0a", margin: 0 }}>พนักงาน ({employees.length})</h2>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setMultiEditEmp(employees.map(e2 => ({ ...e2 })))} style={{ ...bp, background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff" }}><I.Edit /> แก้ไขทั้งหมด</button>
                <button onClick={() => setMultiAddEmp([{ name: "", nickname: "", username: "", password: "1234", email: "", role: "employee" }])} style={bp}><I.Plus /> เพิ่มพนักงาน</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
              {employees.map((e2) => (<div key={e2.id} style={{ background: "#fff", borderRadius: 14, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", position: "relative" }}>
                <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 6 }}><button onClick={() => setModal({ type: "employee", mode: "edit", data: { ...e2 } })} style={bi(false)}><I.Edit /></button><button onClick={() => handleDelete("crm_employees", e2.id)} style={bi(true)}><I.Trash /></button></div>
                <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 2 }}>{e2.name}</div>
                {e2.nickname && e2.nickname !== e2.name && <div style={{ fontSize: 14, color: "#92400e", marginBottom: 4 }}>({e2.nickname})</div>}
                <div style={{ fontSize: 15, color: "#6b7280", marginBottom: 8 }}>{e2.role} · {e2.email}</div>
                <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 14, fontWeight: 600, background: "#fef3c7", color: "#92400e" }}>{customers.filter((c2) => { const a = c2.assigned_to; if (!a) return false; if (a === e2.name || a === e2.nickname) return true; const m = (e2.name || "").match(/\(([^)]+)\)/); if (m && a === m[1].trim()) return true; const m2 = (e2.nickname || "").match(/\(([^)]+)\)/); return m2 && a === m2[1].trim(); }).length} ลูกค้า</span>
              </div>))}
            </div>
          </div>}

          {/* SETTINGS */}
          {tab === "settings" && <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24, color: "#3d2a0a" }}>ตั้งค่าระบบ</h2>
            <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "#fff", borderRadius: 12, padding: 4, width: "fit-content", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              {[{ key: "statuses", label: "สถานะ" }, { key: "call_subjects", label: "หัวข้อโทร" }].map((st) => (
                <button key={st.key} onClick={() => setSettingsSubTab(st.key)} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: settingsSubTab === st.key ? "linear-gradient(135deg, #d4a017, #b8860b)" : "transparent", color: settingsSubTab === st.key ? "#fff" : "#6b7280", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{st.label}</button>))}
            </div>
            {settingsSubTab === "statuses" && <div style={{ background: "#fff", borderRadius: 14, padding: 28, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}><h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>สถานะ</h3><button onClick={() => setModal({ type: "status", mode: "add", data: { key: "", label: "", color: "#d4a017" } })} style={bp}><I.Plus /> เพิ่ม</button></div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>{statuses.map((s) => (<div key={s.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}><span style={{ padding: "5px 14px", borderRadius: 8, fontWeight: 700, color: "#fff", background: s.color }}>{s.label}</span><div style={{ display: "flex", gap: 6 }}><button onClick={() => setModal({ type: "status", mode: "edit", data: { ...s } })} style={bi(false)}><I.Edit /></button><button onClick={() => handleDelete("crm_statuses", s.id)} style={bi(true)}><I.Trash /></button></div></div>))}</div>
            </div>}
            {settingsSubTab === "call_subjects" && <div style={{ background: "#fff", borderRadius: 14, padding: 28, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}><h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>หัวข้อโทร</h3><button onClick={() => setModal({ type: "call_subject", mode: "add", data: { label: "", color: "#d4a017" } })} style={bp}><I.Plus /> เพิ่ม</button></div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>{callSubjects.map((s) => (<div key={s.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}><span style={{ padding: "5px 14px", borderRadius: 8, fontWeight: 700, color: "#fff", background: s.color }}>{s.label}</span><div style={{ display: "flex", gap: 6 }}><button onClick={() => setModal({ type: "call_subject", mode: "edit", data: { ...s } })} style={bi(false)}><I.Edit /></button><button onClick={() => handleDelete("crm_call_subjects", s.id)} style={bi(true)}><I.Trash /></button></div></div>))}</div>
            </div>}
            {settingsSubTab === "supervisors" && <div style={{ background: "#fff", borderRadius: 14, padding: 28, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}><h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>หัวหน้า</h3><button onClick={() => setModal({ type: "supervisor", mode: "add", data: {} })} style={bp}><I.Plus /> เพิ่ม</button></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>{supervisors.map((sv) => (<div key={sv.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, position: "relative" }}>
                <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 6 }}><button onClick={() => setModal({ type: "supervisor", mode: "edit", data: { ...sv } })} style={bi(false)}><I.Edit /></button><button onClick={() => handleDelete("crm_supervisors", sv.id)} style={bi(true)}><I.Trash /></button></div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{sv.name}</div><div style={{ fontSize: 15, color: "#6b7280" }}>{sv.department} · {sv.email}</div>
              </div>))}</div>
            </div>}
          </div>}

          {/* TRASH */}
          {tab === "trash" && (() => {
            const myTrash = currentUser?.role === "admin" ? trash : currentUser?.role === "supervisor" ? trash.filter((t) => isMe(t.supervisor) || isMe(t.assigned_to) || isMe(t.deleted_by)) : trash.filter((t) => isMe(t.assigned_to) || isMe(t.deleted_by));
            const filteredTrash = trashSearch ? myTrash.filter((t) => t.phone?.includes(trashSearch) || t.name?.toLowerCase().includes(trashSearch.toLowerCase())) : myTrash;
            return <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#3d2a0a", margin: 0 }}>ข้อมูลที่ลบแล้ว ({filteredTrash.length})</h2>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }}><I.Search /></span>
                  <input value={trashSearch} onChange={(e) => setTrashSearch(e.target.value)} placeholder="ค้นหาเบอร์โทร / ชื่อ..." style={{ padding: "8px 12px 8px 34px", borderRadius: 10, border: "2px solid #e5e7eb", fontSize: 15, outline: "none", width: 220 }} />
                </div>
                {myTrash.length > 0 && currentUser?.role === "admin" && <button onClick={handleEmptyTrash} style={bd}><I.Trash /> ล้างถังขยะทั้งหมด</button>}
              </div>
            </div>
            {filteredTrash.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 14, padding: 60, textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 48, opacity: 0.3, marginBottom: 12 }}>🗑️</div>
                <div style={{ color: "#9ca3af", fontSize: 16 }}>ไม่มีข้อมูลที่ลบ</div>
              </div>
            ) : (
              <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
                    <thead><tr style={{ background: "#fef2f2", borderBottom: "2px solid #fecaca" }}>
                      {["ชื่อ", "เบอร์โทร", "ที่อยู่", "สถานะ", "มอบหมาย", "ลบโดย", "ลบเมื่อ", ""].map((h, i) => <th key={i} style={{ padding: "12px 14px", textAlign: "left", fontWeight: 700, color: "#991b1b", whiteSpace: "nowrap" }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {filteredTrash.map((t) => {
                        const st = statuses.find((s) => s.key === t.status);
                        return (
                          <tr key={t.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                            <td style={{ padding: "12px 14px", fontWeight: 600, color: "#3d2a0a" }}>{t.name}</td>
                            <td style={{ padding: "12px 14px" }}>{t.phone}</td>
                            <td style={{ padding: "12px 14px", color: "#6b7280", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.note || "—"}</td>
                            <td style={{ padding: "12px 14px" }}>{st ? <span style={{ padding: "4px 12px", borderRadius: 8, fontSize: 14, fontWeight: 700, color: "#fff", background: st.color }}>{st.label}</span> : (t.status || "—")}</td>
                            <td style={{ padding: "12px 14px", color: "#6b7280" }}>{t.assigned_to || "—"}</td>
                            <td style={{ padding: "12px 14px", color: "#4b5563", fontWeight: 500 }}>{t.deleted_by || "—"}</td>
                            <td style={{ padding: "12px 14px", color: "#dc2626", fontSize: 14 }}>{t.deleted_at}</td>
                            <td style={{ padding: "12px 14px" }}>
                              <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={() => handleRestore(t.id)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 14px", borderRadius: 8, border: "1px solid #d1fae5", background: "#f0fdf4", color: "#059669", fontWeight: 600, fontSize: 14, cursor: "pointer" }}><I.Restore /> กู้คืน</button>
                                {currentUser?.role === "admin" && <button onClick={() => handlePermanentDelete(t.id)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 14px", borderRadius: 8, border: "1px solid #fee2e2", background: "#fff", color: "#dc2626", fontWeight: 600, fontSize: 14, cursor: "pointer" }}><I.Trash /> ลบถาวร</button>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>;
          })()}

        </main>
      </div>

      {/* MODAL */}
      {modal && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }} onClick={(e) => e.target === e.currentTarget && setModal(null)}>
        <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 600, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid #f3f4f6" }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#3d2a0a" }}>{modal.mode === "add" ? "เพิ่ม" : "แก้ไข"}{{ customer: "ลูกค้า", employee: "พนักงาน", status: "สถานะ", supervisor: "หัวหน้า", call_subject: "หัวข้อโทร" }[modal.type]}</h3>
            <button onClick={() => setModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}><I.X /></button>
          </div>
          <ModalForm modal={modal} setModal={setModal} onSave={handleSave} employees={employees} statuses={statuses} supervisors={supervisors} callSubjects={callSubjects} iS={iS} lS={lS} />
        </div>
      </div>}

      {/* QUICK UPDATE */}
      {quickUpdate && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 20 }} onClick={(e) => e.target === e.currentTarget && setQuickUpdate(null)}>
        <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 700, maxHeight: "90vh", overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "20px 28px", borderBottom: "1px solid #e5e7eb" }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#3d2a0a" }}>อัปเดตด่วน</h3>
            <button onClick={() => setQuickUpdate(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}><I.X /></button>
          </div>
          <div style={{ padding: 28 }}>
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 16px", marginBottom: 24, fontSize: 14, color: "#92400e" }}>ℹ️ ฟิลด์ว่างจะถูกอัปเดตเป็นไม่มีค่า</div>
            <div style={{ marginBottom: 20 }}><label style={{ ...lS, fontSize: 15, fontWeight: 700 }}>เลือกฟิลด์</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "12px 16px", borderRadius: 10, border: "1px solid #e5e7eb", minHeight: 48, alignItems: "center" }}>
                {quickUpdate.fields.map((f) => (<span key={f} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20, background: "#fef3c7", color: "#92400e", fontWeight: 600, fontSize: 15 }}>{{ assigned_to: "มอบหมาย", status: "สถานะ", supervisor: "หัวหน้า", previous_promo: "โปรก่อนหน้า", received_product: "ได้รับสินค้า", call_subject: "หัวข้อโทร", call_date: "วันที่โทร", call_note: "หมายเหตุ", customer_relation: "ความสัมพันธ์ลูกค้า", next_follow: "ครั้งถัดไป", product_price: "โปรสินค้า", order_date: "วันที่สั่งซื้อ", note: "ที่อยู่", name: "ชื่อ", phone: "เบอร์โทร" }[f]}<button onClick={() => setQuickUpdate({ ...quickUpdate, fields: quickUpdate.fields.filter((x) => x !== f) })} style={{ background: "none", border: "none", cursor: "pointer", color: "#92400e", fontWeight: 700, padding: 0 }}>×</button></span>))}
                <select value="" onChange={(e2) => { if (e2.target.value && !quickUpdate.fields.includes(e2.target.value)) setQuickUpdate({ ...quickUpdate, fields: [...quickUpdate.fields, e2.target.value] }); e2.target.value = ""; }} style={{ border: "none", background: "none", fontSize: 14, color: "#6b7280", cursor: "pointer", outline: "none", flex: 1, minWidth: 120 }}>
                  <option value="">+ เพิ่มฟิลด์...</option>
                  {[{ v: "assigned_to", l: "มอบหมาย" }, { v: "status", l: "สถานะ" }, { v: "supervisor", l: "หัวหน้า" }, { v: "previous_promo", l: "โปรก่อนหน้า" }, { v: "received_product", l: "ได้รับสินค้า" }, { v: "call_subject", l: "หัวข้อโทร" }, { v: "call_date", l: "วันที่โทร" }, { v: "call_note", l: "หมายเหตุ" }, { v: "customer_relation", l: "ความสัมพันธ์ลูกค้า" }, { v: "next_follow", l: "ครั้งถัดไป" }, { v: "product_price", l: "โปรสินค้า" }, { v: "order_date", l: "วันที่สั่งซื้อ" }, { v: "note", l: "ที่อยู่" }, { v: "name", l: "ชื่อ" }, { v: "phone", l: "เบอร์โทร" }].filter((o) => !quickUpdate.fields.includes(o.v)).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
            </div>
            {quickUpdate.fields.length > 0 && <div style={{ marginBottom: 24 }}><label style={{ ...lS, fontSize: 15, fontWeight: 700 }}>การตั้งค่า</label>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 40px 1fr", background: "#f8fafc", padding: "12px 20px", fontWeight: 700, fontSize: 15, borderBottom: "1px solid #e5e7eb" }}><span>ฟิลด์</span><span></span><span>ค่า</span></div>
                {quickUpdate.fields.map((f, idx) => (<div key={f} style={{ display: "grid", gridTemplateColumns: "1fr 40px 1fr", padding: "14px 20px", alignItems: "center", borderBottom: idx < quickUpdate.fields.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                  <span style={{ fontSize: 14, color: "#d4a017" }}>{{ assigned_to: "มอบหมาย", status: "สถานะ", supervisor: "หัวหน้า", previous_promo: "โปรก่อนหน้า", received_product: "ได้รับสินค้า", call_subject: "หัวข้อโทร", call_date: "วันที่โทร", call_note: "หมายเหตุ", customer_relation: "ความสัมพันธ์ลูกค้า", next_follow: "ครั้งถัดไป", product_price: "โปรสินค้า", order_date: "วันที่สั่งซื้อ", note: "ที่อยู่", name: "ชื่อ", phone: "เบอร์โทร" }[f]}</span>
                  <span style={{ textAlign: "center", color: "#9ca3af" }}>→</span>
                  <div>
                    {f === "assigned_to" && (() => {
                      const sel = quickUpdate.fieldValues.assigned_to_list || [];
                      const promoMap = quickUpdate.fieldValues.promo_map || {};
                      const assignMode = quickUpdate.fieldValues.assign_mode || "equal"; // "equal" or "promo"
                      // Extract promos from selected customers
                      const selCustomers = customers.filter((c) => selectedRows.includes(c.id));
                      const promoGroups = {};
                      selCustomers.forEach((c) => { const m = String(c.previous_promo || "").match(/\((\d+)\)/); const p = m ? m[1] : "ไม่มีโปร"; if (!promoGroups[p]) promoGroups[p] = 0; promoGroups[p]++; });
                      const promoKeys = Object.keys(promoGroups).sort((a, b) => Number(a) - Number(b));
                      return <div>
                        {/* Employee selection */}
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>เลือกพนักงาน</div>
                        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, maxHeight: 160, overflowY: "auto", marginBottom: 12 }}>
                          {employees.map((em) => (
                            <label key={em.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}>
                              <input type="checkbox" checked={sel.includes(em.name)} onChange={(e2) => {
                                const nv = e2.target.checked ? [...sel, em.name] : sel.filter((n) => n !== em.name);
                                setQuickUpdate({ ...quickUpdate, fieldValues: { ...quickUpdate.fieldValues, assigned_to_list: nv, assigned_to: nv[0] || "" } });
                              }} style={{ accentColor: "#d4a017" }} />
                              <span style={{ fontSize: 15 }}>{em.name}</span>
                            </label>
                          ))}
                        </div>

                        {/* Mode selection */}
                        {sel.length > 0 && <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>วิธีกระจาย</div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => setQuickUpdate({ ...quickUpdate, fieldValues: { ...quickUpdate.fieldValues, assign_mode: "equal" } })} style={{ flex: 1, padding: "8px", borderRadius: 8, border: assignMode === "equal" ? "2px solid #d4a017" : "1px solid #e5e7eb", background: assignMode === "equal" ? "#fffbeb" : "#fff", color: assignMode === "equal" ? "#2563eb" : "#6b7280", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>กระจายเท่ากัน</button>
                            <button onClick={() => setQuickUpdate({ ...quickUpdate, fieldValues: { ...quickUpdate.fieldValues, assign_mode: "promo" } })} style={{ flex: 1, padding: "8px", borderRadius: 8, border: assignMode === "promo" ? "2px solid #ea580c" : "1px solid #e5e7eb", background: assignMode === "promo" ? "#fff7ed" : "#fff", color: assignMode === "promo" ? "#ea580c" : "#6b7280", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>ตามโปรก่อนหน้า</button>
                          </div>
                        </div>}

                        {/* Equal mode summary */}
                        {sel.length > 1 && assignMode === "equal" && <div style={{ background: "#fffbeb", borderRadius: 6, padding: "6px 10px", fontSize: 15, color: "#92400e" }}>กระจายเท่ากัน {selectedRows.length} ลูกค้า → {sel.length} คน</div>}

                        {/* Promo mode mapping */}
                        {sel.length > 0 && assignMode === "promo" && <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>เลือกโปรให้พนักงาน (เลือกได้หลายคน กระจายเท่ากัน)</div>
                          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "140px 30px 1fr", background: "#f8fafc", padding: "8px 12px", fontWeight: 700, fontSize: 14, borderBottom: "1px solid #e5e7eb" }}><span>โปร (จำนวน)</span><span></span><span>พนักงาน</span></div>
                            {promoKeys.map((pk) => {
                              const pkSel = promoMap[pk] || [];
                              return <div key={pk} style={{ display: "grid", gridTemplateColumns: "140px 30px 1fr", padding: "10px 12px", alignItems: "start", borderBottom: "1px solid #f3f4f6" }}>
                                <span style={{ fontSize: 15, paddingTop: 6 }}><span style={{ padding: "2px 8px", borderRadius: 6, background: "#fef3c7", color: "#92400e", fontWeight: 700, fontSize: 14 }}>{pk}</span> <span style={{ color: "#9ca3af", fontSize: 15 }}>({promoGroups[pk]} คน)</span></span>
                                <span style={{ textAlign: "center", color: "#9ca3af", paddingTop: 6 }}>→</span>
                                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                  {sel.map((name) => (
                                    <label key={name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", cursor: "pointer", borderRadius: 6, fontSize: 14 }}
                                      onMouseEnter={(e2) => (e2.currentTarget.style.background = "#fffbeb")} onMouseLeave={(e2) => (e2.currentTarget.style.background = "transparent")}>
                                      <input type="checkbox" checked={pkSel.includes(name)} onChange={(e2) => {
                                        const nv = e2.target.checked ? [...pkSel, name] : pkSel.filter((n) => n !== name);
                                        setQuickUpdate({ ...quickUpdate, fieldValues: { ...quickUpdate.fieldValues, promo_map: { ...promoMap, [pk]: nv } } });
                                      }} style={{ accentColor: "#ea580c", width: 16, height: 16 }} />
                                      <span>{name}</span>
                                    </label>
                                  ))}
                                  {pkSel.length > 1 && <div style={{ fontSize: 14, color: "#ea580c", padding: "2px 8px" }}>กระจาย {promoGroups[pk]} คน → {pkSel.length} คน ({Math.floor(promoGroups[pk] / pkSel.length)}-{Math.ceil(promoGroups[pk] / pkSel.length)} คน/คน)</div>}
                                </div>
                              </div>;
                            })}
                          </div>
                          {Object.values(promoMap).some((v) => v?.length > 0) && <div style={{ background: "#fff7ed", borderRadius: 6, padding: "8px 10px", marginTop: 8, fontSize: 15, color: "#92400e" }}>
                            สรุป: {sel.map((name) => {
                              let count = 0;
                              selCustomers.forEach((c) => { const m = String(c.previous_promo || "").match(/\((\d+)\)/); const p = m ? m[1] : "ไม่มีโปร"; const pkList = promoMap[p] || []; if (pkList.includes(name)) count += Math.ceil(promoGroups[p] / pkList.length); });
                              return count > 0 ? name + " (~" + count + ")" : null;
                            }).filter(Boolean).join(", ")}
                          </div>}
                        </div>}
                      </div>;
                    })()}
                    {f === "status" && <select value={quickUpdate.fieldValues[f] || ""} onChange={(e2) => setQuickUpdate({ ...quickUpdate, fieldValues: { ...quickUpdate.fieldValues, [f]: e2.target.value } })} style={iS}><option value="">เลือก</option>{statuses.map((s) => <option key={s.id} value={s.key}>{s.label}</option>)}</select>}
                    {f === "supervisor" && <select value={quickUpdate.fieldValues[f] || ""} onChange={(e2) => setQuickUpdate({ ...quickUpdate, fieldValues: { ...quickUpdate.fieldValues, [f]: e2.target.value } })} style={iS}><option value="">เลือก</option>{supervisors.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}</select>}
                    {f === "previous_promo" && <input style={iS} value={quickUpdate.fieldValues[f] || ""} onChange={(e2) => setQuickUpdate({ ...quickUpdate, fieldValues: { ...quickUpdate.fieldValues, [f]: e2.target.value } })} />}
                    {f === "received_product" && <select value={quickUpdate.fieldValues[f] || ""} onChange={(e2) => setQuickUpdate({ ...quickUpdate, fieldValues: { ...quickUpdate.fieldValues, [f]: e2.target.value } })} style={iS}><option value="">เลือก</option><option value="true">ได้รับแล้ว</option><option value="false">ยังไม่ได้รับ</option></select>}
                    {f === "call_subject" && <select value={quickUpdate.fieldValues[f] || ""} onChange={(e2) => setQuickUpdate({ ...quickUpdate, fieldValues: { ...quickUpdate.fieldValues, [f]: e2.target.value } })} style={iS}><option value="">เลือก</option>{callSubjects.map((s) => <option key={s.id} value={s.label}>{s.label}</option>)}</select>}
                    {f === "customer_relation" && <select value={quickUpdate.fieldValues[f] || ""} onChange={(e2) => setQuickUpdate({ ...quickUpdate, fieldValues: { ...quickUpdate.fieldValues, [f]: e2.target.value } })} style={iS}><option value="">เลือก</option>{[0,1,2,3,4,5].map((n) => <option key={n} value={String(n)}>{n}</option>)}</select>}
                    {(f === "call_date" || f === "next_follow" || f === "order_date") && <input type="date" style={iS} value={quickUpdate.fieldValues[f] || ""} onChange={(e2) => setQuickUpdate({ ...quickUpdate, fieldValues: { ...quickUpdate.fieldValues, [f]: e2.target.value } })} />}
                    {(f === "call_note" || f === "note" || f === "name" || f === "phone" || f === "product_price") && <input style={iS} value={quickUpdate.fieldValues[f] || ""} onChange={(e2) => setQuickUpdate({ ...quickUpdate, fieldValues: { ...quickUpdate.fieldValues, [f]: e2.target.value } })} placeholder={f === "product_price" ? "ราคา" : ""} />}
                  </div>
                </div>))}
              </div>
            </div>}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>ถูกเลือก <span style={{ background: "#16a34a", color: "#fff", padding: "2px 8px", borderRadius: "50%", fontSize: 14 }}>{selectedRows.length}</span></div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, maxHeight: 180, overflowY: "auto" }}>
                {selectedRows.map((rid, idx) => { const cu = customers.find((c2) => c2.id === rid); return (<div key={rid} style={{ display: "flex", justifyContent: "space-between", padding: "10px 20px", borderBottom: idx < selectedRows.length - 1 ? "1px solid #f3f4f6" : "none" }}><span>{cu?.name} <span style={{ color: "#9ca3af", fontSize: 14 }}>{cu?.phone}</span></span><button onClick={() => setSelectedRows(selectedRows.filter((r) => r !== rid))} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}>🗑</button></div>); })}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={async () => {
                if (!quickUpdate.fields.length) { showToast("เลือกฟิลด์ก่อน", "warning"); return; }
                const total = selectedRows.length;
                setProgress({ current: 0, total, label: "กำลังอัปเดตข้อมูล..." });
                const assignList = quickUpdate.fieldValues.assigned_to_list || [];
                const assignMode = quickUpdate.fieldValues.assign_mode || "equal";
                const promoMap = quickUpdate.fieldValues.promo_map || {};
                if (quickUpdate.fields.includes("assigned_to") && assignMode === "promo" && Object.keys(promoMap).length > 0) {
                  const u2 = {}; quickUpdate.fields.forEach((f) => { if (f !== "assigned_to") { const v = quickUpdate.fieldValues[f]; u2[f] = f === "received_product" ? v === "true" : f === "product_price" ? Number(v) || 0 : f === "customer_relation" ? Number(v) || 0 : (v || ""); } });
                  const promoGroups = {};
                  selectedRows.forEach((rid) => {
                    const c = customers.find((cx) => cx.id === rid);
                    const m = String(c?.previous_promo || "").match(/\((\d+)\)/);
                    const pk = m ? m[1] : "ไม่มีโปร";
                    if (!promoGroups[pk]) promoGroups[pk] = [];
                    promoGroups[pk].push(rid);
                  });
                  // Group by employee for batch
                  const empBatch = {};
                  for (const pk of Object.keys(promoGroups)) {
                    const empList = promoMap[pk] || [];
                    promoGroups[pk].forEach((rid, j) => {
                      const emp = empList.length > 0 ? empList[j % empList.length] : (assignList[0] || "");
                      if (!empBatch[emp]) empBatch[emp] = [];
                      empBatch[emp].push(rid);
                    });
                  }
                  let done = 0;
                  for (const [emp, ids] of Object.entries(empBatch)) {
                    const BATCH = 100;
                    for (let b = 0; b < Math.ceil(ids.length / BATCH); b++) {
                      const batch = ids.slice(b * BATCH, (b + 1) * BATCH);
                      if (emp) { const empObj = employees.find(em => em.name === emp); await supabase.from("crm_customers").update({ ...u2, assigned_to: emp, assigned_email: empObj ? (empObj.email || empObj.username || "") : "" }).in("id", batch); }
                      else await supabase.from("crm_customers").update(u2).in("id", batch);
                      done += batch.length;
                      setProgress({ current: done, total, label: "กำลังอัปเดตข้อมูล..." });
                    }
                  }
                } else if (quickUpdate.fields.includes("assigned_to") && assignList.length > 1) {
                  const u2 = {}; quickUpdate.fields.forEach((f) => { if (f !== "assigned_to") { const v = quickUpdate.fieldValues[f]; u2[f] = f === "received_product" ? v === "true" : f === "product_price" ? Number(v) || 0 : f === "customer_relation" ? Number(v) || 0 : (v || ""); } });
                  // Group by employee
                  const empBatch = {};
                  for (let i = 0; i < total; i++) {
                    const emp = assignList[i % assignList.length];
                    if (!empBatch[emp]) empBatch[emp] = [];
                    empBatch[emp].push(selectedRows[i]);
                  }
                  let done = 0;
                  for (const [emp, ids] of Object.entries(empBatch)) {
                    const BATCH = 100;
                    for (let b = 0; b < Math.ceil(ids.length / BATCH); b++) {
                      const batch = ids.slice(b * BATCH, (b + 1) * BATCH);
                      const empObj2 = employees.find(em => em.name === emp); await supabase.from("crm_customers").update({ ...u2, assigned_to: emp, assigned_email: empObj2 ? (empObj2.email || empObj2.username || "") : "" }).in("id", batch);
                      done += batch.length;
                      setProgress({ current: done, total, label: "กำลังอัปเดตข้อมูล..." });
                    }
                  }
                } else {
                  const u2 = {}; quickUpdate.fields.forEach((f) => { const v = quickUpdate.fieldValues[f]; u2[f] = f === "received_product" ? v === "true" : f === "product_price" ? Number(v) || 0 : f === "customer_relation" ? Number(v) || 0 : f === "assigned_to" ? (assignList[0] || v || "") : (v || ""); });
                  if (u2.assigned_to) { const empObj3 = employees.find(em => em.name === u2.assigned_to); u2.assigned_email = empObj3 ? (empObj3.email || empObj3.username || "") : ""; }
                  const BATCH = 100;
                  for (let b = 0; b < Math.ceil(total / BATCH); b++) {
                    const batch = selectedRows.slice(b * BATCH, (b + 1) * BATCH);
                    await supabase.from("crm_customers").update(u2).in("id", batch);
                    setProgress({ current: Math.min((b + 1) * BATCH, total), total, label: "กำลังอัปเดตข้อมูล..." });
                  }
                }
                setProgress(null);
                throttledFetchAll(); broadcastChange();
                // Send notifications if assigned_to was updated
                if (quickUpdate.fields.includes("assigned_to")) {
                  const assignList2 = quickUpdate.fieldValues.assigned_to_list || [];
                  for (const empName of assignList2) {
                    try { await supabase.from("crm_notifications").insert({ to_user: empName, from_user: currentUser?.name || "admin", message: "อัปเดตลูกค้า " + total + " คนให้คุณ", type: "assign", count: total, read: false, created_at: new Date().toISOString() }); } catch {}
                  }
                }
                setSuccessModal({ count: total, detail: quickUpdate.fields.map((f) => COL_DEFS[f] ? COL_DEFS[f].label : f).join(", ") }); setSelectedRows([]); setQuickUpdate(null);
              }} style={{ ...bp, padding: "12px 32px", fontSize: 16 }}>อัปเดต</button>
            </div>
          </div>
        </div>
      </div>}

      {/* MULTI ADD EMPLOYEE MODAL */}
      {multiAddEmp && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2500, padding: 20 }}>
        <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 700, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 10 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#3d2a0a" }}>เพิ่มพนักงาน ({multiAddEmp.length} คน)</h3>
            <button onClick={() => setMultiAddEmp(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 20 }}>✕</button>
          </div>
          <div style={{ padding: 24 }}>
            {/* Header */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px 100px 120px 100px 40px", gap: 8, marginBottom: 8, fontSize: 14, fontWeight: 700, color: "#6b7280" }}>
              <span>ชื่อจริง</span><span>ชื่อเล่น</span><span>Username</span><span>Password</span><span>อีเมล</span><span>ตำแหน่ง</span><span></span>
            </div>
            {/* Rows */}
            {multiAddEmp.map((emp, idx) => (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px 100px 120px 100px 40px", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <input value={emp.name} onChange={(e) => { const n = [...multiAddEmp]; n[idx].name = e.target.value; setMultiAddEmp(n); }} placeholder="ชื่อจริง" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 15, outline: "none" }} />
                <input value={emp.nickname || ""} onChange={(e) => { const n = [...multiAddEmp]; n[idx].nickname = e.target.value; setMultiAddEmp(n); }} placeholder="ชื่อเล่น" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 15, outline: "none" }} />
                <input value={emp.username} onChange={(e) => { const n = [...multiAddEmp]; n[idx].username = e.target.value; setMultiAddEmp(n); }} placeholder="username" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 15, outline: "none" }} />
                <input value={emp.password} onChange={(e) => { const n = [...multiAddEmp]; n[idx].password = e.target.value; setMultiAddEmp(n); }} placeholder="1234" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 15, outline: "none" }} />
                <input value={emp.email} onChange={(e) => { const n = [...multiAddEmp]; n[idx].email = e.target.value; setMultiAddEmp(n); }} placeholder="email" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 15, outline: "none" }} />
                <select value={emp.role} onChange={(e) => { const n = [...multiAddEmp]; n[idx].role = e.target.value; setMultiAddEmp(n); }} style={{ padding: "8px 6px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, outline: "none" }}>
                  <option value="employee">พนักงาน</option><option value="supervisor">หัวหน้า</option>
                </select>
                <button onClick={() => { if (multiAddEmp.length > 1) setMultiAddEmp(multiAddEmp.filter((_, i) => i !== idx)); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 16, padding: 4 }} title="ลบ">✕</button>
              </div>
            ))}
            {/* Add row button */}
            <button onClick={() => setMultiAddEmp([...multiAddEmp, { name: "", nickname: "", username: "", password: "1234", email: "", role: "employee" }])} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 10, border: "2px dashed #d1d5db", background: "#fff", color: "#6b7280", fontWeight: 600, fontSize: 15, cursor: "pointer", width: "100%", justifyContent: "center", marginTop: 8 }}>
              + เพิ่มอีกคน
            </button>
          </div>
          {/* Footer */}
          <div style={{ padding: "16px 24px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", bottom: 0, background: "#fff" }}>
            <span style={{ fontSize: 15, color: "#9ca3af" }}>รวม {multiAddEmp.filter((e) => e.name.trim()).length} คน</span>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setMultiAddEmp(null)} style={{ padding: "10px 24px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", fontSize: 14, cursor: "pointer", color: "#6b7280" }}>ยกเลิก</button>
              <button onClick={async () => {
                const valid = multiAddEmp.filter((e) => e.name.trim());
                if (!valid.length) { showToast("กรุณากรอกชื่ออย่างน้อย 1 คน", "warning"); return; }
                setProgress({ current: 0, total: valid.length, label: "กำลังเพิ่มพนักงาน..." });
                let ok = 0;
                for (const emp of valid) {
                  const res = await supabase.from("crm_employees").insert({ name: emp.name, nickname: emp.nickname || "", username: emp.username || emp.name, password: emp.password || "1234", email: emp.email, role: emp.role || "employee" });
                  if (!res.error) { ok++; }
                  setProgress({ current: ok, total: valid.length, label: "กำลังเพิ่มพนักงาน..." });
                }
                setProgress(null);
                throttledFetchAll(); broadcastChange();
                showToast("เพิ่ม " + ok + " พนักงานสำเร็จ ✓");
                setMultiAddEmp(null);
              }} style={{ padding: "10px 28px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #d4a017, #b8860b)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>บันทึกทั้งหมด ({multiAddEmp.filter((e) => e.name.trim()).length})</button>
            </div>
          </div>
        </div>
      </div>}

      {/* QUICK ADD CUSTOMERS */}
      {quickAddRows && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2500, padding: 20 }}>
        <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 800, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 10 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#3d2a0a" }}>เพิ่มลูกค้าด่วน ({quickAddRows.length} คน)</h3>
            <button onClick={() => setQuickAddRows(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 20 }}>✕</button>
          </div>
          <div style={{ padding: 24 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 1fr 120px 140px 40px", gap: 8, marginBottom: 8, fontSize: 14, fontWeight: 700, color: "#6b7280" }}>
              <span>ชื่อ</span><span>เบอร์โทร</span><span>ที่อยู่/โน้ต</span><span>โปรก่อนหน้า</span><span>มอบหมาย</span><span></span>
            </div>
            {quickAddRows.map((row, idx) => (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 120px 1fr 120px 140px 40px", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <input value={row.name} onChange={(e) => { const n = [...quickAddRows]; n[idx] = { ...n[idx], name: e.target.value }; setQuickAddRows(n); }} placeholder="ชื่อลูกค้า" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 15, outline: "none" }} />
                <input value={row.phone} onChange={(e) => { const n = [...quickAddRows]; n[idx] = { ...n[idx], phone: e.target.value }; setQuickAddRows(n); }} placeholder="0812345678" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 15, outline: "none" }} />
                <input value={row.note} onChange={(e) => { const n = [...quickAddRows]; n[idx] = { ...n[idx], note: e.target.value }; setQuickAddRows(n); }} placeholder="ที่อยู่ / โน้ต" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 15, outline: "none" }} />
                <input value={row.previous_promo} onChange={(e) => { const n = [...quickAddRows]; n[idx] = { ...n[idx], previous_promo: e.target.value }; setQuickAddRows(n); }} placeholder="โปร" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 15, outline: "none" }} />
                <select value={row.assigned_to} onChange={(e) => { const n = [...quickAddRows]; n[idx] = { ...n[idx], assigned_to: e.target.value }; setQuickAddRows(n); }} style={{ padding: "8px 6px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, outline: "none" }}>
                  <option value="">— ยังไม่มอบหมาย —</option>{employees.map((em) => <option key={em.id} value={em.name}>{em.nickname || em.name}</option>)}
                </select>
                <button onClick={() => { if (quickAddRows.length > 1) setQuickAddRows(quickAddRows.filter((_, i) => i !== idx)); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 16, padding: 4 }} title="ลบ">✕</button>
              </div>
            ))}
            <button onClick={() => setQuickAddRows([...quickAddRows, { name: "", phone: "", note: "", previous_promo: "", assigned_to: "" }])} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 10, border: "2px dashed #d1d5db", background: "#fff", color: "#6b7280", fontWeight: 600, fontSize: 15, cursor: "pointer", width: "100%", justifyContent: "center", marginTop: 8 }}>
              + เพิ่มอีกคน
            </button>
          </div>
          <div style={{ padding: "16px 24px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", bottom: 0, background: "#fff" }}>
            <span style={{ fontSize: 15, color: "#9ca3af" }}>รวม {quickAddRows.filter((r) => r.name.trim() || r.phone.trim()).length} คน</span>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setQuickAddRows(null)} style={{ padding: "10px 24px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", fontSize: 14, cursor: "pointer", color: "#6b7280" }}>ยกเลิก</button>
              <button onClick={async () => {
                const valid = quickAddRows.filter((r) => r.name.trim() || r.phone.trim());
                if (!valid.length) { showToast("กรุณากรอกข้อมูลอย่างน้อย 1 คน", "warning"); return; }
                setProgress({ current: 0, total: valid.length, label: "กำลังเพิ่มลูกค้า..." });
                let ok = 0;
                for (const row of valid) {
                  const emp = employees.find(em => em.name === row.assigned_to);
                  const data = { name: row.name, phone: row.phone, note: row.note, previous_promo: row.previous_promo, assigned_to: row.assigned_to, assigned_email: emp ? (emp.email || emp.username || "") : "", status: "not_called", created_at: new Date().toISOString() };
                  const res = await supabase.from("crm_customers").insert(data);
                  if (!res.error) ok++;
                  setProgress({ current: ok, total: valid.length, label: "กำลังเพิ่มลูกค้า..." });
                }
                setProgress(null);
                throttledFetchAll(); broadcastChange();
                showToast("เพิ่ม " + ok + " ลูกค้าสำเร็จ ✓");
                setQuickAddRows(null);
              }} style={{ padding: "10px 28px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #059669, #047857)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>บันทึกทั้งหมด ({quickAddRows.filter((r) => r.name.trim() || r.phone.trim()).length})</button>
            </div>
          </div>
        </div>
      </div>}

      {/* MULTI EDIT EMPLOYEES */}
      {multiEditEmp && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2500, padding: 20 }}>
        <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 900, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 10 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#3d2a0a" }}>แก้ไขพนักงานทั้งหมด ({multiEditEmp.length} คน)</h3>
            <button onClick={() => setMultiEditEmp(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 20 }}>✕</button>
          </div>
          <div style={{ padding: 24, overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 100px 140px 80px 140px 100px", gap: 8, marginBottom: 8, fontSize: 14, fontWeight: 700, color: "#6b7280", minWidth: 700 }}>
              <span>#</span><span>ชื่อจริง</span><span>ชื่อเล่น</span><span>Username</span><span>Password</span><span>อีเมล</span><span>ตำแหน่ง</span>
            </div>
            {multiEditEmp.map((emp, idx) => (
              <div key={emp.id} style={{ display: "grid", gridTemplateColumns: "40px 1fr 100px 140px 80px 140px 100px", gap: 8, marginBottom: 6, alignItems: "center", minWidth: 700 }}>
                <span style={{ fontSize: 14, color: "#9ca3af" }}>{idx + 1}</span>
                <input value={emp.name || ""} onChange={(e) => { const n = [...multiEditEmp]; n[idx] = { ...n[idx], name: e.target.value }; setMultiEditEmp(n); }} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 15, outline: "none" }} />
                <input value={emp.nickname || ""} onChange={(e) => { const n = [...multiEditEmp]; n[idx] = { ...n[idx], nickname: e.target.value }; setMultiEditEmp(n); }} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 15, outline: "none" }} />
                <input value={emp.username || ""} onChange={(e) => { const n = [...multiEditEmp]; n[idx] = { ...n[idx], username: e.target.value }; setMultiEditEmp(n); }} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 15, outline: "none" }} />
                <input value={emp.password || ""} onChange={(e) => { const n = [...multiEditEmp]; n[idx] = { ...n[idx], password: e.target.value }; setMultiEditEmp(n); }} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 15, outline: "none" }} />
                <input value={emp.email || ""} onChange={(e) => { const n = [...multiEditEmp]; n[idx] = { ...n[idx], email: e.target.value }; setMultiEditEmp(n); }} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 15, outline: "none" }} />
                <select value={emp.role || "employee"} onChange={(e) => { const n = [...multiEditEmp]; n[idx] = { ...n[idx], role: e.target.value }; setMultiEditEmp(n); }} style={{ padding: "7px 6px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, outline: "none" }}>
                  <option value="employee">พนักงาน</option><option value="supervisor">หัวหน้า</option><option value="admin">ผู้ดูแล</option>
                </select>
              </div>
            ))}
          </div>
          <div style={{ padding: "16px 24px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", bottom: 0, background: "#fff" }}>
            <span style={{ fontSize: 15, color: "#9ca3af" }}>แก้ไขแล้วกดบันทึก</span>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setMultiEditEmp(null)} style={{ padding: "10px 24px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", fontSize: 14, cursor: "pointer", color: "#6b7280" }}>ยกเลิก</button>
              <button onClick={async () => {
                const changed = multiEditEmp.filter((emp, idx) => {
                  const orig = employees.find(e2 => e2.id === emp.id);
                  if (!orig) return false;
                  return emp.name !== orig.name || emp.nickname !== orig.nickname || emp.username !== orig.username || emp.password !== orig.password || emp.email !== orig.email || emp.role !== orig.role;
                });
                if (!changed.length) { showToast("ไม่มีข้อมูลที่เปลี่ยนแปลง"); setMultiEditEmp(null); return; }
                setProgress({ current: 0, total: changed.length, label: "กำลังบันทึก..." });
                let ok = 0;
                for (const emp of changed) {
                  const orig = employees.find(e2 => e2.id === emp.id);
                  // อัปเดตพนักงาน
                  await supabase.from("crm_employees").update({ name: emp.name, nickname: emp.nickname, username: emp.username, password: emp.password, email: emp.email, role: emp.role }).eq("id", emp.id);
                  // ถ้าเปลี่ยนชื่อ → อัปเดต assigned_to ในลูกค้า
                  if (orig && emp.name !== orig.name) {
                    const empEmail = orig.email || orig.username || "";
                    if (empEmail) await supabase.from("crm_customers").update({ assigned_to: emp.name }).eq("assigned_email", empEmail);
                    await supabase.from("crm_customers").update({ assigned_to: emp.name, assigned_email: empEmail }).eq("assigned_to", orig.name);
                    const oldNick = orig.name.match(/\(([^)]+)\)/);
                    if (oldNick) await supabase.from("crm_customers").update({ assigned_to: emp.name, assigned_email: empEmail }).eq("assigned_to", oldNick[1].trim());
                  }
                  ok++;
                  setProgress({ current: ok, total: changed.length, label: "กำลังบันทึก..." });
                }
                setProgress(null);
                throttledFetchAll(); broadcastChange();
                showToast("บันทึก " + ok + " พนักงานสำเร็จ ✓");
                setMultiEditEmp(null);
              }} style={{ padding: "10px 28px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #d4a017, #b8860b)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>บันทึกทั้งหมด</button>
            </div>
          </div>
        </div>
      </div>}

      {/* SUCCESS MODAL */}
      {successModal && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3000 }} onClick={() => setSuccessModal(null)}>
        <div style={{ background: "#fff", borderRadius: 20, padding: "40px 50px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxWidth: 400, animation: "fadeIn .2s" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", border: "4px solid #22c55e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", animation: "fadeIn .3s" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#374151", marginBottom: 8 }}>อัพเดทสำเร็จ! {successModal.count} CRM THE MT</div>
          <div style={{ background: "#f0fdf4", borderRadius: 10, padding: "12px 16px", fontSize: 15, color: "#065f46", marginBottom: 20, textAlign: "left" }}>
            {successModal.detail}
          </div>
          <button onClick={() => setSuccessModal(null)} style={{ padding: "10px 40px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #d4a017, #b8860b)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>ตกลง</button>
        </div>
      </div>}

      {toast && <div style={{ position: "fixed", bottom: 24, right: 24, background: toast.type === "warning" ? "#fef3c7" : "#d1fae5", color: toast.type === "warning" ? "#92400e" : "#065f46", padding: "14px 24px", borderRadius: 12, fontWeight: 600, fontSize: 14, boxShadow: "0 8px 30px rgba(0,0,0,0.15)", zIndex: 2000, animation: "slideUp .3s", display: "flex", alignItems: "center", gap: 8 }}>{toast.type === "warning" ? "⚠️" : "✓"} {toast.msg}</div>}

      {/* PROGRESS BAR */}
      {progress && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3000 }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 36, width: "100%", maxWidth: 420, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#3d2a0a", marginBottom: 20 }}>{progress.label}</div>
          <div style={{ background: "#e5e7eb", borderRadius: 10, height: 24, overflow: "hidden", marginBottom: 12 }}>
            <div style={{ height: "100%", borderRadius: 10, background: "linear-gradient(90deg, #d4a017, #f59e0b)", width: Math.round((progress.current / progress.total) * 100) + "%", transition: "width 0.2s ease", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{Math.round((progress.current / progress.total) * 100)}%</span>
            </div>
          </div>
          <div style={{ fontSize: 14, color: "#6b7280" }}>{progress.current} / {progress.total}</div>
        </div>
      </div>}

      {/* IMPORT RESULT MODAL */}
      {importResult && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2500, padding: 20 }} onClick={(e2) => e2.target === e2.currentTarget && setImportResult(null)}>
        <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "80vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#3d2a0a" }}>ผลการนำเข้า</h3>
            <button onClick={() => setImportResult(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}><I.X /></button>
          </div>
          <div style={{ padding: 24 }}>
            {/* Summary */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1, background: "#d1fae5", borderRadius: 12, padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#059669" }}>{importResult.success.length}</div>
                <div style={{ fontSize: 15, color: "#065f46", fontWeight: 600 }}>นำเข้าสำเร็จ</div>
              </div>
              <div style={{ flex: 1, background: "#fef3c7", borderRadius: 12, padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#d97706" }}>{importResult.dupes.length}</div>
                <div style={{ fontSize: 15, color: "#92400e", fontWeight: 600 }}>เบอร์ซ้ำ (ข้าม)</div>
              </div>
              {importResult.failed && importResult.failed.length > 0 && <div style={{ flex: 1, background: "#fee2e2", borderRadius: 12, padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#dc2626" }}>{importResult.failed.length}</div>
                <div style={{ fontSize: 15, color: "#991b1b", fontWeight: 600 }}>ผิดพลาด</div>
              </div>}
            </div>

            {/* Success list */}
            {importResult.success.length > 0 && <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#059669", marginBottom: 8 }}>✓ นำเข้าสำเร็จ ({importResult.success.length})</div>
              <div style={{ border: "1px solid #d1fae5", borderRadius: 10, maxHeight: 150, overflowY: "auto" }}>
                {importResult.success.map((s, i) => (
                  <div key={i} style={{ padding: "8px 14px", borderBottom: i < importResult.success.length - 1 ? "1px solid #f0fdf4" : "none", fontSize: 15, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#059669" }}>✓ {s.name}</span><span style={{ color: "#9ca3af" }}>{s.phone}</span>
                  </div>
                ))}
              </div>
            </div>}

            {/* Dupe list */}
            {importResult.dupes.length > 0 && <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#d97706" }}>⚠️ เบอร์ซ้ำ — ข้ามไม่ได้นำเข้า ({importResult.dupes.length})</div>
                <button onClick={() => {
                  const bom = "\uFEFF";
                  const header = "ชื่อในไฟล์,เบอร์โทร,ซ้ำกับ (ในระบบ)\n";
                  const rows = importResult.dupes.map(d => `"${(d.name||"").replace(/"/g,'""')}","${d.phone||""}","${(d.existingName||"ซ้ำในไฟล์เดียวกัน").replace(/"/g,'""')}"`).join("\n");
                  const blob = new Blob([bom + header + rows], { type: "text/csv;charset=utf-8" });
                  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "รายชื่อซ้ำ_" + new Date().toISOString().slice(0,10) + ".csv"; a.click();
                }} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 12px", borderRadius: 8, border: "1px solid #f59e0b", background: "#fffbeb", color: "#d97706", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  <I.Download size={14} /> ดาวน์โหลด CSV
                </button>
              </div>
              <div style={{ border: "1px solid #fef3c7", borderRadius: 10, maxHeight: 200, overflowY: "auto" }}>
                <div style={{ display: "flex", padding: "6px 14px", background: "#fef9c3", fontSize: 12, fontWeight: 700, color: "#92400e", borderBottom: "1px solid #fde68a" }}>
                  <span style={{ flex: 1 }}>ชื่อในไฟล์</span><span style={{ flex: 1 }}>เบอร์โทร</span><span style={{ flex: 1 }}>ซ้ำกับ (ในระบบ)</span>
                </div>
                {importResult.dupes.map((d, i) => (
                  <div key={i} style={{ display: "flex", padding: "8px 14px", borderBottom: i < importResult.dupes.length - 1 ? "1px solid #fefce8" : "none", fontSize: 14 }}>
                    <span style={{ flex: 1, color: "#92400e" }}>{d.name}</span>
                    <span style={{ flex: 1, color: "#d97706" }}>{d.phone}</span>
                    <span style={{ flex: 1, color: "#b45309", fontWeight: 600 }}>{d.existingName || "ซ้ำในไฟล์เดียวกัน"}</span>
                  </div>
                ))}
              </div>
            </div>}

            {/* Failed list — แสดงเหตุผลที่ insert ไม่สำเร็จ */}
            {importResult.failed && importResult.failed.length > 0 && <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#dc2626", marginBottom: 8 }}>❌ ผิดพลาด — ไม่สามารถบันทึกได้ ({importResult.failed.length})</div>
              <div style={{ border: "1px solid #fee2e2", borderRadius: 10, maxHeight: 200, overflowY: "auto" }}>
                {importResult.failed.map((f, i) => (
                  <div key={i} style={{ padding: "8px 14px", borderBottom: i < importResult.failed.length - 1 ? "1px solid #fef2f2" : "none", fontSize: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#991b1b", fontWeight: 600 }}>✗ {f.name}</span><span style={{ color: "#dc2626" }}>{f.phone}</span>
                    </div>
                    <div style={{ color: "#7f1d1d", fontSize: 12, marginTop: 2, fontFamily: "monospace" }}>{f.reason}</div>
                  </div>
                ))}
              </div>
            </div>}

            {importResult.success.length === 0 && importResult.dupes.length === 0 && (!importResult.failed || importResult.failed.length === 0) && <div style={{ textAlign: "center", color: "#9ca3af", padding: 20 }}>ไม่พบข้อมูล</div>}

            <button onClick={() => setImportResult(null)} style={{ ...bp, width: "100%", justifyContent: "center", marginTop: 8 }}>ตกลง</button>
          </div>
        </div>
      </div>}
      {loading && <div style={{ position: "fixed", inset: 0, background: "rgba(255,255,255,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3000 }}><div style={{ textAlign: "center" }}><div style={{ width: 48, height: 48, border: "4px solid #e5e7eb", borderTop: "4px solid #d4a017", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} /><div style={{ color: "#3d2a0a", fontWeight: 600, fontSize: 16 }}>กำลังโหลดข้อมูล...</div></div></div>}
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}} @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}} @keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}} @keyframes spin{to{transform:rotate(360deg)}} .crm-table th,.crm-table td{border:1px solid #d1d5db} input:focus,select:focus,textarea:focus{outline:none!important;border-color:#d4a017!important;box-shadow:0 0 0 3px rgba(212,160,23,0.15)!important;font-weight:700!important} .crm-scroll{overflow-x:scroll!important;overflow-y:visible} .crm-scroll::-webkit-scrollbar{height:14px;width:10px} .crm-scroll::-webkit-scrollbar-track{background:#f1f1f1;border-radius:7px} .crm-scroll::-webkit-scrollbar-thumb{background:#d4a017;border-radius:7px;border:3px solid #f1f1f1} .crm-scroll::-webkit-scrollbar-thumb:hover{background:#b8860b} .crm-scroll{scrollbar-gutter:stable} .crm-table td{line-height:1.3} .crm-table tr{height:24px} @keyframes bellShake{0%,100%{transform:rotate(0)}25%{transform:rotate(15deg)}50%{transform:rotate(-15deg)}75%{transform:rotate(10deg)}} .bell-shake{animation:bellShake .5s ease 3}`}</style>
    </div>
  );
}

function ModalForm({ modal, setModal, onSave, employees, statuses, supervisors, callSubjects, iS, lS }) {
  const [form, setForm] = useState(modal.data || {});
  const u = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const table = { customer: "crm_customers", employee: "crm_employees", status: "crm_statuses", supervisor: "crm_supervisors", call_subject: "crm_call_subjects" }[modal.type];
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {modal.type === "customer" && <>
          <div style={{ gridColumn: "1/3" }}><label style={lS}>ชื่อ</label><input style={iS} value={form.name || ""} onChange={(e) => u("name", e.target.value)} /></div>
          <div><label style={lS}>เบอร์โทร</label><input style={iS} value={form.phone || ""} onChange={(e) => u("phone", e.target.value)} /></div>
          <div><label style={lS}>สถานะ</label><select style={iS} value={form.status || "not_called"} onChange={(e) => u("status", e.target.value)}>{statuses.map((s) => <option key={s.id} value={s.key}>{s.label}</option>)}</select></div>
          <div style={{ gridColumn: "1/3" }}><label style={lS}>ที่อยู่ (Note)</label><textarea style={{ ...iS, minHeight: 60, resize: "vertical" }} value={form.note || ""} onChange={(e) => u("note", e.target.value)} /></div>
          <div><label style={lS}>โปรก่อนหน้า</label><input style={iS} value={form.previous_promo || ""} onChange={(e) => u("previous_promo", e.target.value)} /></div>
          <div><label style={lS}>วันที่สั่งซื้อ</label><input type="datetime-local" style={iS} value={form.order_date || ""} onChange={(e) => u("order_date", e.target.value)} /></div>
          <div><label style={lS}>หัวหน้า</label><select style={iS} value={form.supervisor || ""} onChange={(e) => u("supervisor", e.target.value)}><option value="">—</option>{supervisors.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}</select></div>
          <div><label style={lS}>มอบหมาย</label><select style={iS} value={form.assigned_to || ""} onChange={(e) => { u("assigned_to", e.target.value); const emp = employees.find(em => em.name === e.target.value); u("assigned_email", emp ? (emp.email || emp.username || "") : ""); }}><option value="">—</option>{employees.map((e2) => <option key={e2.id} value={e2.name}>{e2.name}</option>)}</select></div>
        </>}
        {modal.type === "employee" && <>
          <div><label style={lS}>ชื่อจริง</label><input style={iS} value={form.name || ""} onChange={(e) => u("name", e.target.value)} placeholder="ชื่อ-นามสกุล" /></div>
          <div><label style={lS}>ชื่อเล่น</label><input style={iS} value={form.nickname || ""} onChange={(e) => u("nickname", e.target.value)} placeholder="ชื่อเล่น" /></div>
          <div><label style={lS}>ชื่อผู้ใช้ (Login)</label><input style={iS} value={form.username || ""} onChange={(e) => u("username", e.target.value)} placeholder="username" /></div>
          <div><label style={lS}>รหัสผ่าน</label><input style={iS} value={form.password || ""} onChange={(e) => u("password", e.target.value)} placeholder="password" /></div>
          <div><label style={lS}>อีเมล</label><input style={iS} value={form.email || ""} onChange={(e) => u("email", e.target.value)} /></div>
          <div><label style={lS}>ตำแหน่ง</label><select style={iS} value={form.role || "employee"} onChange={(e) => u("role", e.target.value)}><option value="employee">พนักงาน</option><option value="supervisor">หัวหน้า</option></select></div>
        </>}
        {modal.type === "status" && <>
          <div><label style={lS}>Key</label><input style={iS} value={form.key || ""} onChange={(e) => u("key", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} /></div>
          <div><label style={lS}>Label</label><input style={iS} value={form.label || ""} onChange={(e) => u("label", e.target.value)} /></div>
          <div style={{ gridColumn: "1/3" }}><label style={lS}>สี</label><div style={{ display: "flex", alignItems: "center", gap: 12 }}><input type="color" value={form.color || "#2563eb"} onChange={(e) => u("color", e.target.value)} style={{ width: 50, height: 50, borderRadius: 10, border: "2px solid #e5e7eb", cursor: "pointer", padding: 2 }} /><span style={{ fontSize: 15, color: "#6b7280" }}>{form.color || "#2563eb"}</span></div></div>
          <div style={{ gridColumn: "1/3" }}><span style={{ padding: "6px 16px", borderRadius: 8, fontWeight: 700, color: "#fff", background: form.color || "#6b7280" }}>{form.label || "ตัวอย่าง"}</span></div>
        </>}
        {modal.type === "call_subject" && <>
          <div><label style={lS}>ชื่อหัวข้อ</label><input style={iS} value={form.label || ""} onChange={(e) => u("label", e.target.value)} /></div>
          <div><label style={lS}>สี</label><div style={{ display: "flex", alignItems: "center", gap: 12 }}><input type="color" value={form.color || "#2563eb"} onChange={(e) => u("color", e.target.value)} style={{ width: 44, height: 44, borderRadius: 8, border: "2px solid #e5e7eb", cursor: "pointer", padding: 2 }} /><span style={{ fontSize: 15, color: "#6b7280" }}>{form.color || "#2563eb"}</span></div></div>
          <div style={{ gridColumn: "1/3" }}><span style={{ padding: "5px 14px", borderRadius: 8, fontWeight: 700, color: "#fff", background: form.color || "#6b7280" }}>{form.label || "ตัวอย่าง"}</span></div>
        </>}
        {modal.type === "supervisor" && <>
          <div style={{ gridColumn: "1/3" }}><label style={lS}>ชื่อ</label><input style={iS} value={form.name || ""} onChange={(e) => u("name", e.target.value)} /></div>
          <div><label style={lS}>แผนก</label><input style={iS} value={form.department || ""} onChange={(e) => u("department", e.target.value)} /></div>
          <div><label style={lS}>เบอร์โทร</label><input style={iS} value={form.phone || ""} onChange={(e) => u("phone", e.target.value)} /></div>
          <div style={{ gridColumn: "1/3" }}><label style={lS}>อีเมล</label><input style={iS} value={form.email || ""} onChange={(e) => u("email", e.target.value)} /></div>
        </>}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24, paddingTop: 20, borderTop: "1px solid #f3f4f6" }}>
        <button onClick={() => setModal(null)} style={{ padding: "10px 24px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", fontSize: 14, cursor: "pointer", color: "#6b7280" }}>ยกเลิก</button>
        <button onClick={() => onSave(table, form, modal.mode)} style={{ padding: "10px 28px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #d4a017, #b8860b)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{modal.mode === "add" ? "เพิ่ม" : "บันทึก"}</button>
      </div>
    </div>
  );
}
// v2
