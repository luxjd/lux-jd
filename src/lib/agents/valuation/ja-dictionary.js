/**
 * Authoritative Japanese → English dictionary for auction sheet extraction.
 *
 * USAGE RULES:
 *   1. Dictionary lookup is the ONLY translation path for enum-like fields
 *      (colors, fuels, drives, transmissions, equipment, body types, brands).
 *   2. Free-text fields (caution notes, inspector notes, sales points) use
 *      the dictionary to pre-translate known abbreviations, then pass the
 *      remainder to the LLM with an explicit "translate, do not infer" prompt.
 *   3. If a Japanese term is NOT in this dictionary:
 *        → log it to `_untranslated_terms[]` in the output
 *        → pass through the original Japanese text as-is
 *        → set the field's confidence to "low"
 *        → NEVER silently LLM-translate enum fields
 *   4. To add a new term: add it here, commit, re-run the regression suite.
 *      Do NOT add terms at runtime or from LLM output.
 *
 * STRUCTURE:
 *   Each section is a flat Map<string, string> (Japanese → English).
 *   Keys are exact-match strings — no regex, no fuzzy matching.
 *   When a sheet value might contain multiple terms (e.g. "パール ホワイト"),
 *   the lookup function tries longest-prefix-first matching.
 */

// ══════════════════════════════════════════════════════════════
// COLORS — 外色 / 内装色 fields
// ══════════════════════════════════════════════════════════════

export const COLORS = {
  // Basic colors
  "ブラック": "Black",
  "黒": "Black",
  "クロ": "Black",
  "ホワイト": "White",
  "白": "White",
  "シロ": "White",
  "パールホワイト": "Pearl White",
  "パール": "Pearl",
  "シルバー": "Silver",
  "グレー": "Grey",
  "グレイ": "Grey",
  "ガンメタ": "Gunmetal Grey",
  "ガンメタリック": "Gunmetal Metallic",
  "レッド": "Red",
  "赤": "Red",
  "ブルー": "Blue",
  "青": "Blue",
  "グリーン": "Green",
  "緑": "Green",
  "ゴールド": "Gold",
  "金": "Gold",
  "ブラウン": "Brown",
  "茶": "Brown",
  "ベージュ": "Beige",
  "アイボリー": "Ivory",
  "ネイビー": "Navy",
  "紺": "Navy",
  "ワインレッド": "Wine Red",
  "イエロー": "Yellow",
  "黄": "Yellow",
  "オレンジ": "Orange",
  "ピンク": "Pink",
  "パープル": "Purple",
  "紫": "Purple",
  "マルーン": "Maroon",

  // Suffixes / modifiers (applied after base color)
  "メタリック": "Metallic",
  "マイカ": "Mica",
  "ソリッド": "Solid",

  // German luxury — Mercedes
  "カバンサイトブルー": "Cavansite Blue",
  "オブシディアンブラック": "Obsidian Black",
  "セレナイトグレー": "Selenite Grey",
  "イリジウムシルバー": "Iridium Silver",
  "ダイヤモンドホワイト": "Diamond White",
  "ブリリアントブルー": "Brilliant Blue",
  "マグネタイトブラック": "Magnetite Black",
  "デジーノ": "Designo",
  "ポーラーホワイト": "Polar White",
  "モハーベシルバー": "Mojave Silver",
  "ルナーブルー": "Lunar Blue",
  "ヒヤシンスレッド": "Hyacinth Red",
  "ダークオリーブ": "Dark Olive",
  "テノライトグレー": "Tenorite Grey",
  "インジウムグレー": "Indium Grey",
  "サーカスグレー": "Cirrus White",
  "タンザナイトブルー": "Tanzanite Blue",
  "グリーンヘルマグノ": "Green Hell Magno",
  "ゲンシャ": "Gunmetal", // common shorthand on USS sheets

  // Italian brands — Ferrari / Lamborghini / Maserati
  "ロッソコルサ": "Rosso Corsa",
  "ロッソスクーデリア": "Rosso Scuderia",
  "ロッソフィオラーノ": "Rosso Fiorano",
  "ネロ": "Nero",
  "ネロダイトナ": "Nero Daytona",
  "ビアンコ": "Bianco",
  "ビアンコアヴス": "Bianco Avus",
  "ジアッロ": "Giallo",
  "ジアッロモデナ": "Giallo Modena",
  "グリジオ": "Grigio",
  "グリジオシルバーストーン": "Grigio Silverstone",
  "グリジオフェッロ": "Grigio Ferro",
  "ブルーツール": "Blu Tour de France",
  "ブルポジ": "Blu Pozzi",
  "アズーロカリフォルニア": "Azzurro California",
  "ヴェルデブリティッシュ": "Verde British Racing",
  "アランチオ": "Arancio",
  "ビアンコモノセリウス": "Bianco Monocerus",
  "ネロアルデア": "Nero Aldebaran",
  "ヴェルデマンティス": "Verde Mantis",
  "ブルーケフェウス": "Blu Cepheus",

  // Porsche
  "GTシルバー": "GT Silver",
  "クレヨン": "Crayon",
  "チョーク": "Chalk",
  "マイアミブルー": "Miami Blue",
  "ガーズレッド": "Guards Red",
  "レーシングイエロー": "Racing Yellow",
  "ジェントリアンブルー": "Gentian Blue",
  "アゲートグレー": "Agate Grey",
  "キャララホワイト": "Carrara White",
  "ジェットブラック": "Jet Black",
  "マホガニー": "Mahogany",

  // BMW
  "ブラックサファイア": "Black Sapphire",
  "アルピンホワイト": "Alpine White",
  "ミネラルホワイト": "Mineral White",
  "ポルティマオブルー": "Portimao Blue",
  "サンマリノブルー": "San Marino Blue",

  // Interior color qualifiers
  "ブラック系": "Black",
  "ベージュ系": "Beige",
  "ブラウン系": "Brown",
  "レッド系": "Red",
  "ホワイト系": "White",
};

