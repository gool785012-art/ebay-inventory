// データベースの行の型定義（Phase 1 では主要テーブルのみ。以降のPhaseで拡張）

export type Profile = {
  id: string;
  role: "admin" | "staff";
  full_name: string;
  email: string | null;
  phone: string | null;
  status: "active" | "paused" | "terminated";
  notes: string;
  created_at: string;
};

export type Category = {
  id: number;
  name: string;
  prefix: string;
  default_fee: number;
  requires_turntable_checklist: boolean;
  sort_order: number;
};

export type Carrier = {
  id: number;
  name: string;
  sort_order: number;
};

export type Product = {
  id: string;
  control_number: string;
  name: string;
  category_id: number | null;
  assigned_staff_id: string | null;
  status: string;
  arrival_date: string | null;
  ship_deadline: string | null;
  shipped_date: string | null;
  carrier_id: number | null;
  tracking_number: string;
  weight_kg: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  serial_number: string;
  exterior_condition: string;
  works_ok: boolean | null;
  has_problem: boolean;
  problem_note: string;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
