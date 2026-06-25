import { useState, useEffect, useRef, useMemo, useCallback } from "react";

// ─── 定数 ──────────────────────────────────────────────────────────
const STORAGE_KEY = "ebay_inventory_v3";
const STATUS_LIST = ["仕入れ済み","検品中","撮影待ち","出品中","売約済み","発送済み","返品対応中","完了","保留"];
const STATUS_COLOR = {
  "仕入れ済み":"#805AD5","検品中":"#D69E2E","撮影待ち":"#3182CE",
  "出品中":"#38A169","売約済み":"#DD6B20","発送済み":"#2B6CB0",
  "返品対応中":"#E53E3E","完了":"#718096","保留":"#A0AEC0"
};
const CATEGORY_LIST = ["カメラ","レンズ","時計","コスメ・美容","ヘアケア機器","エステ機器","アクセサリー","衣類","電子機器","その他"];

const INITIAL_RATE = 155;
const INITIAL_EBAY_FEE = 13.25;   // eBay最終価格手数料（カテゴリ平均）
const INITIAL_PAYONEER_FEE = 2.0; // Payoneer受取手数料
const INITIAL_AD_FEE = 0;         // プロモーテッドリスティング広告費
const CONSUMPTION_TAX_RATE = 0.10; // 消費税率

function genId() { return "SKU-" + Date.now() + "-" + Math.floor(Math.random()*1000); }

// ─── 利益計算ロジック ────────────────────────────────────────────────
// 計算式の概要:
//   売上円換算 = 販売(or出品)USD × 為替レート
//   eBay手数料 = 売上円換算 × eBay手数料率
//   広告費     = 売上円換算 × 広告費率（Promoted Listings）
//   Payoneer手数料 = (売上円換算 - eBay手数料 - 広告費) × Payoneer手数料率
//                    ※eBay・広告費控除後の受取額に対して課金されるため
//   消費税還付 = 仕入価格 × 税率/(1+税率)  ※税込仕入の場合のみ有効
//   総コスト   = 仕入 + 国内送料 + 修理費 + 海外送料 + 関税
//              + eBay手数料 + 広告費 + Payoneer手数料 - 消費税還付
//   利益 = 売上円換算 - 総コスト
function calcProfit(item) {
  const saleUSD = parseFloat(item.salePrice) || parseFloat(item.listPrice) || 0;
  const rate = parseFloat(item.rate) || INITIAL_RATE;
  const salesJPY = saleUSD * rate;

  const ebayFeeRate    = parseFloat(item.ebayFeeRate)    / 100 || INITIAL_EBAY_FEE    / 100;
  const payoneerFeeRate= parseFloat(item.payoneerFeeRate)/ 100 || INITIAL_PAYONEER_FEE/ 100;
  const adFeeRate      = parseFloat(item.adFeeRate)      / 100 || INITIAL_AD_FEE      / 100;

  const purchase = parseFloat(item.purchasePrice)    || 0;
  const domestic = parseFloat(item.domesticShipping) || 0;
  const repair   = parseFloat(item.repairCost)       || 0;
  const oversea  = parseFloat(item.overseaShipping)  || 0;
  const tariff   = parseFloat(item.tariff)           || 0;

  const ebayFee     = salesJPY * ebayFeeRate;
  const adFee       = salesJPY * adFeeRate;
  // Payoneer手数料はeBay手数料・広告費を差し引いた受取額に対して課金
  const payoneerFee = (salesJPY - ebayFee - adFee) * payoneerFeeRate;

  // 消費税還付: 税込仕入価格から消費税分を控除（還付あり=trueの場合）
  // 税込価格 P に対して消費税 = P × 10/110
  const taxRefund = item.taxRefund
    ? purchase * (CONSUMPTION_TAX_RATE / (1 + CONSUMPTION_TAX_RATE))
    : 0;

  const totalCost = purchase + domestic + repair + oversea + tariff
                  + ebayFee + adFee + payoneerFee - taxRefund;

  const profit     = salesJPY - totalCost;
  const profitRate = salesJPY > 0 ? (profit / salesJPY) * 100 : 0;
  const isEstimate = !(parseFloat(item.salePrice) > 0);

  return {
    salesJPY, profit, profitRate, totalCost, isEstimate,
    // 明細（ProfitPreview・将来のCSV明細向け）
    breakdown: { ebayFee, adFee, payoneerFee, taxRefund, purchase, domestic, repair, oversea, tariff }
  };
}

const SAMPLE_ITEMS = [
  {
    id: genId(), sku:"SKU-001", name:"Canon EF 50mm f1.4 USM", brand:"Canon",
    modelNo:"EF50/1.4", category:"レンズ", purchaseDate:"2025-05-10",
    supplier:"ハードオフ新宿店", purchasePrice:12000, domesticShipping:500,
    repairCost:0, listPrice:189, salePrice:"", rate:155, overseaShipping:2800,
    tariff:0, ebayFeeRate:13.25, payoneerFeeRate:2, adFeeRate:3, taxRefund:false,
    destCountry:"アメリカ", shippingMethod:"EMS", trackingNo:"", ebayItemId:"156789012345",
    condition:"良品", status:"出品中", memo:"前玉クリーニング済み。小傷あり。", photoUrl:""
  },
  {
    id: genId(), sku:"SKU-002", name:"Panasonic ヘアアイロン EH-HV60", brand:"Panasonic",
    modelNo:"EH-HV60", category:"ヘアケア機器", purchaseDate:"2025-05-15",
    supplier:"メルカリ", purchasePrice:3200, domesticShipping:0,
    repairCost:800, listPrice:65, salePrice:62, rate:155, overseaShipping:1800,
    tariff:0, ebayFeeRate:13.25, payoneerFeeRate:2, adFeeRate:0, taxRefund:false,
    destCountry:"オーストラリア", shippingMethod:"SAL便", trackingNo:"RJ123456789JP", ebayItemId:"145678901234",
    condition:"動作確認済み", status:"発送済み", memo:"100V専用の注意書き記載済み", photoUrl:""
  },
  {
    id: genId(), sku:"SKU-003", name:"SHISEIDO 資生堂 TSUBAKI ヘアオイル", brand:"SHISEIDO",
    modelNo:"TSUBAKI-OIL-150", category:"コスメ・美容", purchaseDate:"2025-05-20",
    supplier:"コスモス薬品", purchasePrice:880, domesticShipping:0,
    repairCost:0, listPrice:24, salePrice:"", rate:155, overseaShipping:1200,
    tariff:0, ebayFeeRate:13.25, payoneerFeeRate:2, adFeeRate:5, taxRefund:true,
    destCountry:"シンガポール", shippingMethod:"eパケット", trackingNo:"", ebayItemId:"",
    condition:"新品・未開封", status:"撮影待ち", memo:"3本ロット。液漏れ防止ビニール梱包予定。", photoUrl:""
  }
];