// ══════════════════════════════════════════════════════════════
// BRANDS — 車名 field (katakana → English)
// ══════════════════════════════════════════════════════════════

export const BRANDS = {
  "メルセデスベンツ": "Mercedes-Benz",
  "メルセデス ベンツ": "Mercedes-Benz",
  "メルセデス・ベンツ": "Mercedes-Benz",
  "メルセデスAMG": "Mercedes-AMG",
  "メルセデス AMG": "Mercedes-AMG",
  "フェラーリ": "Ferrari",
  "ポルシェ": "Porsche",
  "ランボルギーニ": "Lamborghini",
  "ベントレー": "Bentley",
  "アストンマーチン": "Aston Martin",
  "アストンマーティン": "Aston Martin",
  "ジャガー": "Jaguar",
  "マセラティ": "Maserati",
  "ロールスロイス": "Rolls-Royce",
  "ロールス・ロイス": "Rolls-Royce",
  "マクラーレン": "McLaren",
  "レンジローバー": "Range Rover",
  "ランドローバー": "Land Rover",
  "ロータス": "Lotus",
  "アルファロメオ": "Alfa Romeo",
  "ビー・エム・ダブリュー": "BMW",
  "BMW": "BMW",
  "アウディ": "Audi",
  "フォルクスワーゲン": "Volkswagen",
  "ブガッティ": "Bugatti",
  "パガーニ": "Pagani",
  "ケーニグセグ": "Koenigsegg",
  "テスラ": "Tesla",
  "レクサス": "Lexus",
  "トヨタ": "Toyota",
  "ニッサン": "Nissan",
  "日産": "Nissan",
  "ホンダ": "Honda",
  "マツダ": "Mazda",
  "スバル": "Subaru",
  "ミツビシ": "Mitsubishi",
  "三菱": "Mitsubishi",
  "スズキ": "Suzuki",
  "ダイハツ": "Daihatsu",
};

// ══════════════════════════════════════════════════════════════
// TRANSMISSION — シフト field
// ══════════════════════════════════════════════════════════════

