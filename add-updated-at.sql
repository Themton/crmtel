-- ============================================================
-- เพิ่ม updated_at ให้ crm_customers เพื่อให้ Incremental Sync ทำงาน (ลด EGRESS)
-- วิธีรัน: Supabase Dashboard -> SQL Editor -> วางทั้งหมดนี้ -> Run
-- รันครั้งเดียวพอ (ปลอดภัย รันซ้ำได้ ใช้ IF NOT EXISTS / OR REPLACE)
-- ============================================================

-- 1) เพิ่มคอลัมน์ updated_at (ถ้ายังไม่มี)
ALTER TABLE crm_customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2) เติมค่าให้แถวเดิมทั้งหมด (ใช้ created_at ถ้ามี ไม่งั้น now())
UPDATE crm_customers SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL;

-- 3) ฟังก์ชัน + trigger: อัปเดต updated_at อัตโนมัติทุกครั้งที่มีการแก้ไขแถว
CREATE OR REPLACE FUNCTION set_crm_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_customers_updated_at ON crm_customers;
CREATE TRIGGER trg_crm_customers_updated_at
  BEFORE UPDATE ON crm_customers
  FOR EACH ROW EXECUTE FUNCTION set_crm_updated_at();

-- 4) index บน updated_at -> incremental query เร็ว ไม่ต้อง scan ทั้งตาราง
CREATE INDEX IF NOT EXISTS idx_crm_cust_updated_at ON crm_customers(updated_at);

-- เสร็จแล้ว! หลังรันเสร็จ แอปจะเริ่ม sync เฉพาะแถวที่เปลี่ยนแทนการดึงทั้งตารางทุกครั้ง