const EMPTY_FORM = {
  sku:"", name:"", brand:"", modelNo:"", category:"", purchaseDate:"",
  supplier:"", purchasePrice:"", domesticShipping:"", repairCost:"",
  listPrice:"", salePrice:"", rate:INITIAL_RATE, overseaShipping:"",
  tariff:"", ebayFeeRate:INITIAL_EBAY_FEE, payoneerFeeRate:INITIAL_PAYONEER_FEE,
  adFeeRate:INITIAL_AD_FEE, taxRefund:false,
  destCountry:"", shippingMethod:"", trackingNo:"", ebayItemId:"",
  condition:"", status:"仕入れ済み", memo:"", photoUrl:""
};

// ─── ユーティリティ ─────────────────────────────────────────────────
function fmt(n, digits=0) {
  if (isNaN(n) || n === null || n === undefined) return "—";
  return n.toLocaleString("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtUSD(n) {
  if (!n && n !== 0) return "—";
  return "$" + parseFloat(n).toFixed(2);
}

function toCSV(items) {
  const headers = ["id","sku","name","brand","modelNo","category","purchaseDate","supplier",
    "purchasePrice","domesticShipping","repairCost","listPrice","salePrice","rate",
    "overseaShipping","tariff","ebayFeeRate","payoneerFeeRate","adFeeRate","taxRefund",
    "destCountry","shippingMethod","trackingNo","ebayItemId","condition","status","memo","photoUrl"];
  const escape = v => `"${String(v ?? "").replace(/"/g,'""')}"`;
  return [headers.join(","), ...items.map(r => headers.map(h => escape(r[h])).join(","))].join("\n");
}

function fromCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g,"").trim());
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && !inQ) { inQ = true; }
      else if (c === '"' && inQ && line[i+1] === '"') { cur += '"'; i++; }
      else if (c === '"' && inQ) { inQ = false; }
      else if (c === ',' && !inQ) { vals.push(cur); cur = ""; }
      else { cur += c; }
    }
    vals.push(cur);
    const obj = { id: genId() };
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
    if (!obj.id || obj.id === "") obj.id = genId();
    return obj;
  });
}

// ─── ストレージ・CSV出力（ブラウザ標準API） ─────────────────────────────
// データはブラウザのlocalStorageに保存される（このPC・このブラウザ内に限定）。
async function storageGet(key) {
  return localStorage.getItem(key);
}
async function storageSet(key, value) {
  localStorage.setItem(key, value);
}