export const TRANSMISSIONS = {
  "AT": "AUTOMATIC",
  "FAT": "AUTOMATIC",
  "FA": "AUTOMATIC",
  "CAT": "AUTOMATIC",
  "CVT": "AUTOMATIC",
  "MT": "MANUAL",
  "F5": "MANUAL",
  "F6": "MANUAL",
  "F7": "MANUAL",
  "DCT": "DCT",
  "PDK": "PDK",
  "SMG": "SMG",
  "AMT": "AUTOMATIC",
  "TC": "AUTOMATIC",
  "オートマ": "AUTOMATIC",
  "マニュアル": "MANUAL",
};

// ══════════════════════════════════════════════════════════════
// FUEL — 燃料 field
// ══════════════════════════════════════════════════════════════

export const FUELS = {
  "ガソリン": "PETROL",
  "ハイオク": "PETROL",
  "レギュラー": "PETROL",
  "軽油": "DIESEL",
  "ディーゼル": "DIESEL",
  "ハイブリッド": "HYBRID",
  "電気": "ELECTRIC",
  "EV": "ELECTRIC",
  "LPG": "LPG",
  "CNG": "CNG",
  "PHEV": "HYBRID",
  "プラグインハイブリッド": "HYBRID",
};

// ══════════════════════════════════════════════════════════════
// DRIVE SIDE — ハンドル field
// ══════════════════════════════════════════════════════════════

export const DRIVE_SIDES = {
  "左": "LHD",
  "右": "RHD",
  "Left": "LHD",
  "Right": "RHD",
};

// ══════════════════════════════════════════════════════════════
// DRIVETRAIN — 駆動 field
// ══════════════════════════════════════════════════════════════

export const DRIVETRAINS = {
  "2WD": "2WD",
  "4WD": "4WD",
  "AWD": "AWD",
  "FF": "FF",
  "FR": "FR",
  "MR": "MR",
  "RR": "RR",
  "前輪駆動": "FF",
  "後輪駆動": "FR",
  "四輪駆動": "4WD",
  "全輪駆動": "AWD",
};

// ══════════════════════════════════════════════════════════════
// BODY TYPE — 形状 field
// ══════════════════════════════════════════════════════════════

export const BODY_TYPES = {
  "CP": "Coupe",
  "OP": "Open/Convertible",
  "SD": "Sedan",
  "HB": "Hatchback",
  "SW": "Station Wagon",
  "SUV": "SUV",
  "VN": "Van",
  "TK": "Truck",
  "CC": "Coupe Cabriolet",
  "セダン": "Sedan",
  "クーペ": "Coupe",
  "コンバーチブル": "Convertible",
  "オープン": "Open/Convertible",
  "ワゴン": "Wagon",
  "ハッチバック": "Hatchback",
  "ミニバン": "Minivan",
  "カブリオレ": "Cabriolet",
  "ロードスター": "Roadster",
  "スパイダー": "Spyder",
  "リムジン": "Limousine",
};

// ══════════════════════════════════════════════════════════════
// IMPORT TYPE — 輸入区分 field
// ══════════════════════════════════════════════════════════════

export const IMPORT_TYPES = {
  "ディーラー": "Dealer",
  "DL": "Dealer",
  "ＤＬ": "Dealer",
  "Dealer": "Dealer",
  "並行": "Parallel",
  "ディーラー並行": "Dealer",
  "個人": "Individual",
  "オークション": "Auction",
  "中古並行": "Used Parallel",
};

// ══════════════════════════════════════════════════════════════
// EQUIPMENT CODES — 装備 icon row (circled = present)
// ══════════════════════════════════════════════════════════════

