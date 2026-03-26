import { useState, useEffect, useCallback, useRef } from "react";

const SUPABASE_URL = "https://sfwbzcrvesbeymvlsxsu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmd2J6Y3J2ZXNiZXltdmxzeHN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNTMzNTgsImV4cCI6MjA4ODkyOTM1OH0.E4Zvq43f0M29hAZzKg78W9HRpthv0I9U37LDo_0Pyvo";
const USE_DEMO = false;
const supabase = { from: (t) => { const req = async (m, o = {}) => { let u = `${SUPABASE_URL}/rest/v1/${t}`; const h = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json", Prefer: m === "POST" ? "return=representation" : (m === "PATCH" || m === "DELETE") ? "return=representation" : undefined }; Object.keys(h).forEach((k) => h[k] === undefined && delete h[k]); if (o.mf) u += `?${o.mf}`; const r = await fetch(u, { method: m, headers: h, body: o.body ? JSON.stringify(o.body) : undefined }); const d = await r.json(); return r.ok ? { data: d } : { error: d }; }; return { select: () => ({ order: () => ({ then: (r, j) => req("GET").then(r).catch(j) }), then: (r, j) => req("GET").then(r).catch(j) }), insert: (rows) => ({ then: (r, j) => req("POST", { body: [].concat(rows) }).then(r).catch(j) }), update: (v) => ({ eq: (c, val) => ({ then: (r, j) => req("PATCH", { body: v, mf: `${c}=eq.${val}` }).then(r).catch(j) }) }), delete: () => ({ eq: (c, val) => ({ then: (r, j) => req("DELETE", { mf: `${c}=eq.${val}` }).then(r).catch(j) }) }) }; } };

const COLOR_PRESETS = [
  { color: "#059669", bg: "#d1fae5" }, { color: "#d97706", bg: "#fef3c7" }, { color: "#dc2626", bg: "#fee2e2" },
  { color: "#2563eb", bg: "#dbeafe" }, { color: "#7c3aed", bg: "#ede9fe" }, { color: "#db2777", bg: "#fce7f3" },
  { color: "#0891b2", bg: "#cffafe" }, { color: "#6b7280", bg: "#f3f4f6" }, { color: "#ea580c", bg: "#fff7ed" },
  { color: "#16a34a", bg: "#f0fdf4" }, { color: "#334155", bg: "#e2e8f0" }, { color: "#0d9488", bg: "#ccfbf1" },
];
const RATING_COLORS = { 1: "#6b7280", 2: "#2563eb", 3: "#16a34a", 4: "#d97706", 5: "#dc2626" };

// ---- DEMO DATA ----
const DEMO_STATUSES = [
  { id: 1, key: "not_called", label: "ยังไม่ได้โทร", color: "#d97706" },
  { id: 2, key: "not_available", label: "ไม่สะดวกคุย", color: "#ea580c" },
  { id: 3, key: "answered", label: "รับสาย", color: "#16a34a" },
  { id: 4, key: "no_answer", label: "ไม่รับสาย", color: "#dc2626" },
  { id: 5, key: "vvip", label: "Vvip", color: "#2563eb" },
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
        {sel?.badge ? <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700, color: "#fff", background: sel.badge }}>{sel.label}</span> : (sel?.label || label)}
        {open ? <I.ChevUp /> : <I.ChevDown />}
      </button>
      {open && <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, background: "#fff", borderRadius: 14, boxShadow: "0 8px 30px rgba(0,0,0,0.15)", border: "1px solid #e5e7eb", padding: 8, zIndex: 200, minWidth: 200, maxHeight: 360, overflowY: "auto", animation: "fadeIn .15s" }}>
        {options.map((o) => (<button key={o.value} onClick={() => { onChange(o.value); setOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", border: "none", background: value === o.value ? "#f0f7ff" : "transparent", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: value === o.value ? 700 : 400, color: "#1e293b", textAlign: "left" }}
          onMouseEnter={(e) => { if (value !== o.value) e.currentTarget.style.background = "#f8fafc"; }} onMouseLeave={(e) => { if (value !== o.value) e.currentTarget.style.background = "transparent"; }}>
          {o.badge ? <span style={{ padding: "3px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, color: "#fff", background: o.badge }}>{o.label}</span> : o.label}
          {value === o.value && <span style={{ marginLeft: "auto", color: "#2563eb" }}><I.Check /></span>}
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
      <button onClick={() => setOpen(!open)} style={{ padding: "4px 12px", borderRadius: 8, border: "none", background: cur?.color || "#9ca3af", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>{cur?.label || "—"} <I.ChevDown /></button>
      {open && <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "#fff", borderRadius: 14, boxShadow: "0 8px 30px rgba(0,0,0,0.18)", border: "1px solid #e5e7eb", padding: 6, zIndex: 200, minWidth: 170, animation: "fadeIn .15s" }}>
        {statuses.map((s) => (<button key={s.id} onClick={() => { onChange(s.key); setOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", border: "none", background: value === s.key ? "#f0f7ff" : "transparent", borderRadius: 8, cursor: "pointer", textAlign: "left" }}
          onMouseEnter={(e) => { if (value !== s.key) e.currentTarget.style.background = "#f8fafc"; }} onMouseLeave={(e) => { if (value !== s.key) e.currentTarget.style.background = "transparent"; }}>
          <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700, color: "#fff", background: s.color }}>{s.label}</span>
          {value === s.key && <span style={{ marginLeft: "auto", color: "#2563eb" }}><I.Check /></span>}
        </button>))}
      </div>}
    </div>
  );
}

function SubjectDropdown({ value, subjects, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const cur = subjects.find((s) => s.label === value);
  useEffect(() => { const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(!open)} style={{ padding: "4px 12px", borderRadius: 8, border: "none", background: cur?.color || "#9ca3af", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>{value || "เลือก"} <I.ChevDown /></button>
      {open && <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "#fff", borderRadius: 14, boxShadow: "0 8px 30px rgba(0,0,0,0.18)", border: "1px solid #e5e7eb", padding: 6, zIndex: 200, minWidth: 180, maxHeight: 320, overflowY: "auto", animation: "fadeIn .15s" }}>
        {subjects.map((s) => (<button key={s.id} onClick={() => { onChange(s.label); setOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", border: "none", background: value === s.label ? "#f0f7ff" : "transparent", borderRadius: 8, cursor: "pointer", textAlign: "left" }}
          onMouseEnter={(e) => { if (value !== s.label) e.currentTarget.style.background = "#f8fafc"; }} onMouseLeave={(e) => { if (value !== s.label) e.currentTarget.style.background = "transparent"; }}>
          <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700, color: "#fff", background: s.color }}>{s.label}</span>
          {value === s.label && <span style={{ marginLeft: "auto", color: "#2563eb" }}><I.Check /></span>}
        </button>))}
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
      <button onClick={() => setOpen(!open)} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, minWidth: 36, height: 30, borderRadius: 8, border: "none", background: value ? RATING_COLORS[value] : "#e5e7eb", color: value ? "#fff" : "#9ca3af", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
        {value || "—"} <I.ChevDown />
      </button>
      {open && <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "#fff", borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.18)", border: "1px solid #e5e7eb", padding: 6, zIndex: 200, minWidth: 140, animation: "fadeIn .15s" }}>
        {[1,2,3,4,5].map((n) => (
          <button key={n} onClick={() => { onChange(n); setOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 12px", border: "none", background: value === n ? "#f0f7ff" : "transparent", borderRadius: 8, cursor: "pointer", textAlign: "left", fontSize: 13 }}
            onMouseEnter={(e) => { if (value !== n) e.currentTarget.style.background = "#f8fafc"; }} onMouseLeave={(e) => { if (value !== n) e.currentTarget.style.background = "transparent"; }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: RATING_COLORS[n], color: "#fff", fontWeight: 700, fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
            <span style={{ color: "#374151" }}>{{ 1: "น้อยมาก", 2: "น้อย", 3: "ปานกลาง", 4: "ดี", 5: "ดีมาก" }[n]}</span>
            {value === n && <span style={{ marginLeft: "auto", color: "#2563eb" }}><I.Check /></span>}
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
  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);
  const save = () => { setEditing(false); if (val !== (value || "")) onSave(val); };
  const inputType = type === "datetime" ? "datetime-local" : type === "date" ? "date" : "text";
  if (editing) {
    return type === "textarea" ? (
      <textarea ref={ref} value={val} onChange={(e) => setVal(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === "Escape") { setVal(value || ""); setEditing(false); } }}
        style={{ width: "100%", minWidth: 140, minHeight: 50, padding: "5px 8px", borderRadius: 8, border: "2px solid #2563eb", fontSize: 12, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
    ) : (
      <input ref={ref} type={inputType} value={val} onChange={(e) => setVal(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setVal(value || ""); setEditing(false); } }}
        style={{ width: "100%", minWidth: type === "date" || type === "datetime" ? 140 : 80, padding: "5px 8px", borderRadius: 8, border: "2px solid #2563eb", fontSize: 12, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
    );
  }
  let display = value || "—";
  if (type === "datetime" && value) { try { display = new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch {} }
  if (type === "date" && value) { try { display = new Date(value + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch {} }
  return (
    <div onClick={() => setEditing(true)} style={{ cursor: "pointer", padding: "3px 6px", borderRadius: 6, border: "2px solid transparent", minHeight: 20, ...sx }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#bfdbfe"; e.currentTarget.style.background = "#f0f7ff"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "transparent"; }}>
      <span style={{ fontSize: 12, color: value ? "#1e293b" : "#9ca3af" }}>{display}</span>
    </div>
  );
}

// ---- LOGIN ----
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [allUsers, setAllUsers] = useState([{ username: "admin", password: "admin123", name: "Admin", role: "admin" }]);

  useEffect(() => {
    supabase.from("crm_employees").select().then((res) => {
      if (res.data) {
        const empUsers = res.data.map((e) => ({ username: e.username || e.name, password: e.password || "1234", name: e.name, role: "employee" }));
        setAllUsers([{ username: "admin", password: "admin123", name: "Admin", role: "admin" }, ...empUsers]);
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
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f2744 0%, #1e3a5f 50%, #0c4a6e 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Sarabun','Noto Sans Thai',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ width: "100%", maxWidth: 420, padding: 20 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg, #38bdf8, #0ea5e9)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#fff", fontSize: 28, marginBottom: 16, boxShadow: "0 8px 30px rgba(56,189,248,0.3)" }}>C</div>
          <h1 style={{ color: "#fff", fontSize: 28, fontWeight: 700, margin: 0 }}>CRM System</h1>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginTop: 8 }}>ระบบจัดการลูกค้า</p>
        </div>

        {/* Login Card */}
        <div style={{ background: "#fff", borderRadius: 20, padding: "36px 32px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1e3a5f", marginBottom: 28, textAlign: "center" }}>เข้าสู่ระบบ</h2>

          {error && <div style={{ background: "#fee2e2", color: "#dc2626", padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: 14, fontWeight: 600, textAlign: "center", animation: "fadeIn .2s" }}>{error}</div>}

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 8 }}>ชื่อผู้ใช้</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }}>
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username"
                style={{ width: "100%", padding: "12px 14px 12px 44px", borderRadius: 12, border: "2px solid #e5e7eb", fontSize: 15, outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}
                onFocus={(e) => (e.target.style.borderColor = "#2563eb")} onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")} />
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
                onFocus={(e) => (e.target.style.borderColor = "#2563eb")} onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(e); }} />
              <button onClick={() => setShowPass(!showPass)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 0 }}>
                {showPass ? <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                : <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
              </button>
            </div>
          </div>

          <button onClick={handleSubmit}
            style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(37,99,235,0.3)", transition: "transform 0.1s" }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}>
            เข้าสู่ระบบ
          </button>

          {/* Demo accounts */}
          <div style={{ marginTop: 24, padding: "16px", background: "#f8fafc", borderRadius: 12, border: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 10, textAlign: "center" }}>บัญชีทดลอง</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {allUsers.map((u) => (
                <button key={u.username} onClick={() => { setUsername(u.username); setPassword(u.password); }}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", fontSize: 13, color: "#4b5563", textAlign: "left", transition: "background 0.1s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#eff6ff")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <span><strong>{u.name}</strong> ({u.role})</span>
                  <span style={{ color: "#9ca3af", fontSize: 12 }}>{u.username} / {u.password}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

// ---- MAIN WRAPPER ----
export default function AppWrapper() {
  const [user, setUser] = useState(() => {
    try { const s = sessionStorage.getItem("crm_user"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const handleLogin = (u) => { setUser(u); sessionStorage.setItem("crm_user", JSON.stringify(u)); };
  const handleLogout = () => { setUser(null); sessionStorage.removeItem("crm_user"); };
  if (!user) return <LoginScreen onLogin={handleLogin} />;
  return <CRMApp currentUser={user} onLogout={handleLogout} />;
}

// ---- CRM APP ----
function CRMApp({ currentUser, onLogout }) {
  const [tab, setTab] = useState(currentUser?.role === "admin" ? "customers" : "dashboard");
  const [customers, setCustomers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [callSubjects, setCallSubjects] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [assignFilter, setAssignFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [receivedFilter, setReceivedFilter] = useState("all");
  const [relationFilter, setRelationFilter] = useState("all");
  const [settingsSubTab, setSettingsSubTab] = useState("statuses");
  const [selectedSupervisor, setSelectedSupervisor] = useState(null);
  const [assignSelected, setAssignSelected] = useState([]);
  const [assignEmployee, setAssignEmployee] = useState("");
  const [toast, setToast] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [quickUpdate, setQuickUpdate] = useState(null);
  const [trash, setTrash] = useState([]);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef(null);

  // ---- FETCH ALL DATA FROM SUPABASE ----
  const fetchAll = useCallback(async () => {
    try {
      const [c, e, s, cs, sv, tr] = await Promise.all([
        supabase.from("crm_customers").select(),
        supabase.from("crm_employees").select(),
        supabase.from("crm_statuses").select(),
        supabase.from("crm_call_subjects").select(),
        supabase.from("crm_supervisors").select(),
        supabase.from("crm_trash").select(),
      ]);
      if (c.data) setCustomers(c.data);
      if (e.data) setEmployees(e.data);
      if (s.data) setStatuses(s.data);
      if (cs.data) setCallSubjects(cs.data);
      if (sv.data) setSupervisors(sv.data);
      if (tr.data) setTrash(tr.data);
    } catch (err) { console.error("Fetch error:", err); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

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
      await supabase.from(table).update(rest).eq("id", id);
      showToast("บันทึกแล้ว");
    }
    setModal(null);
    await fetchAll();
  };

  // ---- DELETE → MOVE TO TRASH ----
  const handleDelete = async (table, id) => {
    if (!confirm("ต้องการลบ?")) return;
    if (table === "crm_customers") {
      const item = customers.find((c) => c.id === id);
      if (item) {
        const { id: oid, ...rest } = item;
        await supabase.from("crm_trash").insert({ ...rest, original_id: oid, deleted_at: new Date().toISOString(), deleted_by: currentUser?.name || "admin" });
      }
    }
    await supabase.from(table).delete().eq("id", id);
    await fetchAll();
    showToast("ลบแล้ว");
  };

  const handleBulkDelete = async () => {
    if (!selectedRows.length || !confirm("ลบ " + selectedRows.length + " รายการ?")) return;
    for (const rid of selectedRows) {
      const item = customers.find((c) => c.id === rid);
      if (item) {
        const { id: oid, ...rest } = item;
        await supabase.from("crm_trash").insert({ ...rest, original_id: oid, deleted_at: new Date().toISOString(), deleted_by: currentUser?.name || "admin" });
      }
      await supabase.from("crm_customers").delete().eq("id", rid);
    }
    setSelectedRows([]);
    await fetchAll();
    showToast("ลบ " + selectedRows.length + " รายการ");
  };

  // ---- RESTORE FROM TRASH ----
  const handleRestore = async (id) => {
    const item = trash.find((t) => t.id === id);
    if (!item) return;
    const { id: tid, original_id, deleted_at, deleted_by, ...rest } = item;
    await supabase.from("crm_customers").insert(rest);
    await supabase.from("crm_trash").delete().eq("id", tid);
    await fetchAll();
    showToast("กู้คืนแล้ว");
  };

  const handlePermanentDelete = async (id) => {
    if (!confirm("ลบถาวร?")) return;
    await supabase.from("crm_trash").delete().eq("id", id);
    await fetchAll();
  };

  const handleEmptyTrash = async () => {
    if (!confirm("ลบถาวรทั้งหมด " + trash.length + " รายการ?")) return;
    for (const t of trash) await supabase.from("crm_trash").delete().eq("id", t.id);
    await fetchAll();
    showToast("ล้างถังขยะแล้ว");
  };

  // ---- INLINE UPDATE ----
  const upd = async (id, f, v) => {
    setCustomers((p) => p.map((c) => c.id === id ? { ...c, [f]: v } : c));
    await supabase.from("crm_customers").update({ [f]: v }).eq("id", id);
  };

  // ---- IMPORT CSV ----
  const handleImport = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const lines = ev.target.result.split("\n").filter((l) => l.trim());
      if (lines.length < 2) { showToast("ไฟล์ว่าง", "warning"); return; }
      const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, "").toLowerCase());
      const ni = headers.findIndex((h) => h.includes("name") || h.includes("ชื่อ"));
      const pi = headers.findIndex((h) => h.includes("phone") || h.includes("โทร"));
      const noi = headers.findIndex((h) => h.includes("note") || h.includes("ที่อยู่") || h.includes("address"));
      const pri = headers.findIndex((h) => h.includes("promo") || h.includes("โปร"));
      if (ni === -1 && pi === -1) { showToast("ไม่พบ Name/Phone", "warning"); return; }
      const nc = [];
      for (let i = 1; i < lines.length; i++) {
        const v = lines[i].match(/(".*?"|[^",]+)/g)?.map((x) => x.trim().replace(/^"|"$/g, "")) || [];
        const name = ni >= 0 ? v[ni] || "" : ""; const phone = pi >= 0 ? v[pi] || "" : "";
        if (!name && !phone) continue;
        nc.push({ name, phone, note: noi >= 0 ? v[noi] || "" : "", previous_promo: pri >= 0 ? v[pri] || "" : "", status: "not_called" });
      }
      if (nc.length) {
        for (const row of nc) await supabase.from("crm_customers").insert(row);
        await fetchAll();
        showToast("นำเข้า " + nc.length + " ลูกค้า (สถานะ: ยังไม่ได้โทร)");
      } else showToast("ไม่พบข้อมูล", "warning");
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  // ---- SUPERVISOR ASSIGN ----
  const handleAssign = async () => {
    if (!assignSelected.length || !assignEmployee) return;
    for (const rid of assignSelected) {
      await supabase.from("crm_customers").update({ assigned_to: assignEmployee, supervisor: selectedSupervisor?.name || "" }).eq("id", rid);
    }
    await fetchAll();
    showToast("มอบหมาย " + assignSelected.length + " ลูกค้า");
    setAssignSelected([]); setAssignEmployee("");
  };
  const handleRevoke = async () => {
    if (!assignSelected.length || !confirm("ถอนสิทธิ์?")) return;
    for (const rid of assignSelected) {
      await supabase.from("crm_customers").update({ assigned_to: "", supervisor: "" }).eq("id", rid);
    }
    await fetchAll();
    showToast("ถอนสิทธิ์แล้ว", "warning");
    setAssignSelected([]);
  };

  const handleExport = () => {
    const h = ["ชื่อ","เบอร์โทร","ที่อยู่","โปรก่อนหน้า","วันที่สั่งซื้อ","สถานะ","มอบหมาย","หัวหน้า","วันที่โทร","หัวข้อโทร","หมายเหตุ","ความสัมพันธ์","ครั้งถัดไป","เสนอขาย","ราคา"];
    const rows = customers.map((c) => [c.name,c.phone,c.note,c.previous_promo,c.order_date,c.status,c.assigned_to,c.supervisor,c.call_date,c.call_subject,c.call_note,c.customer_relation,c.next_follow,c.offer,c.product_price].map((v) => '"' + String(v||"").replace(/"/g,'""') + '"').join(","));
    const blob = new Blob(["\uFEFF" + [h.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "crm_" + new Date().toISOString().slice(0,10) + ".csv"; a.click();
  };

  const fc = customers.filter((c) => {
    if (currentUser?.role === "employee" && c.assigned_to !== currentUser.name) return false;
    const q = search?.toLowerCase();
    const ms = !search || [c.name, c.phone, c.note, c.previous_promo, c.order_date, c.assigned_to, c.supervisor, c.call_date, c.call_subject, c.call_note, c.offer, c.created_at, String(c.product_price || ""), String(c.customer_relation || "")].some((v) => v?.toLowerCase().includes(q));
    return ms
      && (statusFilter === "all" || c.status === statusFilter)
      && (assignFilter === "all" || (assignFilter === "unassigned" ? !c.assigned_to : c.assigned_to === assignFilter))
      && (subjectFilter === "all" || c.call_subject === subjectFilter)
      && (receivedFilter === "all" || String(c.received_product) === receivedFilter)
      && (relationFilter === "all" || String(c.customer_relation) === relationFilter);
  });

  const myCustomers = currentUser?.role === "employee" ? customers.filter((c) => c.assigned_to === currentUser.name) : customers;
  const stats = [{ l: "ทั้งหมด", v: myCustomers.length, c: "#2563eb" }, ...statuses.map((s) => ({ l: s.label, v: myCustomers.filter((c) => c.status === s.key).length, c: s.color }))];
  const statusOpts = [{ value: "all", label: "ทั้งหมด" }, ...statuses.map((s) => ({ value: s.key, label: s.label, badge: s.color }))];
  const assignOpts = [{ value: "all", label: "ทั้งหมด" }, { value: "unassigned", label: "ยังไม่ได้มอบหมาย" }, ...employees.map((e) => ({ value: e.name, label: e.name }))];
  const subjectOpts = [{ value: "all", label: "ทั้งหมด" }, ...callSubjects.map((s) => ({ value: s.label, label: s.label, badge: s.color }))];
  const receivedOpts = [{ value: "all", label: "ทั้งหมด" }, { value: "true", label: "ได้รับแล้ว" }, { value: "false", label: "รอส่ง" }];
  const relationOpts = [{ value: "all", label: "ทั้งหมด" }, ...[1,2,3,4,5].map((n) => ({ value: String(n), label: n + " - " + {1:"น้อยมาก",2:"น้อย",3:"ปานกลาง",4:"ดี",5:"ดีมาก"}[n] }))];
  const svC = selectedSupervisor ? customers.filter((c) => c.supervisor === selectedSupervisor.name) : [];
  const unC = customers.filter((c) => !c.supervisor && !c.assigned_to);

  const bp = { display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer", boxShadow: "0 2px 8px rgba(37,99,235,0.3)" };
  const bd = { display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: "none", background: "#fee2e2", color: "#dc2626", fontWeight: 600, fontSize: 13, cursor: "pointer" };
  const bi = (d) => ({ padding: "6px 8px", borderRadius: 8, border: "1px solid " + (d ? "#fee2e2" : "#e5e7eb"), background: "#fff", cursor: "pointer", color: d ? "#ef4444" : "#6b7280", display: "flex", alignItems: "center" });
  const bo = { display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: 10, border: "2px solid #e5e7eb", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer" };
  const iS = { width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 14, outline: "none", boxSizing: "border-box" };
  const lS = { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 };

  // Table headers: customer fields + call fields
  const TH = ["ชื่อ","เบอร์โทร","ที่อยู่","โปรก่อนหน้า","วันที่สั่งซื้อ","ได้รับสินค้า","สถานะ","มอบหมาย","วันที่สร้าง","วันที่โทร","หัวข้อโทร","หมายเหตุ","ความสัมพันธ์ลูกค้า","ครั้งถัดไป","เสนอขาย2...","ราคาสินค้า(…",""];

  return (
    <div style={{ fontFamily: "'Sarabun','Noto Sans Thai',sans-serif", background: "#f0f2f5", minHeight: "100vh", color: "#1a1a2e" }}>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <header style={{ background: "linear-gradient(135deg, #1e3a5f, #0f2744)", padding: "0 32px", height: 64, display: "flex", alignItems: "center", gap: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.15)" }}>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}><I.Menu /></button>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #38bdf8, #0ea5e9)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#fff", fontSize: 16 }}>C</div>
        <span style={{ color: "#fff", fontSize: 20, fontWeight: 700 }}>CRM System</span>
        {USE_DEMO && <span style={{ background: "#fbbf24", color: "#78350f", fontSize: 11, padding: "2px 10px", borderRadius: 12, fontWeight: 600 }}>DEMO</span>}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{currentUser?.name} ({currentUser?.role})</span>
          <button onClick={onLogout} style={{ padding: "6px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>ออกจากระบบ</button>
        </div>
      </header>
      <div style={{ display: "flex", minHeight: "calc(100vh - 64px)" }}>
        <nav style={{ width: sidebarOpen ? 220 : 60, background: "#fff", borderRight: "1px solid #e5e7eb", padding: "20px 0", flexShrink: 0, transition: "width 0.25s ease", overflow: "hidden" }}>
          {[{ key: "dashboard", label: "แดชบอร์ด", icon: <I.Chart />, role: "all" }, { key: "customers", label: "ลูกค้า", icon: <I.Users />, role: "all" }, { key: "supervisor", label: "หัวหน้า / มอบหมาย", icon: <I.Shield />, role: "admin" }, { key: "employees", label: "พนักงาน", icon: <I.User />, role: "admin" }, { key: "trash", label: "ข้อมูลที่ลบแล้ว (" + trash.length + ")", icon: <I.Trash2 />, role: "admin" }, { key: "settings", label: "ตั้งค่าระบบ", icon: <I.Settings />, role: "admin" }].filter((item) => item.role === "all" || currentUser?.role === "admin").map((item) => (
            <button key={item.key} onClick={() => { setTab(item.key); setSearch(""); setSelectedRows([]); setStatusFilter("all"); setAssignFilter("all"); setSubjectFilter("all"); setReceivedFilter("all"); setRelationFilter("all"); setAssignSelected([]); }}
              title={item.label}
              style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: sidebarOpen ? "12px 24px" : "12px 18px", border: "none", background: tab === item.key ? "linear-gradient(90deg, #eff6ff, #dbeafe)" : "transparent", color: tab === item.key ? "#1e40af" : "#6b7280", fontWeight: tab === item.key ? 600 : 400, fontSize: 14, cursor: "pointer", textAlign: "left", borderRight: tab === item.key ? "3px solid #2563eb" : "3px solid transparent", whiteSpace: "nowrap" }}>
              <span style={{ flexShrink: 0 }}>{item.icon}</span> {sidebarOpen && item.label}
            </button>))}
        </nav>
        <main style={{ flex: 1, padding: 28, overflowX: "auto" }}>

          {/* DASHBOARD */}
          {tab === "dashboard" && (() => {
            const maxVal = Math.max(...stats.map((s) => s.v), 1);
            return <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24, color: "#1e3a5f" }}>แดชบอร์ด</h2>
            {/* Summary cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginBottom: 28 }}>
              {stats.map((s, i) => <div key={i} style={{ background: "#fff", borderRadius: 14, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", borderLeft: "4px solid " + s.c }}><div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>{s.l}</div><div style={{ fontSize: 28, fontWeight: 700, color: s.c }}>{s.v}</div></div>)}
            </div>
            {/* Bar chart */}
            <div style={{ background: "#fff", borderRadius: 14, padding: 28, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1e3a5f", marginBottom: 24 }}>สถานะลูกค้า</h3>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 16, height: 280, padding: "0 10px" }}>
                {stats.filter((_, i) => i > 0).map((s, i) => {
                  const pct = (s.v / maxVal) * 100;
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: s.c }}>{s.v}</span>
                      <div style={{ width: "100%", maxWidth: 60, borderRadius: "8px 8px 0 0", background: s.c, height: `${Math.max(pct, 5)}%`, transition: "height 0.5s ease", minHeight: 8 }} />
                      <span style={{ fontSize: 11, color: "#6b7280", textAlign: "center", fontWeight: 600, lineHeight: 1.2 }}>{s.l}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>;
          })()}

          {/* CUSTOMERS — SINGLE BIG TABLE with call columns */}
          {tab === "customers" && <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1e3a5f", margin: 0 }}>ลูกค้า ({fc.length})</h2>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {selectedRows.length > 0 && <>
                  <button onClick={() => setQuickUpdate({ fields: [], fieldValues: {} })} style={{ ...bo, border: "2px solid #2563eb", background: "#eff6ff", color: "#2563eb" }}><I.Edit /> อัปเดตด่วน ({selectedRows.length})</button>
                  <button onClick={handleBulkDelete} style={bd}><I.Trash /> ลบ {selectedRows.length}</button>
                </>}
                <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleImport} style={{ display: "none" }} />
                <button onClick={() => fileRef.current?.click()} style={bo}><I.Upload /> Import</button>
                <a href={import.meta.env.BASE_URL + "ตัวอย่าง_import_ลูกค้า.csv"} download style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 10, border: "2px dashed #d1d5db", background: "#fff", color: "#6b7280", fontWeight: 500, fontSize: 13, cursor: "pointer", textDecoration: "none" }}><I.FileDown /> ไฟล์ตัวอย่าง</a>
                <button onClick={handleExport} style={bo}><I.Download /> Export</button>
                <button onClick={() => setModal({ type: "customer", mode: "add", data: { status: "not_called" } })} style={bp}><I.Plus /> เพิ่มลูกค้า</button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              <PillDropdown label="สถานะ: ทั้งหมด" value={statusFilter} options={statusOpts} onChange={setStatusFilter} color="#2563eb" />
              <PillDropdown label="มอบหมาย: ทั้งหมด" value={assignFilter} options={assignOpts} onChange={setAssignFilter} color="#0891b2" />
              <PillDropdown label="หัวข้อโทร: ทั้งหมด" value={subjectFilter} options={subjectOpts} onChange={setSubjectFilter} color="#ea580c" />
              <PillDropdown label="ได้รับสินค้า: ทั้งหมด" value={receivedFilter} options={receivedOpts} onChange={setReceivedFilter} color="#16a34a" />
              <PillDropdown label="ความสัมพันธ์: ทั้งหมด" value={relationFilter} options={relationOpts} onChange={setRelationFilter} color="#7c3aed" />
              <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 300 }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }}><I.Search /></span>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาทุกคอลัมน์..." style={{ ...iS, paddingLeft: 40, borderRadius: 20, border: "2px solid #e5e7eb" }} />
              </div>
            </div>
            <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr style={{ background: "#f8fafc", borderBottom: "2px solid #e5e7eb" }}>
                    <th style={{ padding: "10px 12px", width: 36 }}><input type="checkbox" checked={selectedRows.length === fc.length && fc.length > 0} onChange={(e) => setSelectedRows(e.target.checked ? fc.map((c) => c.id) : [])} style={{ accentColor: "#2563eb" }} /></th>
                    {TH.map((h, i) => <th key={i} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {fc.map((c) => (
                      <tr key={c.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "6px 12px" }}><input type="checkbox" checked={selectedRows.includes(c.id)} onChange={(e) => setSelectedRows(e.target.checked ? [...selectedRows, c.id] : selectedRows.filter((r) => r !== c.id))} style={{ accentColor: "#2563eb" }} /></td>
                        {/* Customer columns */}
                        <td style={{ padding: "4px 4px" }}><EditableCell value={c.name} onSave={(v) => upd(c.id, "name", v)} style={{ fontWeight: 600, color: "#1e3a5f" }} /></td>
                        <td style={{ padding: "4px 4px" }}><EditableCell value={c.phone} onSave={(v) => upd(c.id, "phone", v)} /></td>
                        <td style={{ padding: "4px 4px", maxWidth: 180 }}><EditableCell value={c.note} onSave={(v) => upd(c.id, "note", v)} type="textarea" /></td>
                        <td style={{ padding: "4px 4px" }}><EditableCell value={c.previous_promo} onSave={(v) => upd(c.id, "previous_promo", v)} /></td>
                        <td style={{ padding: "4px 4px" }}><EditableCell value={c.order_date} onSave={(v) => upd(c.id, "order_date", v)} type="datetime" /></td>
                        <td style={{ padding: "6px 8px" }}>{c.received_product ? <span style={{ color: "#059669", fontWeight: 600, cursor: "pointer", fontSize: 11 }} onClick={() => upd(c.id, "received_product", false)}>✓ ได้รับ</span> : <span style={{ color: "#d97706", cursor: "pointer", fontSize: 11 }} onClick={() => upd(c.id, "received_product", true)}>รอส่ง</span>}</td>
                        <td style={{ padding: "6px 4px" }}><InlineStatusDropdown value={c.status} statuses={statuses} onChange={(v) => upd(c.id, "status", v)} /></td>
                        <td style={{ padding: "6px 8px", fontSize: 11, color: c.assigned_to ? "#4b5563" : "#d97706", fontWeight: 500 }}>{c.assigned_to || "ยังไม่มอบหมาย"}</td>
                        <td style={{ padding: "6px 8px", color: "#9ca3af", fontSize: 11 }}>{c.created_at}</td>
                        {/* Call columns — separated with blue border */}
                        <td style={{ padding: "4px 4px" }}><EditableCell value={c.call_date} onSave={(v) => upd(c.id, "call_date", v)} type="date" /></td>
                        <td style={{ padding: "6px 4px" }}><SubjectDropdown value={c.call_subject} subjects={callSubjects} onChange={(v) => upd(c.id, "call_subject", v)} /></td>
                        <td style={{ padding: "4px 4px", maxWidth: 250 }}><EditableCell value={c.call_note} onSave={(v) => upd(c.id, "call_note", v)} type="textarea" /></td>
                        <td style={{ padding: "6px 6px" }}><RatingSelector value={c.customer_relation} onChange={(v) => upd(c.id, "customer_relation", v)} /></td>
                        <td style={{ padding: "4px 4px" }}><EditableCell value={c.next_follow} onSave={(v) => upd(c.id, "next_follow", v)} type="date" /></td>
                        <td style={{ padding: "6px 4px" }}>{c.offer ? <span style={{ padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, color: "#fff", background: "#d97706", cursor: "pointer" }} onClick={() => { const v = prompt("เสนอขาย:", c.offer); if (v !== null) upd(c.id, "offer", v); }}>{c.offer}</span> : <span style={{ color: "#9ca3af", cursor: "pointer", fontSize: 11 }} onClick={() => { const v = prompt("เสนอขาย:"); if (v) upd(c.id, "offer", v); }}>—</span>}</td>
                        <td style={{ padding: "4px 4px" }}><EditableCell value={c.product_price ? String(c.product_price) : ""} onSave={(v) => upd(c.id, "product_price", Number(v) || 0)} /></td>
                        <td style={{ padding: "6px 8px" }}><button onClick={() => handleDelete("crm_customers", c.id)} style={bi(true)}><I.Trash /></button></td>
                      </tr>
                    ))}
                    {fc.length === 0 && <tr><td colSpan={TH.length + 1} style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>ไม่พบข้อมูล</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>}

          {/* SUPERVISOR */}
          {tab === "supervisor" && <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24, color: "#1e3a5f" }}>หัวหน้า / มอบหมาย</h2>
            <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
              {supervisors.map((sv) => { const is2 = selectedSupervisor?.id === sv.id; return (
                <button key={sv.id} onClick={() => { setSelectedSupervisor(is2 ? null : sv); setAssignSelected([]); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderRadius: 14, border: is2 ? "2px solid #2563eb" : "2px solid #e5e7eb", background: is2 ? "#eff6ff" : "#fff", cursor: "pointer" }}>
                  <div style={{ width: 42, height: 42, borderRadius: "50%", background: is2 ? "#2563eb" : "#fde68a", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16, color: is2 ? "#fff" : "#92400e" }}>{sv.name?.charAt(0)}</div>
                  <div style={{ textAlign: "left" }}><div style={{ fontWeight: 700, fontSize: 14 }}>{sv.name}</div><div style={{ fontSize: 12, color: "#6b7280" }}>{sv.department} · {customers.filter((c2) => c2.supervisor === sv.name).length}</div></div>
                </button>); })}
            </div>
            {selectedSupervisor ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>
                <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                  <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between" }}>
                    <div><h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ลูกค้า — {selectedSupervisor.name}</h3><span style={{ fontSize: 12, color: "#9ca3af" }}>เลือก {assignSelected.length}</span></div>
                    <button onClick={() => setAssignSelected(assignSelected.length ? [] : [...svC, ...unC].map((c2) => c2.id))} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", fontSize: 12, cursor: "pointer", color: "#6b7280" }}>{assignSelected.length ? "ยกเลิก" : "เลือกทั้งหมด"}</button>
                  </div>
                  <div style={{ maxHeight: 500, overflowY: "auto" }}>
                    {svC.length > 0 && <><div style={{ padding: "8px 20px", background: "#f0fdf4", fontSize: 12, fontWeight: 600, color: "#059669" }}>มอบหมายแล้ว ({svC.length})</div>{svC.map((c2) => (<label key={c2.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}><input type="checkbox" checked={assignSelected.includes(c2.id)} onChange={(e2) => setAssignSelected(e2.target.checked ? [...assignSelected, c2.id] : assignSelected.filter((r) => r !== c2.id))} style={{ accentColor: "#2563eb", width: 18, height: 18 }} /><div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{c2.name}</div><div style={{ fontSize: 12, color: "#6b7280" }}>{c2.phone}</div></div>{c2.assigned_to && <span style={{ fontSize: 11, background: "#dbeafe", color: "#1e40af", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>{c2.assigned_to}</span>}</label>))}</>}
                    {unC.length > 0 && <><div style={{ padding: "8px 20px", background: "#fef3c7", fontSize: 12, fontWeight: 600, color: "#92400e" }}>ยังไม่มอบหมาย ({unC.length})</div>{unC.map((c2) => (<label key={c2.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}><input type="checkbox" checked={assignSelected.includes(c2.id)} onChange={(e2) => setAssignSelected(e2.target.checked ? [...assignSelected, c2.id] : assignSelected.filter((r) => r !== c2.id))} style={{ accentColor: "#2563eb", width: 18, height: 18 }} /><div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{c2.name}</div><div style={{ fontSize: 12, color: "#6b7280" }}>{c2.phone}</div></div></label>))}</>}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ background: "#fff", borderRadius: 14, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                    <h4 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#1e3a5f" }}>มอบหมายให้พนักงาน</h4>
                    <select value={assignEmployee} onChange={(e2) => setAssignEmployee(e2.target.value)} style={{ ...iS, marginBottom: 14 }}><option value="">— เลือก —</option>{employees.map((e2) => <option key={e2.id} value={e2.name}>{e2.name}</option>)}</select>
                    <button onClick={handleAssign} disabled={!assignSelected.length || !assignEmployee} style={{ ...bp, width: "100%", justifyContent: "center", opacity: (!assignSelected.length || !assignEmployee) ? 0.5 : 1 }}>มอบหมาย {assignSelected.length}</button>
                  </div>
                  <div style={{ background: "#fff", borderRadius: 14, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                    <h4 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#dc2626" }}>ถอนสิทธิ์</h4>
                    <button onClick={handleRevoke} disabled={!assignSelected.length} style={{ ...bd, width: "100%", justifyContent: "center", padding: "10px", opacity: !assignSelected.length ? 0.5 : 1 }}>ถอนสิทธิ์ {assignSelected.length}</button>
                  </div>
                </div>
              </div>
            ) : <div style={{ background: "#fff", borderRadius: 14, padding: 60, textAlign: "center" }}><div style={{ fontSize: 48, opacity: 0.3 }}>👆</div><div style={{ color: "#6b7280" }}>เลือกหัวหน้าด้านบน</div></div>}
          </div>}

          {/* EMPLOYEES */}
          {tab === "employees" && <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1e3a5f", margin: 0 }}>พนักงาน ({employees.length})</h2>
              <button onClick={() => setModal({ type: "employee", mode: "add", data: {} })} style={bp}><I.Plus /> เพิ่มพนักงาน</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
              {employees.map((e2) => (<div key={e2.id} style={{ background: "#fff", borderRadius: 14, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", position: "relative" }}>
                <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 6 }}><button onClick={() => setModal({ type: "employee", mode: "edit", data: { ...e2 } })} style={bi(false)}><I.Edit /></button><button onClick={() => handleDelete("crm_employees", e2.id)} style={bi(true)}><I.Trash /></button></div>
                <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>{e2.name}</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>{e2.role} · {e2.email}</div>
                <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: "#dbeafe", color: "#1e40af" }}>{customers.filter((c2) => c2.assigned_to === e2.name).length} ลูกค้า</span>
              </div>))}
            </div>
          </div>}

          {/* SETTINGS */}
          {tab === "settings" && <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24, color: "#1e3a5f" }}>ตั้งค่าระบบ</h2>
            <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "#fff", borderRadius: 12, padding: 4, width: "fit-content", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              {[{ key: "statuses", label: "สถานะ" }, { key: "call_subjects", label: "หัวข้อโทร" }, { key: "supervisors", label: "หัวหน้า" }].map((st) => (
                <button key={st.key} onClick={() => setSettingsSubTab(st.key)} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: settingsSubTab === st.key ? "linear-gradient(135deg, #2563eb, #1d4ed8)" : "transparent", color: settingsSubTab === st.key ? "#fff" : "#6b7280", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{st.label}</button>))}
            </div>
            {settingsSubTab === "statuses" && <div style={{ background: "#fff", borderRadius: 14, padding: 28, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}><h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>สถานะ</h3><button onClick={() => setModal({ type: "status", mode: "add", data: { key: "", label: "", color: "#2563eb" } })} style={bp}><I.Plus /> เพิ่ม</button></div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>{statuses.map((s) => (<div key={s.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}><span style={{ padding: "5px 14px", borderRadius: 8, fontWeight: 700, color: "#fff", background: s.color }}>{s.label}</span><div style={{ display: "flex", gap: 6 }}><button onClick={() => setModal({ type: "status", mode: "edit", data: { ...s } })} style={bi(false)}><I.Edit /></button><button onClick={() => handleDelete("crm_statuses", s.id)} style={bi(true)}><I.Trash /></button></div></div>))}</div>
            </div>}
            {settingsSubTab === "call_subjects" && <div style={{ background: "#fff", borderRadius: 14, padding: 28, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}><h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>หัวข้อโทร</h3><button onClick={() => setModal({ type: "call_subject", mode: "add", data: { label: "", color: "#2563eb" } })} style={bp}><I.Plus /> เพิ่ม</button></div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>{callSubjects.map((s) => (<div key={s.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}><span style={{ padding: "5px 14px", borderRadius: 8, fontWeight: 700, color: "#fff", background: s.color }}>{s.label}</span><div style={{ display: "flex", gap: 6 }}><button onClick={() => setModal({ type: "call_subject", mode: "edit", data: { ...s } })} style={bi(false)}><I.Edit /></button><button onClick={() => handleDelete("crm_call_subjects", s.id)} style={bi(true)}><I.Trash /></button></div></div>))}</div>
            </div>}
            {settingsSubTab === "supervisors" && <div style={{ background: "#fff", borderRadius: 14, padding: 28, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}><h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>หัวหน้า</h3><button onClick={() => setModal({ type: "supervisor", mode: "add", data: {} })} style={bp}><I.Plus /> เพิ่ม</button></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>{supervisors.map((sv) => (<div key={sv.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, position: "relative" }}>
                <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 6 }}><button onClick={() => setModal({ type: "supervisor", mode: "edit", data: { ...sv } })} style={bi(false)}><I.Edit /></button><button onClick={() => handleDelete("crm_supervisors", sv.id)} style={bi(true)}><I.Trash /></button></div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{sv.name}</div><div style={{ fontSize: 13, color: "#6b7280" }}>{sv.department} · {sv.email}</div>
              </div>))}</div>
            </div>}
          </div>}

          {/* TRASH */}
          {tab === "trash" && (() => {
            const myTrash = currentUser?.role === "admin" ? trash : trash.filter((t) => t.deleted_by === currentUser?.name);
            return <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1e3a5f", margin: 0 }}>ข้อมูลที่ลบแล้ว ({myTrash.length})</h2>
              {myTrash.length > 0 && currentUser?.role === "admin" && <button onClick={handleEmptyTrash} style={bd}><I.Trash /> ล้างถังขยะทั้งหมด</button>}
            </div>
            {myTrash.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 14, padding: 60, textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 48, opacity: 0.3, marginBottom: 12 }}>🗑️</div>
                <div style={{ color: "#9ca3af", fontSize: 16 }}>ไม่มีข้อมูลที่ลบ</div>
              </div>
            ) : (
              <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead><tr style={{ background: "#fef2f2", borderBottom: "2px solid #fecaca" }}>
                      {["ชื่อ", "เบอร์โทร", "ที่อยู่", "สถานะ", "มอบหมาย", "ลบโดย", "ลบเมื่อ", ""].map((h, i) => <th key={i} style={{ padding: "12px 14px", textAlign: "left", fontWeight: 700, color: "#991b1b", whiteSpace: "nowrap" }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {myTrash.map((t) => {
                        const st = statuses.find((s) => s.key === t.status);
                        return (
                          <tr key={t.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                            <td style={{ padding: "12px 14px", fontWeight: 600, color: "#1e3a5f" }}>{t.name}</td>
                            <td style={{ padding: "12px 14px" }}>{t.phone}</td>
                            <td style={{ padding: "12px 14px", color: "#6b7280", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.note || "—"}</td>
                            <td style={{ padding: "12px 14px" }}>{st ? <span style={{ padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, color: "#fff", background: st.color }}>{st.label}</span> : (t.status || "—")}</td>
                            <td style={{ padding: "12px 14px", color: "#6b7280" }}>{t.assigned_to || "—"}</td>
                            <td style={{ padding: "12px 14px", color: "#4b5563", fontWeight: 500 }}>{t.deleted_by || "—"}</td>
                            <td style={{ padding: "12px 14px", color: "#dc2626", fontSize: 12 }}>{t.deleted_at}</td>
                            <td style={{ padding: "12px 14px" }}>
                              <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={() => handleRestore(t.id)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 14px", borderRadius: 8, border: "1px solid #d1fae5", background: "#f0fdf4", color: "#059669", fontWeight: 600, fontSize: 12, cursor: "pointer" }}><I.Restore /> กู้คืน</button>
                                {currentUser?.role === "admin" && <button onClick={() => handlePermanentDelete(t.id)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 14px", borderRadius: 8, border: "1px solid #fee2e2", background: "#fff", color: "#dc2626", fontWeight: 600, fontSize: 12, cursor: "pointer" }}><I.Trash /> ลบถาวร</button>}
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
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1e3a5f" }}>{modal.mode === "add" ? "เพิ่ม" : "แก้ไข"}{{ customer: "ลูกค้า", employee: "พนักงาน", status: "สถานะ", supervisor: "หัวหน้า", call_subject: "หัวข้อโทร" }[modal.type]}</h3>
            <button onClick={() => setModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}><I.X /></button>
          </div>
          <ModalForm modal={modal} setModal={setModal} onSave={handleSave} employees={employees} statuses={statuses} supervisors={supervisors} callSubjects={callSubjects} iS={iS} lS={lS} />
        </div>
      </div>}

      {/* QUICK UPDATE */}
      {quickUpdate && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 20 }} onClick={(e) => e.target === e.currentTarget && setQuickUpdate(null)}>
        <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 700, maxHeight: "90vh", overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "20px 28px", borderBottom: "1px solid #e5e7eb" }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1e3a5f" }}>อัปเดตด่วน</h3>
            <button onClick={() => setQuickUpdate(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}><I.X /></button>
          </div>
          <div style={{ padding: 28 }}>
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "12px 16px", marginBottom: 24, fontSize: 14, color: "#1e40af" }}>ℹ️ ฟิลด์ว่างจะถูกอัปเดตเป็นไม่มีค่า</div>
            <div style={{ marginBottom: 20 }}><label style={{ ...lS, fontSize: 15, fontWeight: 700 }}>เลือกฟิลด์</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "12px 16px", borderRadius: 10, border: "1px solid #e5e7eb", minHeight: 48, alignItems: "center" }}>
                {quickUpdate.fields.map((f) => (<span key={f} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20, background: "#dbeafe", color: "#1e40af", fontWeight: 600, fontSize: 13 }}>{{ assigned_to: "Assigned To", status: "สถานะ", supervisor: "หัวหน้า", previous_promo: "โปรก่อนหน้า", received_product: "ได้รับสินค้า" }[f]}<button onClick={() => setQuickUpdate({ ...quickUpdate, fields: quickUpdate.fields.filter((x) => x !== f) })} style={{ background: "none", border: "none", cursor: "pointer", color: "#1e40af", fontWeight: 700, padding: 0 }}>×</button></span>))}
                <select value="" onChange={(e2) => { if (e2.target.value && !quickUpdate.fields.includes(e2.target.value)) setQuickUpdate({ ...quickUpdate, fields: [...quickUpdate.fields, e2.target.value] }); e2.target.value = ""; }} style={{ border: "none", background: "none", fontSize: 14, color: "#6b7280", cursor: "pointer", outline: "none", flex: 1, minWidth: 120 }}>
                  <option value="">+ เพิ่มฟิลด์...</option>
                  {[{ v: "assigned_to", l: "Assigned To" }, { v: "status", l: "สถานะ" }, { v: "supervisor", l: "หัวหน้า" }, { v: "previous_promo", l: "โปรก่อนหน้า" }, { v: "received_product", l: "ได้รับสินค้า" }].filter((o) => !quickUpdate.fields.includes(o.v)).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
            </div>
            {quickUpdate.fields.length > 0 && <div style={{ marginBottom: 24 }}><label style={{ ...lS, fontSize: 15, fontWeight: 700 }}>การตั้งค่า</label>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 40px 1fr", background: "#f8fafc", padding: "12px 20px", fontWeight: 700, fontSize: 13, borderBottom: "1px solid #e5e7eb" }}><span>ฟิลด์</span><span></span><span>ค่า</span></div>
                {quickUpdate.fields.map((f, idx) => (<div key={f} style={{ display: "grid", gridTemplateColumns: "1fr 40px 1fr", padding: "14px 20px", alignItems: "center", borderBottom: idx < quickUpdate.fields.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                  <span style={{ fontSize: 14, color: "#2563eb" }}>{{ assigned_to: "Assigned To", status: "สถานะ", supervisor: "หัวหน้า", previous_promo: "โปรก่อนหน้า", received_product: "ได้รับสินค้า" }[f]}</span>
                  <span style={{ textAlign: "center", color: "#9ca3af" }}>→</span>
                  <div>
                    {f === "assigned_to" && <select value={quickUpdate.fieldValues[f] || ""} onChange={(e2) => setQuickUpdate({ ...quickUpdate, fieldValues: { ...quickUpdate.fieldValues, [f]: e2.target.value } })} style={iS}><option value="">เลือก</option>{employees.map((em) => <option key={em.id} value={em.name}>{em.name}</option>)}</select>}
                    {f === "status" && <select value={quickUpdate.fieldValues[f] || ""} onChange={(e2) => setQuickUpdate({ ...quickUpdate, fieldValues: { ...quickUpdate.fieldValues, [f]: e2.target.value } })} style={iS}><option value="">เลือก</option>{statuses.map((s) => <option key={s.id} value={s.key}>{s.label}</option>)}</select>}
                    {f === "supervisor" && <select value={quickUpdate.fieldValues[f] || ""} onChange={(e2) => setQuickUpdate({ ...quickUpdate, fieldValues: { ...quickUpdate.fieldValues, [f]: e2.target.value } })} style={iS}><option value="">เลือก</option>{supervisors.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}</select>}
                    {f === "previous_promo" && <input style={iS} value={quickUpdate.fieldValues[f] || ""} onChange={(e2) => setQuickUpdate({ ...quickUpdate, fieldValues: { ...quickUpdate.fieldValues, [f]: e2.target.value } })} />}
                    {f === "received_product" && <select value={quickUpdate.fieldValues[f] || ""} onChange={(e2) => setQuickUpdate({ ...quickUpdate, fieldValues: { ...quickUpdate.fieldValues, [f]: e2.target.value } })} style={iS}><option value="">เลือก</option><option value="true">ได้รับแล้ว</option><option value="false">ยังไม่ได้รับ</option></select>}
                  </div>
                </div>))}
              </div>
            </div>}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>ถูกเลือก <span style={{ background: "#16a34a", color: "#fff", padding: "2px 8px", borderRadius: "50%", fontSize: 12 }}>{selectedRows.length}</span></div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, maxHeight: 180, overflowY: "auto" }}>
                {selectedRows.map((rid, idx) => { const cu = customers.find((c2) => c2.id === rid); return (<div key={rid} style={{ display: "flex", justifyContent: "space-between", padding: "10px 20px", borderBottom: idx < selectedRows.length - 1 ? "1px solid #f3f4f6" : "none" }}><span>{cu?.name} <span style={{ color: "#9ca3af", fontSize: 12 }}>{cu?.phone}</span></span><button onClick={() => setSelectedRows(selectedRows.filter((r) => r !== rid))} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}>🗑</button></div>); })}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={async () => { if (!quickUpdate.fields.length) { showToast("เลือกฟิลด์ก่อน", "warning"); return; } const u2 = {}; quickUpdate.fields.forEach((f) => { const v = quickUpdate.fieldValues[f]; u2[f] = f === "received_product" ? v === "true" : (v || ""); }); for (const rid of selectedRows) { await supabase.from("crm_customers").update(u2).eq("id", rid); } await fetchAll(); showToast("อัปเดต " + selectedRows.length + " ลูกค้า"); setSelectedRows([]); setQuickUpdate(null); }} style={{ ...bp, padding: "12px 32px", fontSize: 16 }}>อัปเดต</button>
            </div>
          </div>
        </div>
      </div>}

      {toast && <div style={{ position: "fixed", bottom: 24, right: 24, background: toast.type === "warning" ? "#fef3c7" : "#d1fae5", color: toast.type === "warning" ? "#92400e" : "#065f46", padding: "14px 24px", borderRadius: 12, fontWeight: 600, fontSize: 14, boxShadow: "0 8px 30px rgba(0,0,0,0.15)", zIndex: 2000, animation: "slideUp .3s", display: "flex", alignItems: "center", gap: 8 }}>{toast.type === "warning" ? "⚠️" : "✓"} {toast.msg}</div>}
      {loading && <div style={{ position: "fixed", inset: 0, background: "rgba(255,255,255,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3000 }}><div style={{ textAlign: "center" }}><div style={{ width: 48, height: 48, border: "4px solid #e5e7eb", borderTop: "4px solid #2563eb", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} /><div style={{ color: "#1e3a5f", fontWeight: 600, fontSize: 16 }}>กำลังโหลดข้อมูล...</div></div></div>}
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}} @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}} @keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
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
          <div><label style={lS}>มอบหมาย</label><select style={iS} value={form.assigned_to || ""} onChange={(e) => u("assigned_to", e.target.value)}><option value="">—</option>{employees.map((e2) => <option key={e2.id} value={e2.name}>{e2.name}</option>)}</select></div>
        </>}
        {modal.type === "employee" && <>
          <div style={{ gridColumn: "1/3" }}><label style={lS}>ชื่อ</label><input style={iS} value={form.name || ""} onChange={(e) => u("name", e.target.value)} /></div>
          <div><label style={lS}>ชื่อผู้ใช้ (Login)</label><input style={iS} value={form.username || ""} onChange={(e) => u("username", e.target.value)} placeholder="username" /></div>
          <div><label style={lS}>รหัสผ่าน</label><input style={iS} value={form.password || ""} onChange={(e) => u("password", e.target.value)} placeholder="password" /></div>
          <div><label style={lS}>อีเมล</label><input style={iS} value={form.email || ""} onChange={(e) => u("email", e.target.value)} /></div>
          <div><label style={lS}>เบอร์โทร</label><input style={iS} value={form.phone || ""} onChange={(e) => u("phone", e.target.value)} /></div>
          <div><label style={lS}>ตำแหน่ง</label><input style={iS} value={form.role || ""} onChange={(e) => u("role", e.target.value)} /></div>
        </>}
        {modal.type === "status" && <>
          <div><label style={lS}>Key</label><input style={iS} value={form.key || ""} onChange={(e) => u("key", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} /></div>
          <div><label style={lS}>Label</label><input style={iS} value={form.label || ""} onChange={(e) => u("label", e.target.value)} /></div>
          <div style={{ gridColumn: "1/3" }}><label style={lS}>สี</label><div style={{ display: "flex", alignItems: "center", gap: 12 }}><input type="color" value={form.color || "#2563eb"} onChange={(e) => u("color", e.target.value)} style={{ width: 50, height: 50, borderRadius: 10, border: "2px solid #e5e7eb", cursor: "pointer", padding: 2 }} /><span style={{ fontSize: 13, color: "#6b7280" }}>{form.color || "#2563eb"}</span></div></div>
          <div style={{ gridColumn: "1/3" }}><span style={{ padding: "6px 16px", borderRadius: 8, fontWeight: 700, color: "#fff", background: form.color || "#6b7280" }}>{form.label || "ตัวอย่าง"}</span></div>
        </>}
        {modal.type === "call_subject" && <>
          <div><label style={lS}>ชื่อหัวข้อ</label><input style={iS} value={form.label || ""} onChange={(e) => u("label", e.target.value)} /></div>
          <div><label style={lS}>สี</label><div style={{ display: "flex", alignItems: "center", gap: 12 }}><input type="color" value={form.color || "#2563eb"} onChange={(e) => u("color", e.target.value)} style={{ width: 44, height: 44, borderRadius: 8, border: "2px solid #e5e7eb", cursor: "pointer", padding: 2 }} /><span style={{ fontSize: 13, color: "#6b7280" }}>{form.color || "#2563eb"}</span></div></div>
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
        <button onClick={() => onSave(table, form, modal.mode)} style={{ padding: "10px 28px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{modal.mode === "add" ? "เพิ่ม" : "บันทึก"}</button>
      </div>
    </div>
  );
}
// v2
