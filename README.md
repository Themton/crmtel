# CRM System

ระบบ CRM สำหรับจัดการลูกค้า พนักงาน บันทึกการโทร พร้อมเชื่อมต่อ Supabase

## ฟีเจอร์

- จัดการลูกค้า + บันทึกการโทรในตารางเดียว
- Inline Editing — คลิกแก้ไขข้อมูลในตารางได้เลย
- Import / Export CSV
- สถานะ Dropdown (ยังไม่ได้โทร, รับสาย, ไม่รับสาย, Vvip ฯลฯ)
- หัวข้อโทร Pill Dropdown (3-5วัน, 10-15วัน, ดูแลหลังการขาย ฯลฯ)
- ความสัมพันธ์ลูกค้า 1-5
- อัปเดตด่วน — เลือกหลายคน แล้ว assign พร้อมกัน
- หัวหน้า / มอบหมาย + ถอนสิทธิ์
- ตั้งค่าระบบ — จัดการสถานะ, หัวข้อโทร, หัวหน้า

---

## วิธีติดตั้งและ Deploy

### 1. สร้าง Repository บน GitHub

```bash
# clone หรือ download โปรเจกนี้ แล้ว push ขึ้น GitHub
git init
git add .
git commit -m "Initial CRM System"
git branch -M main
git remote add origin https://github.com/USERNAME/crm-system.git
git push -u origin main
```

### 2. ตั้งค่า Supabase

1. ไปที่ [supabase.com](https://supabase.com) → สร้าง Project (หรือใช้ Project เดิมได้)
2. ไปที่ **SQL Editor** → วาง SQL จากไฟล์ `supabase-schema.sql` แล้วกด **Run**
3. ไปที่ **Settings → API** → คัดลอก:
   - **Project URL** (เช่น `https://xxxxx.supabase.co`)
   - **anon public key**

### 3. แก้ไข Config ในโค้ด

เปิดไฟล์ `src/App.jsx` แก้บรรทัดบนสุด:

```javascript
const SUPABASE_URL = "https://xxxxx.supabase.co";  // ← ใส่ URL จริง
const SUPABASE_ANON_KEY = "eyJhbGci...";            // ← ใส่ key จริง
const USE_DEMO = false;                              // ← เปลี่ยนเป็น false
```

Commit แล้ว push:
```bash
git add .
git commit -m "Connect Supabase"
git push
```

### 4. Deploy ด้วย Vercel (ฟรี)

1. ไปที่ [vercel.com](https://vercel.com) → Login ด้วย GitHub
2. กด **"Add New Project"**
3. เลือก Repository `crm-system`
4. Framework Preset: **Vite**
5. กด **Deploy** → รอ 1-2 นาที → ได้ลิงก์เว็บเลย!

### 4b. (ทางเลือก) Deploy ด้วย Netlify

1. ไปที่ [netlify.com](https://netlify.com) → Login ด้วย GitHub
2. กด **"Add new site" → "Import an existing project"**
3. เลือก Repository `crm-system`
4. Build command: `npm run build`
5. Publish directory: `dist`
6. กด **Deploy**

---

## รันบนเครื่อง (Development)

```bash
npm install
npm run dev
```

เปิด http://localhost:5173

---

## โครงสร้างไฟล์

```
crm-system/
├── index.html
├── package.json
├── vite.config.js
├── supabase-schema.sql      ← SQL สร้างตาราง (รันใน Supabase)
├── public/
│   └── ตัวอย่าง_import_ลูกค้า.csv
└── src/
    ├── main.jsx
    └── App.jsx               ← โค้ด CRM ทั้งหมด
```

## ตาราง Supabase (ใช้ prefix crm_ ป้องกันซ้ำ)

| ตาราง | คำอธิบาย |
|---|---|
| crm_customers | ลูกค้า + บันทึกการโทร |
| crm_employees | พนักงาน |
| crm_statuses | สถานะ (จัดการได้) |
| crm_call_subjects | หัวข้อโทร (จัดการได้) |
| crm_supervisors | หัวหน้า (จัดการได้) |