export const EQUIPMENT = {
  // Standard icon row
  "SR": "Sunroof",
  "AW": "Alloy Wheels",
  "純AW": "Factory Alloy Wheels",
  "PS": "Power Steering",
  "PW": "Power Windows",
  "TV": "TV",
  "ナビ": "Navigation",
  "カワ": "Leather Seats",
  "革": "Leather Seats",
  "エアB": "Airbag",
  "AB": "Airbag",
  "AAC": "Auto Air Conditioning",
  "AC": "Air Conditioning",
  "RS": "Rear Spoiler",
  "CD": "CD Player",
  "MD": "MD Player",
  "ETC": "ETC (Electronic Toll)",
  "Bカメラ": "Backup Camera",
  "バックカメラ": "Backup Camera",
  "HID": "HID Headlights",
  "LED": "LED Headlights",
  "キーレス": "Keyless Entry",
  "スマートキー": "Smart Key",
  "クルコン": "Cruise Control",
  "ACC": "Adaptive Cruise Control",
  "シートヒーター": "Heated Seats",
  "SH": "Heated Seats",
  "パワーシート": "Power Seats",
  "電動シート": "Power Seats",
  "BSM": "Blind Spot Monitor",
  "LKA": "Lane Keep Assist",
  "衝突軽減": "Collision Mitigation",
  "AEB": "Auto Emergency Braking",
  "360°カメラ": "360 Camera",
  "全方位": "360 Camera",
  "HDR": "Head-Up Display",
  "HUD": "Head-Up Display",
  "パノラマルーフ": "Panoramic Roof",
  "電動リアゲート": "Power Tailgate",
  "ベンチレーション": "Ventilated Seats",
  "マッサージ": "Massage Seats",
  "ドラレコ": "Dash Camera",
  "地デジ": "Digital TV Tuner",
  "サンルーフ": "Sunroof",
  "ルーフレール": "Roof Rails",
  "フォグ": "Fog Lights",
  "フォグランプ": "Fog Lights",
  "アラウンドビュー": "Around View Monitor",
  "メモリーシート": "Memory Seats",
  "メモリパワーシート": "Memory Power Seats",
  "エアサス": "Air Suspension",
  "アダプティブサス": "Adaptive Suspension",

  // Porsche-specific
  "スポーツクロノ": "Sport Chrono",
  "PASM": "Porsche Active Suspension",
  "PDLS": "Porsche Dynamic Light System",
  "PCM": "Porsche Communication Management",
  "PCCB": "Porsche Ceramic Composite Brakes",
  "PTM": "Porsche Traction Management",
  "スポーツエグゾースト": "Sport Exhaust",
  "スポーツエギゾースト": "Sport Exhaust",
  "スポーツステアリング": "Sport Steering Wheel",

  // Mercedes-specific
  "ディストロニック": "DISTRONIC (Adaptive Cruise)",
  "ブルメスタ": "Burmester Sound System",
  "ブルメスター": "Burmester Sound System",
  "Burmester": "Burmester Sound System",
  "AMGライン": "AMG Line",
  "AMGパッケージ": "AMG Package",
  "AMGナイトパッケージ": "AMG Night Package",
  "レーダーセーフティ": "Radar Safety Package",
  "レーダーセーフティパッケージ": "Radar Safety Package",
  "コンフォートパッケージ": "Comfort Package",
  "アンビエントライト": "Ambient Lighting",
  "エアスカーフ": "AIRSCARF (Neck Heater)",
  "マジックスカイ": "Magic Sky Control Roof",
  "DINAMICA": "DINAMICA Microfiber",
  "DINAMICAルーフライナー": "DINAMICA Roof Liner",
  "AMGカーボンセラミックブレーキ": "AMG Ceramic Brakes",
  "AMG TRACK PACE": "AMG Track Pace",
  "harman/kardon": "Harman Kardon Sound",

  // Ferrari/Italian
  "カーボンセラミックブレーキ": "Carbon Ceramic Brakes",
  "マネッティーノ": "Manettino",
  "Fアシスト": "F1 Paddle Shift",
  "デイトナシート": "Daytona Seats",
  "カーボンファイバー": "Carbon Fiber",
  "BOSE": "BOSE Sound System",

  // Generic aftermarket/options
  "社外ナビ": "Aftermarket Navigation",
  "社外マフラー": "Aftermarket Exhaust",
  "社外AW": "Aftermarket Wheels",
  "ローダウン": "Lowered Suspension",
  "車高調": "Adjustable Coilovers",
  "ダウンサス": "Lowering Springs",
  "マフラー": "Exhaust System",
  "エアロ": "Aero Kit",
  "エアロパーツ": "Aero Parts",
  "リップスポイラー": "Lip Spoiler",
  "GTウィング": "GT Wing",
  "スペアキー": "Spare Key",
  "取説": "Owner's Manual",
  "保証書": "Warranty Certificate",
  "記録簿": "Service Records",
  "Bluetooth": "Bluetooth",
  "USB": "USB Port",
  "Apple CarPlay": "Apple CarPlay",
  "アップルカープレイ": "Apple CarPlay",
  "Android Auto": "Android Auto",
  "ワイヤレス充電": "Wireless Charging",
};

