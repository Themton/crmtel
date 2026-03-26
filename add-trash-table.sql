-- เพิ่มตาราง crm_trash
CREATE TABLE IF NOT EXISTS crm_trash (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  original_id BIGINT,
  name TEXT, phone TEXT, note TEXT,
  previous_promo TEXT, order_date TIMESTAMPTZ,
  received_product BOOLEAN DEFAULT false,
  status TEXT, supervisor TEXT, assigned_to TEXT,
  created_at TIMESTAMPTZ,
  call_date DATE, call_subject TEXT, call_note TEXT,
  customer_relation INTEGER DEFAULT 0,
  next_follow DATE, offer TEXT,
  product_price NUMERIC(12,2) DEFAULT 0,
  deleted_at TIMESTAMPTZ DEFAULT now(),
  deleted_by TEXT
);

ALTER TABLE crm_trash ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_all" ON crm_trash FOR ALL USING (true) WITH CHECK (true);