// CSVファイルのダウンロード
async function exportCSVFile(csvText, filename) {
  const blob = new Blob([csvText], { type:"text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  a.click(); URL.revokeObjectURL(url);
}

// ─── メインコンポーネント ────────────────────────────────────────────
export default function App() {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("すべて");
  const [filterCategory, setFilterCategory] = useState("すべて");
  const [filterCountry, setFilterCountry] = useState("");
  const [filterTracking, setFilterTracking] = useState("");
  const [sortKey, setSortKey] = useState("purchaseDate");
  const [sortAsc, setSortAsc] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [tab, setTab] = useState("list");
  const [notification, setNotification] = useState(null);
  const csvRef = useRef();

  // 初回起動時：ネイティブストレージ（またはlocalStorage）から読み込み
  useEffect(() => {
    (async () => {
      try {
        const saved = await storageGet(STORAGE_KEY);
        setItems(saved ? JSON.parse(saved) : SAMPLE_ITEMS);
      } catch {
        setItems(SAMPLE_ITEMS);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // itemsが変わるたびに永続化（初回読み込み完了後のみ）
  useEffect(() => {
    if (!loaded) return;
    storageSet(STORAGE_KEY, JSON.stringify(items)).catch(() => {});
  }, [items, loaded]);

  const notify = useCallback((msg, type="success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  const filtered = useMemo(() => {
    let result = items;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(it =>
        [it.name, it.brand, it.modelNo, it.sku, it.category, it.trackingNo].some(v => v?.toLowerCase().includes(q))
      );
    }
    if (filterStatus !== "すべて") result = result.filter(it => it.status === filterStatus);
    if (filterCategory !== "すべて") result = result.filter(it => it.category === filterCategory);
    if (filterCountry) result = result.filter(it => it.destCountry?.includes(filterCountry));
    if (filterTracking) result = result.filter(it => it.trackingNo?.includes(filterTracking));

    result = [...result].sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      const na = parseFloat(va), nb = parseFloat(vb);
      const cmp = (!isNaN(na) && !isNaN(nb)) ? na - nb : String(va).localeCompare(String(vb), "ja");
      return sortAsc ? cmp : -cmp;
    });
    return result;
  }, [items, search, filterStatus, filterCategory, filterCountry, filterTracking, sortKey, sortAsc]);

  // ダッシュボード集計
  const dash = useMemo(() => {
    const total = items.length;
    const listing = items.filter(i => i.status === "出品中").length;
    const sold = items.filter(i => ["売約済み","発送済み"].includes(i.status)).length;
    const returns = items.filter(i => i.status === "返品対応中").length;
    const totalCostSum = items.reduce((s, it) => s + (calcProfit(it).totalCost), 0);
    const expectedSalesSum = items.reduce((s, it) => s + (calcProfit(it).salesJPY), 0);
    const profitSum = items.reduce((s, it) => s + calcProfit(it).profit, 0);
    const rates = items.map(it => calcProfit(it).profitRate).filter(r => !isNaN(r));
    const avgRate = rates.length ? rates.reduce((a,b) => a+b, 0) / rates.length : 0;
    return { total, listing, sold, returns, totalCostSum, expectedSalesSum, profitSum, avgRate };
  }, [items]);

  function handleFormChange(e) {
    const { name, value } = e.target;
    // taxRefund はboolean として保持
    setForm(f => ({ ...f, [name]: name === "taxRefund" ? Boolean(value) : value }));
  }

  function handleSubmit() {
    if (!form.name.trim()) { notify("商品名を入力してください", "error"); return; }
    if (editId) {
      setItems(its => its.map(it => it.id === editId ? { ...form, id: editId } : it));
      notify("商品を更新しました");
    } else {
      setItems(its => [...its, { ...form, id: genId(), sku: form.sku || genId() }]);
      notify("商品を追加しました");
    }
    setForm(EMPTY_FORM); setEditId(null); setFormOpen(false);
  }

  function handleEdit(item) {
    setForm({ ...item });
    setEditId(item.id);
    setFormOpen(true);
    setTimeout(() => document.getElementById("form-top")?.scrollIntoView({ behavior:"smooth" }), 100);
  }

  function handleDuplicate(item) {
    const newItem = { ...item, id: genId(), sku: genId(), trackingNo:"", ebayItemId:"", status:"仕入れ済み" };
    setItems(its => [newItem, ...its]);
    notify("複製しました");
  }

  function handleDeleteConfirm(id) { setDeleteConfirm(id); }
  function handleDelete() {
    setItems(its => its.filter(it => it.id !== deleteConfirm));
    setDeleteConfirm(null); notify("削除しました");
  }

  function clearAll() {
    if (window.confirm("全データを削除しますか？この操作は元に戻せません。")) {
      setItems([]); notify("全データを削除しました", "error");
    }
  }

  async function downloadCSV() {
    try {
      await exportCSVFile(toCSV(items), `ebay_inventory_${new Date().toISOString().slice(0,10)}.csv`);
      notify("CSVをダウンロードしました");
    } catch {
      notify("CSV出力に失敗しました", "error");
    }
  }

  function handleCSVUpload(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = fromCSV(ev.target.result);
        if (!parsed.length) { notify("CSVの読み込みに失敗しました","error"); return; }
        if (window.confirm(`${parsed.length}件のデータを読み込みます。現在のデータと結合しますか？\n（「キャンセル」で上書き）`)) {
          setItems(its => [...its, ...parsed]);
        } else {
          setItems(parsed);
        }
        notify(`${parsed.length}件を読み込みました`);
      } catch { notify("CSVの読み込みに失敗しました","error"); }
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }

  function toggleSort(key) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  const SortTh = ({ k, label }) => (
    <th onClick={() => toggleSort(k)} style={{ cursor:"pointer", whiteSpace:"nowrap", userSelect:"none", padding:"8px 10px", background:"#f7f8fa", borderBottom:"2px solid #e2e8f0", fontSize:13, fontWeight:600, color:"#4a5568" }}>
      {label} {sortKey === k ? (sortAsc ? "▲" : "▼") : <span style={{color:"#cbd5e0"}}>⇅</span>}
    </th>
  );

  if (!loaded) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", fontFamily:"sans-serif", color:"#3665F3" }}>
        読み込み中...
      </div>
    );
  }

  return (
    <div style={{ fontFamily:"'Segoe UI','Hiragino Sans','Meiryo',sans-serif", minHeight:"100vh", background:"#f7f8fa", color:"#2d3748" }}>
      {/* 通知バナー */}
      {notification && (
        <div style={{ position:"fixed", top:"calc(16px + env(safe-area-inset-top))", right:16, left:16, zIndex:9999, padding:"12px 20px", borderRadius:8, background: notification.type==="error"?"#E53E3E":"#38A169", color:"#fff", boxShadow:"0 4px 16px rgba(0,0,0,0.15)", fontSize:14, fontWeight:600, textAlign:"center" }}>
          {notification.msg}
        </div>
      )}

      {/* 削除確認ダイアログ */}
      {deleteConfirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:9998, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"#fff", borderRadius:12, padding:28, maxWidth:340, width:"90%", boxShadow:"0 8px 32px rgba(0,0,0,0.2)" }}>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:12 }}>削除の確認</div>
            <p style={{ color:"#718096", fontSize:14, marginBottom:20 }}>この商品を削除しますか？この操作は元に戻せません。</p>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setDeleteConfirm(null)} style={btnStyle("ghost")}>キャンセル</button>
              <button onClick={handleDelete} style={btnStyle("danger")}>削除する</button>
            </div>
          </div>
        </div>
      )}

      {/* ヘッダー */}
      <header style={{ background:"#fff", borderBottom:"2px solid #3665F3", padding:"calc(8px + env(safe-area-inset-top)) 16px 8px", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", position:"sticky", top:0, zIndex:100, boxShadow:"0 2px 8px rgba(54,101,243,0.08)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:20, fontWeight:800, color:"#3665F3", letterSpacing:-1 }}>eBay</span>
          <span style={{ fontSize:12, fontWeight:700, color:"#718096", marginTop:2 }}>在庫管理ツール</span>
        </div>
        <div style={{ flex:1 }} />
        <button onClick={downloadCSV} style={btnStyle("outline")}>📥 CSV出力</button>
        <label style={{ ...btnStyle("outline"), cursor:"pointer" }}>
          📤 CSV読込
          <input ref={csvRef} type="file" accept=".csv" onChange={handleCSVUpload} style={{ display:"none" }} />
        </label>
        <button onClick={clearAll} style={btnStyle("ghost", { fontSize:12, color:"#E53E3E" })}>🗑 全削除</button>
      </header>

      {/* ダッシュボード */}
      <section style={{ padding:"16px 16px 0" }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))", gap:10 }}>
          {[
            { label:"総在庫数", value:`${dash.total} 件`, color:"#3665F3" },
            { label:"出品中", value:`${dash.listing} 件`, color:"#38A169" },
            { label:"売約済・発送済", value:`${dash.sold} 件`, color:"#DD6B20" },
            { label:"返品対応中", value:`${dash.returns} 件`, color:"#E53E3E" },
            { label:"在庫総コスト", value:`¥${fmt(dash.totalCostSum)}`, color:"#718096" },
            { label:"見込み売上", value:`¥${fmt(dash.expectedSalesSum)}`, color:"#3665F3" },
            { label:"見込み利益", value:`¥${fmt(dash.profitSum)}`, color: dash.profitSum >= 0 ? "#38A169" : "#E53E3E" },
            { label:"平均利益率", value:`${fmt(dash.avgRate, 1)}%`, color: dash.avgRate >= 20 ? "#38A169" : dash.avgRate >= 0 ? "#DD6B20" : "#E53E3E" },
          ].map(d => (
            <div key={d.label} style={{ background:"#fff", borderRadius:10, padding:"12px 14px", boxShadow:"0 1px 4px rgba(0,0,0,0.07)", borderTop:`3px solid ${d.color}` }}>
              <div style={{ fontSize:11, color:"#a0aec0", fontWeight:600, marginBottom:4 }}>{d.label}</div>
              <div style={{ fontSize:18, fontWeight:800, color:d.color }}>{d.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* タブ */}
      <div style={{ display:"flex", gap:0, padding:"16px 16px 0", borderBottom:"none" }}>
        {[["list","📦 商品一覧"], ["guide","💡 使い方"]].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding:"8px 18px", fontSize:13, fontWeight:600, border:"none", cursor:"pointer", borderRadius:"8px 8px 0 0", background: tab===t ? "#fff" : "transparent", color: tab===t ? "#3665F3" : "#718096", borderBottom: tab===t ? "3px solid #3665F3" : "3px solid transparent" }}>
            {label}
          </button>
        ))}
      </div>

      <main style={{ padding:"0 16px calc(40px + env(safe-area-inset-bottom))" }}>
        {tab === "guide" && <GuideTab />}
        {tab === "list" && (
          <>
            {/* 商品追加フォーム */}
            <div id="form-top" style={{ background:"#fff", borderRadius:10, border:"1px solid #e2e8f0", marginTop:16, overflow:"hidden" }}>
              <div onClick={() => setFormOpen(o => !o)} style={{ display:"flex", alignItems:"center", gap:8, padding:"14px 18px", cursor:"pointer", userSelect:"none", borderBottom: formOpen ? "1px solid #e2e8f0" : "none" }}>
                <span style={{ fontWeight:700, color:"#3665F3", fontSize:14 }}>
                  {editId ? "✏️ 商品を編集" : "＋ 商品を追加"}
                </span>
                <span style={{ flex:1 }} />
                <span style={{ color:"#a0aec0", fontSize:18 }}>{formOpen ? "▲" : "▼"}</span>
              </div>
              {formOpen && (
                <div style={{ padding:"16px 18px" }}>
                  <ItemForm form={form} onChange={handleFormChange} />
                  <div style={{ display:"flex", gap:10, marginTop:16, flexWrap:"wrap" }}>
                    <button onClick={handleSubmit} style={btnStyle("primary")}>{editId ? "更新する" : "登録する"}</button>
                    <button onClick={() => { setForm(EMPTY_FORM); setEditId(null); setFormOpen(false); }} style={btnStyle("ghost")}>キャンセル</button>
                  </div>
                </div>
              )}
            </div>

            {/* 検索・絞り込み */}
            <div style={{ background:"#fff", borderRadius:10, border:"1px solid #e2e8f0", marginTop:12, padding:"14px 16px" }}>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 商品名・ブランド・型番・SKU・カテゴリ・追跡番号" style={{ ...inputStyle, flex:"1 1 200px", minWidth:0 }} />
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={inputStyle}>
                  <option value="すべて">全ステータス</option>
                  {STATUS_LIST.map(s => <option key={s}>{s}</option>)}
                </select>
                <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={inputStyle}>
                  <option value="すべて">全カテゴリ</option>
                  {CATEGORY_LIST.map(c => <option key={c}>{c}</option>)}
                </select>
                <input value={filterCountry} onChange={e => setFilterCountry(e.target.value)} placeholder="販売先国で絞込" style={{ ...inputStyle, width:130 }} />
                <input value={filterTracking} onChange={e => setFilterTracking(e.target.value)} placeholder="追跡番号で絞込" style={{ ...inputStyle, width:140 }} />
                <button onClick={() => { setSearch(""); setFilterStatus("すべて"); setFilterCategory("すべて"); setFilterCountry(""); setFilterTracking(""); }} style={btnStyle("ghost", { fontSize:12 })}>リセット</button>
              </div>
              <div style={{ marginTop:8, fontSize:12, color:"#a0aec0" }}>{filtered.length}件 / 全{items.length}件</div>
            </div>

            {/* 商品一覧 */}
            <div style={{ marginTop:12 }}>
              {filtered.length === 0 ? (
                <div style={{ textAlign:"center", padding:60, color:"#a0aec0", fontSize:15 }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>📭</div>
                  商品が見つかりません。検索条件を変えるか、商品を追加してください。
                </div>
              ) : (
                <>
                  {/* PCテーブル */}
                  <div className="pc-table" style={{ overflowX:"auto", borderRadius:10, border:"1px solid #e2e8f0", background:"#fff", display:"block" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", minWidth:900 }}>
                      <thead>
                        <tr>
                          {[
                            ["sku","SKU"],["name","商品名"],["category","カテゴリ"],["status","ステータス"],
                            ["purchasePrice","仕入価格"],["listPrice","出品USD"],["salePrice","販売USD"],
                            ["profit","利益"],["profitRate","利益率"],["destCountry","販売先"],
                            ["shippingMethod","発送方法"],["trackingNo","追跡番号"]
                          ].map(([k,l]) => <SortTh key={k} k={k} label={l} />)}
                          <th style={{ padding:"8px 10px", background:"#f7f8fa", borderBottom:"2px solid #e2e8f0", fontSize:13, fontWeight:600, color:"#4a5568", whiteSpace:"nowrap" }}>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(item => {
                          const p = calcProfit(item);
                          return (
                            <tr key={item.id} style={{ borderBottom:"1px solid #e2e8f0" }}>
                              <td style={td}>{item.photoUrl && <img src={item.photoUrl} alt="" style={{ width:28, height:28, objectFit:"cover", borderRadius:4, marginRight:4, verticalAlign:"middle" }} onError={e => e.target.style.display="none"} />}{item.sku}</td>
                              <td style={{ ...td, maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontWeight:600 }}>{item.name}</td>
                              <td style={td}><span style={{ fontSize:11, background:"#EBF4FF", color:"#3182CE", padding:"2px 7px", borderRadius:99, whiteSpace:"nowrap" }}>{item.category || "—"}</span></td>
                              <td style={td}><StatusBadge s={item.status} /></td>
                              <td style={{ ...td, textAlign:"right" }}>¥{fmt(item.purchasePrice)}</td>
                              <td style={{ ...td, textAlign:"right" }}>{fmtUSD(item.listPrice)}</td>
                              <td style={{ ...td, textAlign:"right" }}>{item.salePrice ? fmtUSD(item.salePrice) : <span style={{ color:"#a0aec0", fontSize:11 }}>未入力</span>}</td>
                              <td style={{ ...td, textAlign:"right", fontWeight:700, color: p.profit >= 0 ? "#38A169" : "#E53E3E" }}>
                                {p.profit >= 0 ? "+" : ""}¥{fmt(p.profit)}
                                {p.isEstimate && <span style={{ fontSize:10, color:"#a0aec0", marginLeft:3 }}>※見込</span>}
                              </td>
                              <td style={{ ...td, textAlign:"right" }}>
                                <ProfitBadge rate={p.profitRate} />
                              </td>
                              <td style={td}>{item.destCountry || "—"}</td>
                              <td style={td}>{item.shippingMethod || "—"}</td>
                              <td style={td}><span style={{ fontFamily:"monospace", fontSize:11 }}>{item.trackingNo || "—"}</span></td>
                              <td style={{ ...td, whiteSpace:"nowrap" }}>
                                <button onClick={() => handleEdit(item)} style={btnStyle("outline", { fontSize:11, padding:"3px 8px" })}>編集</button>
                                {" "}
                                <button onClick={() => handleDuplicate(item)} style={btnStyle("ghost", { fontSize:11, padding:"3px 8px" })}>複製</button>
                                {" "}
                                <button onClick={() => handleDeleteConfirm(item.id)} style={btnStyle("danger", { fontSize:11, padding:"3px 8px" })}>削除</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* スマホカード */}
                  <div className="sp-cards">
                    {filtered.map(item => {
                      const p = calcProfit(item);
                      return (
                        <div key={item.id} style={{ background:"#fff", borderRadius:10, border:"1px solid #e2e8f0", marginBottom:10, padding:14, boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                            {item.photoUrl && <img src={item.photoUrl} alt="" style={{ width:44, height:44, objectFit:"cover", borderRadius:6 }} onError={e => e.target.style.display="none"} />}
                            <div>
                              <div style={{ fontWeight:700, fontSize:14 }}>{item.name}</div>
                              <div style={{ fontSize:11, color:"#718096" }}>{item.sku} • {item.brand}</div>
                            </div>
                            <div style={{ flex:1 }} />
                            <StatusBadge s={item.status} />
                          </div>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, fontSize:12, color:"#4a5568" }}>
                            <div>仕入: <b>¥{fmt(item.purchasePrice)}</b></div>
                            <div>出品: <b>{fmtUSD(item.listPrice)}</b></div>
                            <div>販売: <b>{item.salePrice ? fmtUSD(item.salePrice) : <span style={{ color:"#a0aec0" }}>未入力</span>}</b></div>
                            <div>
                              利益: <b style={{ color: p.profit >= 0 ? "#38A169" : "#E53E3E" }}>
                                {p.profit >= 0 ? "+" : ""}¥{fmt(p.profit)}
                                {p.isEstimate && <span style={{ fontSize:10, color:"#a0aec0" }}>(見込)</span>}
                              </b>
                            </div>
                            <div>利益率: <ProfitBadge rate={p.profitRate} /></div>
                            <div>販売先: <b>{item.destCountry || "—"}</b></div>
                            {item.trackingNo && <div style={{ gridColumn:"span 2" }}>追跡: <span style={{ fontFamily:"monospace" }}>{item.trackingNo}</span></div>}
                          </div>
                          <div style={{ display:"flex", gap:8, marginTop:10 }}>
                            <button onClick={() => handleEdit(item)} style={btnStyle("outline", { flex:1, fontSize:12 })}>✏️ 編集</button>
                            <button onClick={() => handleDuplicate(item)} style={btnStyle("ghost", { flex:1, fontSize:12 })}>📋 複製</button>
                            <button onClick={() => handleDeleteConfirm(item.id)} style={btnStyle("danger", { flex:1, fontSize:12 })}>🗑 削除</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ─── 商品フォーム ──────────────────────────────────────────────────
function ItemForm({ form, onChange }) {
  const [openSections, setOpenSections] = useState({
    basic: true, purchase: true, sale: true, fee: false, shipping: false
  });

  function toggleSection(key) {
    setOpenSections(s => ({ ...s, [key]: !s[key] }));
  }

  function Section({ skey, title, badge, children }) {
    const open = openSections[skey];
    return (
      <div style={{ marginBottom:12, border:"1px solid #e2e8f0", borderRadius:8, overflow:"hidden" }}>
        <div
          onClick={() => toggleSection(skey)}
          style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", cursor:"pointer", userSelect:"none", background: open ? "#EBF4FF" : "#f7f8fa", borderBottom: open ? "1px solid #e2e8f0" : "none" }}
        >
          <span style={{ fontSize:12, fontWeight:700, color:"#3665F3", flex:1 }}>{title}</span>
          {badge && <span style={{ fontSize:11, color:"#718096", fontWeight:400 }}>{badge}</span>}
          <span style={{ color:"#a0aec0", fontSize:14 }}>{open ? "▲" : "▼"}</span>
        </div>
        {open && (
          <div style={{ padding:"12px 14px", display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(190px, 1fr))", gap:10 }}>
            {children}
          </div>
        )}
      </div>
    );
  }

  const F = ({ label, name, type="text", placeholder, hint, children }) => (
    <div>
      <label style={{ display:"block", fontSize:11, fontWeight:600, color:"#718096", marginBottom:3 }}>
        {label}
        {hint && <span style={{ fontWeight:400, marginLeft:4, color:"#a0aec0" }}>{hint}</span>}
      </label>
      {children ?? <input type={type} name={name} value={form[name] ?? ""} onChange={onChange} placeholder={placeholder} style={inputStyle} />}
    </div>
  );

  return (
    <div>
      <Section skey="basic" title="📋 基本情報">
        <F label="管理番号 / SKU" name="sku" placeholder="空欄で自動採番" />
        <F label="商品名 *" name="name" placeholder="例: Canon EF 50mm f1.4" />
        <F label="ブランド" name="brand" placeholder="例: Canon" />
        <F label="型番" name="modelNo" placeholder="例: EF50/1.4" />
        <F label="カテゴリ" name="category">
          <select name="category" value={form.category} onChange={onChange} style={inputStyle}>
            <option value="">選択してください</option>
            {CATEGORY_LIST.map(c => <option key={c}>{c}</option>)}
          </select>
        </F>
        <F label="商品状態" name="condition" placeholder="例: 良品・動作確認済み" />
        <F label="ステータス" name="status">
          <select name="status" value={form.status} onChange={onChange} style={inputStyle}>
            {STATUS_LIST.map(s => <option key={s}>{s}</option>)}
          </select>
        </F>
        <F label="写真URL" name="photoUrl" placeholder="https://..." />
      </Section>

      <Section skey="purchase" title="🛒 仕入れ情報">
        <F label="仕入日" name="purchaseDate" type="date" />
        <F label="仕入れ先" name="supplier" placeholder="例: ハードオフ、メルカリ" />
        <F label="仕入れ価格（円）" name="purchasePrice" type="number" placeholder="0" />
        <F label="国内送料・手数料（円）" name="domesticShipping" type="number" placeholder="0" />
        <F label="修理・清掃費（円）" name="repairCost" type="number" placeholder="0" />
      </Section>

      <Section skey="sale" title="💰 出品・販売情報">
        <F label="出品価格（USD）" name="listPrice" type="number" placeholder="0.00" hint="→ 見込み利益に使用" />
        <F label="販売価格（USD）" name="salePrice" type="number" placeholder="0.00" hint="→ 確定利益に使用" />
        <F label="為替レート（円/USD）" name="rate" type="number" placeholder="155" />
        <F label="海外送料（円）" name="overseaShipping" type="number" placeholder="0" />
        <F label="関税・DDP負担額（円）" name="tariff" type="number" placeholder="0" />
        <F label="eBay Item ID" name="ebayItemId" placeholder="例: 156789012345" />
      </Section>

      <Section skey="fee" title="⚙️ 手数料・税金設定" badge="初期値は変更不要">
        <div>
          <label style={{ display:"block", fontSize:11, fontWeight:600, color:"#718096", marginBottom:3 }}>
            eBay手数料率（%）<span style={{ fontWeight:400, marginLeft:4, color:"#a0aec0" }}>通常 13.25%</span>
          </label>
          <input type="number" name="ebayFeeRate" value={form.ebayFeeRate ?? ""} onChange={onChange} step="0.01" min="0" max="100" style={inputStyle} />
        </div>
        <div>
          <label style={{ display:"block", fontSize:11, fontWeight:600, color:"#718096", marginBottom:3 }}>
            Payoneer手数料率（%）<span style={{ fontWeight:400, marginLeft:4, color:"#a0aec0" }}>通常 2%</span>
          </label>
          <input type="number" name="payoneerFeeRate" value={form.payoneerFeeRate ?? ""} onChange={onChange} step="0.01" min="0" max="100" style={inputStyle} />
        </div>
        <div>
          <label style={{ display:"block", fontSize:11, fontWeight:600, color:"#718096", marginBottom:3 }}>
            広告費率（%）<span style={{ fontWeight:400, marginLeft:4, color:"#a0aec0" }}>Promoted Listings</span>
          </label>
          <input type="number" name="adFeeRate" value={form.adFeeRate ?? ""} onChange={onChange} step="0.01" min="0" max="100" style={inputStyle} />
        </div>
        <div>
          <label style={{ display:"block", fontSize:11, fontWeight:600, color:"#718096", marginBottom:6 }}>
            消費税還付<span style={{ fontWeight:400, marginLeft:4, color:"#a0aec0" }}>（税込仕入の場合）</span>
          </label>
          <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
            <div
              onClick={() => onChange({ target: { name:"taxRefund", value: !form.taxRefund } })}
              style={{ width:44, height:24, borderRadius:12, position:"relative", cursor:"pointer", background: form.taxRefund ? "#3665F3" : "#cbd5e0", transition:"background .2s", flexShrink:0 }}
            >
              <div style={{ position:"absolute", top:3, left: form.taxRefund ? 22 : 3, width:18, height:18, borderRadius:9, background:"#fff", boxShadow:"0 1px 3px rgba(0,0,0,0.2)", transition:"left .2s" }} />
            </div>
            <span style={{ fontSize:13, color: form.taxRefund ? "#3665F3" : "#718096", fontWeight:600 }}>
              {form.taxRefund ? "還付あり（仕入価格の約9.09%を控除）" : "還付なし"}
            </span>
          </label>
        </div>
      </Section>

      <Section skey="shipping" title="🚚 発送・配送情報">
        <F label="販売先国" name="destCountry" placeholder="例: アメリカ、シンガポール" />
        <F label="発送方法" name="shippingMethod" placeholder="例: EMS、eパケット" />
        <F label="追跡番号" name="trackingNo" placeholder="例: RJ123456789JP" />
      </Section>

      <div style={{ marginTop:4 }}>
        <label style={{ display:"block", fontSize:11, fontWeight:600, color:"#718096", marginBottom:3 }}>メモ</label>
        <textarea name="memo" value={form.memo ?? ""} onChange={onChange} rows={3} placeholder="状態の詳細、注意事項など" style={{ ...inputStyle, resize:"vertical", minHeight:72, fontFamily:"inherit" }} />
      </div>

      <ProfitPreview form={form} />
    </div>
  );
}

function ProfitPreview({ form }) {
  const p = calcProfit(form);
  if (!form.listPrice && !form.salePrice) return null;
  const { breakdown: b } = p;
  const profitColor  = p.profit     >= 0   ? "#38A169" : "#E53E3E";
  const rateColor    = p.profitRate >= 20  ? "#38A169" : p.profitRate >= 0 ? "#DD6B20" : "#E53E3E";
  const borderColor  = p.profit     >= 0   ? "#9AE6B4" : "#FEB2B2";
  const bgColor      = p.profit     >= 0   ? "#F0FFF4" : "#FFF5F5";
  const headerColor  = p.profit     >= 0   ? "#276749" : "#9B2C2C";

  const row = (label, value, opts = {}) => (
    <div style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:"1px solid #f0f0f0", fontSize:13, ...opts.style }}>
      <span style={{ color: opts.labelColor || "#4a5568" }}>{label}</span>
      <span style={{ fontWeight: opts.bold ? 700 : 500, color: opts.valueColor || "#2d3748" }}>{value}</span>
    </div>
  );

  return (
    <div style={{ background: bgColor, border:`1px solid ${borderColor}`, borderRadius:8, padding:"12px 16px", marginTop:14 }}>
      <div style={{ fontWeight:700, fontSize:13, marginBottom:10, color: headerColor }}>
        {p.isEstimate ? "📊 見込み利益プレビュー（出品価格ベース）" : "✅ 確定利益プレビュー"}
      </div>

      {/* 売上 */}
      {row("売上円換算", `¥${fmt(p.salesJPY)}`, { bold:true })}

      {/* コスト明細 */}
      <div style={{ margin:"6px 0 2px", fontSize:11, fontWeight:700, color:"#a0aec0", letterSpacing:.5 }}>コスト内訳</div>
      {row("　仕入価格",     `¥${fmt(b.purchase)}`)}
      {row("　国内送料・手数料", `¥${fmt(b.domestic)}`)}
      {b.repair   > 0 && row("　修理・清掃費",  `¥${fmt(b.repair)}`)}
      {row("　海外送料",     `¥${fmt(b.oversea)}`)}
      {b.tariff   > 0 && row("　関税",          `¥${fmt(b.tariff)}`)}
      {row("　eBay手数料",  `¥${fmt(b.ebayFee)}`,     { labelColor:"#DD6B20" })}
      {b.adFee    > 0 && row("　広告費",        `¥${fmt(b.adFee)}`,     { labelColor:"#DD6B20" })}
      {row("　Payoneer手数料", `¥${fmt(b.payoneerFee)}`, { labelColor:"#DD6B20" })}
      {b.taxRefund > 0 && row("　消費税還付",   `－¥${fmt(b.taxRefund)}`, { labelColor:"#38A169" })}

      {/* 合計 */}
      <div style={{ marginTop:6 }}>
        {row("総コスト", `¥${fmt(p.totalCost)}`, { bold:true })}
      </div>

      {/* 利益 */}
      <div style={{ marginTop:8, padding:"8px 0 0", borderTop:`2px solid ${borderColor}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ fontWeight:700, fontSize:14, color: headerColor }}>
          {p.profit >= 0 ? "利益" : "損失"}
        </span>
        <div style={{ textAlign:"right" }}>
          <span style={{ fontWeight:800, fontSize:18, color: profitColor }}>
            {p.profit >= 0 ? "+" : ""}¥{fmt(p.profit)}
          </span>
          <span style={{ fontWeight:700, fontSize:14, color: rateColor, marginLeft:10 }}>
            {fmt(p.profitRate, 1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── 使い方タブ ──────────────────────────────────────────────────
function GuideTab() {
  return (
    <div style={{ background:"#fff", borderRadius:10, border:"1px solid #e2e8f0", padding:"24px 20px", marginTop:16, maxWidth:700 }}>
      <h2 style={{ fontSize:17, fontWeight:800, marginBottom:16, color:"#3665F3" }}>💡 eBay在庫管理ツール 使い方</h2>
      {[
        ["📦 商品の追加", "「＋ 商品を追加」ボタンをタップしてフォームを展開。各項目を入力して「登録する」で保存。SKUは空欄のまま登録すると自動採番されます。"],
        ["✏️ 編集・複製", "一覧の「編集」ボタンで既存商品を編集。「複製」でステータスをリセットした状態でコピー登録できます（ロット仕入れ時に便利）。"],
        ["🔍 検索・絞り込み", "商品名・ブランド・型番・SKU・カテゴリ・追跡番号でキーワード検索。ステータス・カテゴリ・販売先国・追跡番号でさらに絞り込めます。"],
        ["💰 利益計算の仕組み", "「販売価格USD」入力済 → 確定利益を計算。未入力の場合は「出品価格USD」で見込み利益を算出（※マークで表示）。フォーム入力中もリアルタイムでプレビューします。"],
        ["📊 利益率の見方", "緑（20%以上）= 優良 / 黄（0〜20%）= 要確認 / 赤（マイナス）= 赤字警告。ダッシュボードで全体の傾向も一目で確認できます。"],
        ["📥📤 CSV入出力", "「CSV出力」で端末の共有シートからファイルを保存・送信できます。「CSV読込」でインポートし（結合 or 上書き選択可）。"],
        ["💾 データ保存", "データは端末内に自動保存されます。アプリを閉じても消えません。「全削除」でリセット可能（要確認）。"],
        ["📱 画面表示", "スマホ・タブレットの画面サイズに応じてレイアウトが自動で切り替わります。"],
      ].map(([title, desc]) => (
        <div key={title} style={{ marginBottom:16, paddingBottom:16, borderBottom:"1px solid #f0f0f0" }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>{title}</div>
          <div style={{ fontSize:13, color:"#4a5568", lineHeight:1.7 }}>{desc}</div>
        </div>
      ))}
      <div style={{ background:"#EBF8FF", borderRadius:8, padding:"12px 14px", fontSize:12, color:"#2C5282" }}>
        <b>💡 Tips:</b> 「複製」機能を使うと同一商品を複数SKUで管理できます。また、為替レートは商品ごとに設定できるので、仕入れ時と売上確定時で変えることも可能です。
      </div>
    </div>
  );
}

// ─── サブコンポーネント ──────────────────────────────────────────────
function StatusBadge({ s }) {
  const color = STATUS_COLOR[s] || "#718096";
  return (
    <span style={{ fontSize:11, fontWeight:700, background: color + "20", color, padding:"3px 8px", borderRadius:99, whiteSpace:"nowrap", border:`1px solid ${color}40` }}>
      {s}
    </span>
  );
}

function ProfitBadge({ rate }) {
  const color = rate >= 20 ? "#38A169" : rate >= 0 ? "#DD6B20" : "#E53E3E";
  const bg = rate >= 20 ? "#F0FFF4" : rate >= 0 ? "#FFFAF0" : "#FFF5F5";
  return (
    <span style={{ fontSize:12, fontWeight:700, background: bg, color, padding:"2px 7px", borderRadius:99, border:`1px solid ${color}40` }}>
      {fmt(rate, 1)}%
    </span>
  );
}

// ─── スタイル定数 ──────────────────────────────────────────────────
const inputStyle = {
  width:"100%", padding:"8px 10px", fontSize:13, border:"1px solid #e2e8f0",
  borderRadius:6, outline:"none", background:"#fff", boxSizing:"border-box",
  fontFamily:"inherit", color:"#2d3748"
};

const td = {
  padding:"9px 10px", fontSize:13, color:"#2d3748", verticalAlign:"middle"
};

function btnStyle(variant, extra={}) {
  const base = { border:"none", borderRadius:6, padding:"7px 14px", fontWeight:700, cursor:"pointer", fontSize:13, transition:"opacity .15s", fontFamily:"inherit" };
  const variants = {
    primary: { background:"#3665F3", color:"#fff" },
    outline: { background:"#fff", color:"#3665F3", border:"1px solid #3665F3" },
    ghost: { background:"#f7f8fa", color:"#4a5568", border:"1px solid #e2e8f0" },
    danger: { background:"#E53E3E", color:"#fff" },
  };
  return { ...base, ...variants[variant], ...extra };
}