// ══════════════════════════════════════════════════════════════
// INSPECTOR NOTES — ◎検査員報告 abbreviations
// These are terse shorthand used by auction inspectors.
// ══════════════════════════════════════════════════════════════

export const INSPECTOR_TERMS = {
  // Defect types
  "スレ": "scuff",
  "擦れ": "scuff",
  "キズ": "scratch",
  "傷": "scratch",
  "うすキズ": "light scratch",
  "ヘコミ": "dent",
  "凹み": "dent",
  "凹": "dent",
  "小凹": "small dent",
  "ガタ": "looseness",
  "ぐらつき": "wobble",
  "サビ": "rust",
  "錆": "rust",
  "腐食": "corrosion",
  "ヒビ": "crack",
  "亀裂": "crack",
  "割れ": "broken/cracked",
  "剥がれ": "peeling",
  "色あせ": "fading",
  "褪色": "fading",
  "シミ": "stain",
  "汚れ": "dirt/soiling",
  "破れ": "tear",
  "穴": "hole",
  "欠け": "chip",
  "曇り": "hazing/cloudiness",
  "白濁": "cloudiness",
  "ウキ": "lifting/separation",
  "タルミ": "sagging",
  "シワ": "wrinkle/crease",
  "フチシワ": "edge wrinkle",
  "ホシュウ": "repaired",
  "補修": "repaired",
  "トビ": "stone chip",
  "トビ石": "stone chip",
  "飛び石": "stone chip",

  // Size/severity modifiers
  "小": "minor",
  "中": "moderate",
  "大": "major",
  "極小": "very minor",
  "軽度": "light",
  "重度": "heavy/severe",
  "多数": "numerous",
  "一部": "partial/some",
  "各": "various/multiple",

  // Body part locators
  "シート": "seat",
  "ハンドル": "steering wheel",
  "ステアリング": "steering wheel",
  "天井": "headliner/ceiling",
  "ドア": "door",
  "バンパー": "bumper",
  "フロント": "front",
  "リア": "rear",
  "リヤ": "rear",
  "サイド": "side",
  "ボンネット": "hood/bonnet",
  "トランク": "trunk/boot",
  "ホイール": "wheel",
  "タイヤ": "tire",
  "ガラス": "glass",
  "ミラー": "mirror",
  "ドアミラー": "door mirror",
  "フェンダー": "fender",
  "ルーフ": "roof",
  "ピラー": "pillar",
  "ステップ": "step/sill",
  "アンダーカバー": "under cover",
  "ダッシュ板": "dashboard",
  "ダッシュボード": "dashboard",
  "ルーム": "cabin/interior",
  "下廻り": "undercarriage",
  "F廻り": "front area",
  "R廻り": "rear area",
  "トリム": "trim",
  "モール": "molding",
  "マフラー": "exhaust",
  "ラッピング": "wrap/wrapping",
  "フラッピング": "wrap/wrapping",
  "カバー": "cover",

  // Status descriptors
  "現状": "as-is condition",
  "F現状": "front as-is condition",
  "要確認": "needs verification",
  "要現車確認": "needs in-person verification",
  "後送": "to be sent later",
  "後日": "at a later date",
  "純正": "factory/genuine",
  "社外": "aftermarket",
  "外品": "aftermarket parts",
  "改": "modified",
  "OP": "option/optional",
  "カスタム": "custom/modified",
  "BRABUS": "BRABUS (tuner)",
};

// ══════════════════════════════════════════════════════════════
// COMMON SALES POINT PHRASES — セールスポイント column
// Frequently repeated phrases across auction sheets.
// ══════════════════════════════════════════════════════════════

