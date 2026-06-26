-- ============================================================
-- บังคับ assigned_email เป็นตัวพิมพ์เล็กเสมอ (จำเป็นสำหรับ realtime filter ของพนักงาน — ข้อ 7)
-- ทำให้ realtime กรองได้แม่นยำ พนักงานไม่พลาดอัปเดตสด
-- วิธีรัน: Supabase Dashboard -> SQL Editor -> วางทั้งหมด -> Run (รันครั้งเดียว, รันซ้ำได้)
-- ============================================================

-- 1) normalize ของเดิมทั้งหมดให้เป็น lowercase + ตัดช่องว่าง
UPDATE crm_customers
SET assigned_email = lower(trim(assigned_email))
WHERE assigned_email IS NOT NULL
  AND assigned_email IS DISTINCT FROM lower(trim(assigned_email));

-- 2) trigger: บังคับ lowercase ทุกครั้งที่ INSERT/UPDATE (ครอบทุกจุดที่แอปเขียน ไม่มีทางพลาด)
CREATE OR REPLACE FUNCTION crm_lc_assigned_email() RETURNS trigger AS $$
BEGIN
  IF NEW.assigned_email IS NOT NULL THEN
    NEW.assigned_email = lower(trim(NEW.assigned_email));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_lc_assigned_email ON crm_customers;
CREATE TRIGGER trg_crm_lc_assigned_email
  BEFORE INSERT OR UPDATE ON crm_customers
  FOR EACH ROW EXECUTE FUNCTION crm_lc_assigned_email();

-- เสร็จแล้ว! assigned_email จะเป็นตัวพิมพ์เล็กตลอดไป -> realtime filter ปลอดภัย
