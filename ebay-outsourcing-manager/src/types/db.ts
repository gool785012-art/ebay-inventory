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
  shipping_method: string;
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
  // 集荷管理（Phase 7）
  handover_method: string;
  pickup_available_date: string | null;
  pickup_available_from: string | null;
  pickup_available_to: string | null;
  pickup_staff_note: string;
  pickup_status: string;
  pickup_confirmed_date: string | null;
  pickup_confirmed_from: string | null;
  pickup_confirmed_to: string | null;
  pickup_admin_note: string;
  // 追加作業・報酬（Phase 9）
  photo_required: boolean;
  operation_check_required: boolean;
  handover_reward: number;
  reimbursement: number;
  reimbursement_note: string;
  operation_check_result: "ok" | "problem" | "unable" | null;
  operation_check_memo: string;
};

export type WorkReward = {
  id: string;
  staff_id: string | null;
  product_id: string;
  reward_amount: number;
  completed_at: string;
  payment_status: "unpaid" | "paid" | "on_hold";
  paid_at: string | null;
  memo: string;
  created_at: string;
  updated_at: string;
};

export type ShippingDocument = {
  id: string;
  product_id: string;
  document_type: string;
  file_name: string;
  file_path: string;
  uploaded_by: string | null;
  shared_at: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductExpense = {
  id: string;
  product_id: string;
  expense_type: string;
  description: string;
  amount: number;
  status: string;
  no_receipt_approved: boolean;
  admin_note: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ExpenseReceipt = {
  id: string;
  expense_id: string;
  product_id: string;
  file_name: string;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
};