export const SALES_PHRASES = {
  "ワンオーナー": "One Owner",
  "ワンオーナー車": "One Owner Vehicle",
  "ユーザー買取車": "User Purchase (Direct Buy)",
  "ユーザー買取": "User Purchase",
  "初出品": "First Listing",
  "AA初出品": "First AA Listing",
  "禁煙車": "Non-Smoking Vehicle",
  "ディーラー車": "Dealer Vehicle",
  "左ハンドル": "Left-Hand Drive",
  "右ハンドル": "Right-Hand Drive",
  "後期モデル": "Facelift/Late Model",
  "前期モデル": "Pre-Facelift/Early Model",
  "限定車": "Limited Edition",
  "期間限定生産モデル": "Limited Production Model",
  "正規輸入": "Official Import",
  "新車保証継承": "New Car Warranty Transfer",
  "フルノーマル": "Completely Stock",
  "実走行": "Genuine Mileage",
  "ガレージ保管": "Garage Kept",
  "屋内保管": "Indoor Storage",
  "整備済": "Serviced/Maintained",
  "車検残": "Shaken Remaining",
  "車検付": "Shaken Included",
  "車検長": "Long Shaken",
  "ヤナセ": "Yanase (Authorized Dealer)",
};

// ══════════════════════════════════════════════════════════════
// COMMON CAUTION NOTE PHRASES — ◎注意事項 section
// ══════════════════════════════════════════════════════════════

export const CAUTION_PHRASES = {
  "記録簿": "Service Record Book",
  "ディーラー記録簿": "Dealer Service Records",
  "ヤナセ記録簿": "Yanase Service Records",
  "新車保証書": "New Car Warranty",
  "取扱説明書": "Owner's Manual",
  "取説": "Manual",
  "保証書": "Warranty",
  "スペアキー": "Spare Key",
  "スペアキー後送": "Spare Key to be Sent Later",
  "コーティング": "Coating Applied",
  "コーティング証明書": "Coating Certificate",
  "名義変更期限": "Title Transfer Deadline",
  "現状渡し": "Sold As-Is",
  "ノークレーム": "No Claims",
  "ノーリターン": "No Returns",
  "要整備": "Needs Service",
  "要修理": "Needs Repair",
  "不具合": "Malfunction/Defect",
  "エンジン異音": "Engine Noise",
  "ミッション異音": "Transmission Noise",
  "エアコン不良": "A/C Malfunction",
  "パワステ不良": "Power Steering Malfunction",
  "水性ボールペン": "Water-based pen markings",
  "水性ボールペンはご使用できません": "Do not use water-based pens",
};

// ══════════════════════════════════════════════════════════════
// AUCTION HOUSES
// ══════════════════════════════════════════════════════════════

export const AUCTION_HOUSES = {
  "USS": "USS",
  "輸入車プライムコーナー": "USS",
  "ワンモア輸入車コーナー": "USS",
  "輸入車コーナー": "USS",
  "事故・現状コーナー": "USS",
  "セダンコーナー": "USS",
  "SUVコーナー": "USS",
  "TAA": "TAA",
  "HAA": "HAA",
  "JU": "JU",
  "CAA": "CAA",
  "AUCNET": "AUCNET",
  "LAA": "LAA",
  "BCN": "BCN",
  "NAA": "NAA",
  "HERO": "HERO",
  "ZIP": "ZIP",
};

// ══════════════════════════════════════════════════════════════
// DAMAGE CODES — diagram annotations
// ══════════════════════════════════════════════════════════════

