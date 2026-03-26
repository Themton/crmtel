-- ============================================================
-- CRM System - Supabase Schema v6
-- ใช้ prefix crm_ ป้องกันชื่อซ้ำกับโปรเจกอื่น
-- ============================================================

CREATE TABLE crm_statuses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE crm_call_subjects (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label TEXT NOT NULL, color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE crm_supervisors (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL, phone TEXT, email TEXT, department TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE crm_employees (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL, email TEXT, phone TEXT, role TEXT DEFAULT 'Sales',
  active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now()
);

-- ลูกค้า + บันทึกการโทร รวมในตารางเดียว
CREATE TABLE crm_customers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- ข้อมูลลูกค้า
  name TEXT NOT NULL,
  phone TEXT,
  note TEXT,
  previous_promo TEXT,
  order_date TIMESTAMPTZ,
  received_product BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'not_called',
  supervisor TEXT,
  assigned_to TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- บันทึกการโทร
  call_date DATE,
  call_subject TEXT,
  call_note TEXT,
  customer_relation INTEGER DEFAULT 0,
  next_follow DATE,
  offer TEXT,
  product_price NUMERIC(12,2) DEFAULT 0
);

-- INDEXES
CREATE INDEX idx_crm_cust_status ON crm_customers(status);
CREATE INDEX idx_crm_cust_assigned ON crm_customers(assigned_to);
CREATE INDEX idx_crm_cust_call_date ON crm_customers(call_date DESC);

-- RLS
ALTER TABLE crm_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_call_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_supervisors ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_all" ON crm_statuses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "crm_all" ON crm_call_subjects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "crm_all" ON crm_supervisors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "crm_all" ON crm_employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "crm_all" ON crm_customers FOR ALL USING (true) WITH CHECK (true);

-- ข้อมูลตัวอย่าง
INSERT INTO crm_statuses (key, label, color) VALUES
  ('not_called','ยังไม่ได้โทร','#d97706'),
  ('not_available','ไม่สะดวกคุย','#ea580c'),
  ('answered','รับสาย','#16a34a'),
  ('no_answer','ไม่รับสาย','#dc2626'),
  ('vvip','Vvip','#2563eb'),
  ('reserved','จอง','#0891b2');

INSERT INTO crm_call_subjects (label, color) VALUES
  ('ดูแลหลังการขาย','#ea580c'),
  ('Re_order','#16a34a'),
  ('3-5วัน','#d97706'),
  ('10-15วัน','#dc2626'),
  ('20-25วัน','#dc2626'),
  ('30วัน','#dc2626'),
  ('CROSS','#7c3aed'),
  ('UpSell','#db2777');

INSERT INTO crm_employees (name, email, phone, role) VALUES
  ('Kiri Suksawat','kiri@co.com','081-000-0001','Sales'),
  ('ออย(ญ)','oiy@co.com','081-000-0002','Sales'),
  ('ฝน','fon@co.com','081-000-0003','Sales'),
  ('sawatdee','sawatdee@co.com','081-000-0004','Sales'),
  ('KHUNFLUKE','fluke@co.com','081-000-0005','Sales'),
  ('อาหมวย','muay@co.com','081-000-0006','Sales');

INSERT INTO crm_supervisors (name, phone, email, department) VALUES
  ('คุณสมศักดิ์','081-111-0001','somsak@co.com','ฝ่ายขาย'),
  ('คุณวิไล','081-111-0002','wilai@co.com','ฝ่ายบริการ');