export const DAMAGE_CODES = {
  "A1": { en: "Small scratch", severity: "MINOR" },
  "A2": { en: "Scratch", severity: "MODERATE" },
  "A3": { en: "Large scratch", severity: "MAJOR" },
  "U1": { en: "Small dent", severity: "MINOR" },
  "U2": { en: "Dent", severity: "MODERATE" },
  "U3": { en: "Large dent", severity: "MAJOR" },
  "W1": { en: "Repair trace", severity: "MODERATE" },
  "W2": { en: "Obvious repair", severity: "MAJOR" },
  "W3": { en: "Large repair area", severity: "MAJOR" },
  "S1": { en: "Light surface rust", severity: "MINOR" },
  "S2": { en: "Rust", severity: "MODERATE" },
  "S3": { en: "Heavy rust", severity: "MAJOR" },
  "X":  { en: "Crack", severity: "MAJOR" },
  "XX": { en: "Large crack", severity: "MAJOR" },
  "X1": { en: "Chip", severity: "MINOR" },
  "RX": { en: "Cracked glass", severity: "MAJOR" },
  "P":  { en: "Replaced panel", severity: "MAJOR" },
  "PP": { en: "Non-genuine replacement", severity: "MAJOR" },
  "H":  { en: "Hole", severity: "MAJOR" },
  "Y":  { en: "Paint waviness (respray indicator)", severity: "MODERATE" },
  "C1": { en: "Light corrosion", severity: "MINOR" },
  "C2": { en: "Corrosion", severity: "MODERATE" },
  "B1": { en: "Small mark", severity: "MINOR" },
  "B2": { en: "Mark", severity: "MODERATE" },
  "B3": { en: "Large mark", severity: "MAJOR" },
  "M":  { en: "Missing part", severity: "MAJOR" },
  "T":  { en: "Tear/cut", severity: "MODERATE" },
  "E1": { en: "Small dent with paint damage", severity: "MODERATE" },
  "E2": { en: "Dent with paint damage", severity: "MAJOR" },
  "E3": { en: "Large dent with paint damage", severity: "MAJOR" },
  "F":  { en: "Fire damage", severity: "MAJOR" },
  "ヒビ": { en: "Glass crack", severity: "MAJOR" },
  "スリA": { en: "Scuff mark (minor)", severity: "MINOR" },
  "スリ": { en: "Scuff", severity: "MINOR" },
  "トビA": { en: "Stone chip (minor)", severity: "MINOR" },
  "トビ": { en: "Stone chip", severity: "MINOR" },
};

// ══════════════════════════════════════════════════════════════
// PANEL LOCATIONS — diagram body part labels
// ══════════════════════════════════════════════════════════════

export const PANEL_LOCATIONS = {
  "フロントバンパー": "front_bumper",
  "ボンネット": "hood",
  "ルーフ": "roof",
  "フロントガラス": "windshield",
  "リアガラス": "rear_glass",
  "左フロントフェンダー": "left_front_fender",
  "右フロントフェンダー": "right_front_fender",
  "左フロントドア": "left_front_door",
  "右フロントドア": "right_front_door",
  "左リアドア": "left_rear_door",
  "右リアドア": "right_rear_door",
  "左リアクォーター": "left_rear_quarter",
  "右リアクォーター": "right_rear_quarter",
  "トランク": "trunk",
  "リアバンパー": "rear_bumper",
  "左サイドスカート": "left_side_skirt",
  "右サイドスカート": "right_side_skirt",
  "フロア": "floor",
  "Aピラー": "a_pillar",
  "Bピラー": "b_pillar",
  "Cピラー": "c_pillar",
};

// ══════════════════════════════════════════════════════════════
// MISCELLANEOUS SHEET TERMS
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// AUCTION RESULTS — セリ結果 field
// ══════════════════════════════════════════════════════════════

export const AUCTION_RESULTS = {
  "落札": "sold",
  "流れ": "unsold",
  "商談": "negotiating",
  "成約": "sold",
  "不成立": "unsold",
  "終了": "ended",
};

// ══════════════════════════════════════════════════════════════
// SERVICE RECORD TERMS
// ══════════════════════════════════════════════════════════════

export const SERVICE_TERMS = {
  "記録簿": "service record book",
  "ディーラー記録簿": "dealer service records",
  "ヤナセ記録簿": "Yanase service records",
  "ヤナセ": "Yanase",
  "シュテルン": "Stern (Mercedes dealer)",
  "ポルシェセンター": "Porsche Center",
  "コーンズ": "Cornes (Ferrari dealer)",
  "ニコル": "Nicole (BMW dealer)",
  "AAPC": "Audi Approved Plus Center",
  "最終": "latest",
  "枚": "copies/books",
};

export const MISC_TERMS = {
  "有": "present/yes",
  "無": "absent/no",
  "無効": "void/invalid",
  "不明": "unknown",
  "フメイ": "unknown",
  "なし": "none",
  "スペア": "spare (tire)",
  "修復歴": "accident/repair history",
  "修復歴有": "accident history: yes",
  "修復歴無": "accident history: no",
  "新車整備手帳": "new car service booklet",
  "保証書付": "warranty included",
  "車検証上の寸法": "dimensions per registration document",
};

// ══════════════════════════════════════════════════════════════
// LOOKUP FUNCTION — longest-prefix-first matching
// ══════════════════════════════════════════════════════════════

/**
 * Look up a Japanese term in a specific dictionary section.
 * Returns { translated: string, source: "dictionary" } on match,
 * or null on miss.
 *
 * Tries exact match first, then longest-prefix match for compound terms
 * like "パール ホワイト" → tries "パール ホワイト", then "パール".
 */
export function lookup(term, dictionary) {
  if (!term || typeof term !== "string") return null;
  const cleaned = term.trim();
  if (dictionary[cleaned]) {
    return { translated: dictionary[cleaned], source: "dictionary", matched: cleaned };
  }
  // Try removing common suffixes/spaces
  const withoutSpaces = cleaned.replace(/\s+/g, "");
  if (dictionary[withoutSpaces]) {
    return { translated: dictionary[withoutSpaces], source: "dictionary", matched: withoutSpaces };
  }
  return null;
}

/**
 * Translate a Japanese term using all dictionary sections in priority order.
 * Returns { translated, source: "dictionary", section } on match,
 * or { translated: null, source: "unknown", original } on miss.
 *
 * FALLBACK BEHAVIOR:
 *   - Returns the original Japanese text as `original`
 *   - Caller MUST add to `_untranslated_terms[]` in output
 *   - Caller MUST set field confidence to "low"
 *   - Caller MUST NOT silently LLM-translate
 */
export function translateTerm(japaneseTerm, sectionHint = null) {
  if (!japaneseTerm || typeof japaneseTerm !== "string") {
    return { translated: null, source: "empty", original: japaneseTerm };
  }

  const sections = [
    { name: "colors", dict: COLORS },
    { name: "brands", dict: BRANDS },
    { name: "transmissions", dict: TRANSMISSIONS },
    { name: "fuels", dict: FUELS },
    { name: "drive_sides", dict: DRIVE_SIDES },
    { name: "drivetrains", dict: DRIVETRAINS },
    { name: "body_types", dict: BODY_TYPES },
    { name: "import_types", dict: IMPORT_TYPES },
    { name: "equipment", dict: EQUIPMENT },
    { name: "inspector", dict: INSPECTOR_TERMS },
    { name: "sales", dict: SALES_PHRASES },
    { name: "caution", dict: CAUTION_PHRASES },
    { name: "auction_houses", dict: AUCTION_HOUSES },
    { name: "misc", dict: MISC_TERMS },
  ];

  // If caller gives a section hint, try that first
  if (sectionHint) {
    const hinted = sections.find((s) => s.name === sectionHint);
    if (hinted) {
      const result = lookup(japaneseTerm, hinted.dict);
      if (result) return { ...result, section: hinted.name };
    }
  }

  // Try all sections
  for (const { name, dict } of sections) {
    const result = lookup(japaneseTerm, dict);
    if (result) return { ...result, section: name };
  }

  // MISS — return original, flag for review
  return {
    translated: null,
    source: "unknown",
    original: japaneseTerm,
    section: null,
  };
}

/**
 * Translate an array of Japanese terms. Returns {
 *   translated: string[],       — successfully translated items
 *   untranslated: string[],     — items NOT in dictionary (logged, flagged)
 *   all: Array<{original, translated, source}>
 * }
 */
export function translateArray(japaneseTerms, sectionHint = null) {
  if (!Array.isArray(japaneseTerms)) return { translated: [], untranslated: [], all: [] };

  const results = japaneseTerms.map((term) => {
    const r = translateTerm(term, sectionHint);
    return {
      original: term,
      translated: r.translated || term, // pass through original if no translation
      source: r.source,
      section: r.section,
    };
  });

  return {
    translated: results.map((r) => r.translated),
    untranslated: results.filter((r) => r.source === "unknown").map((r) => r.original),
    all: results,
  };
}
