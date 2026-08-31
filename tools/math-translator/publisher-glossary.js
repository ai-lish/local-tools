/*
 * Public terminology seed for Hong Kong mathematics materials.
 * These are short, generic terminology pairs and editorial hints only;
 * this file is not an official publisher glossary or a textbook excerpt.
 */
const MATH_GLOSSARY = {
  meta: {
    name: "Public Hong Kong Mathematics Terminology Seed",
    version: "0.1-public",
    updatedAt: "2026-08-31",
    uiLabel: "公開數學詞庫",
    promptLabel: "Public mathematics terminology glossary",
    heroText: "以公開數學常見用語整理翻譯結果；在同一頁搜尋例子、改寫題目、練習 EMI 或核對 HKEAA 用字，同時守住每一個公式、變數與 LaTeX 結構。",
    workspaceText: "目前為離線示範模式：內建公開數學詞庫會翻譯常見術語，辨識到的數學公式與 LaTeX 指令保持原樣。",
    termsTitle: "數學常見用詞",
    termsDescription: "搜尋英文、繁體中文或題目指令；按「套用」即可把詞條放回翻譯工作區。",
    filterNote: "按分類、年級和信心標籤整理",
    noteLabel: "按上下文核對香港數學用語及 house style。",
    sourceNote: "公開版只包含通用短詞對及編輯提示，不代表任何出版社的官方譯法。"
  },
  entries: [
    {
      id: "directed-number",
      category: "數與代數",
      sourceTerm: "directed number",
      preferred: "有向數",
      aliases: ["directed numbers"],
      note: "描述帶有正負方向的數；與 number line 一起出現時保持術語一致。",
      publishers: ["通用數學用語"],
      levels: ["S1", "S2"],
      confidence: "高"
    },
    {
      id: "number-line",
      category: "數與代數",
      sourceTerm: "number line",
      preferred: "數線",
      aliases: [],
      note: "表示數值位置及次序的直線。",
      publishers: ["通用數學用語"],
      levels: ["S1"],
      confidence: "高"
    },
    {
      id: "opposite-number",
      category: "數與代數",
      sourceTerm: "opposite number",
      preferred: "相反數",
      aliases: ["opposite numbers"],
      note: "兩個數的和為零時，互為相反數。",
      publishers: ["通用數學用語"],
      levels: ["S1"],
      confidence: "高"
    },
    {
      id: "integers",
      category: "數與代數",
      sourceTerm: "integers",
      preferred: "整數",
      aliases: ["integer"],
      note: "包括正整數、零及負整數。",
      publishers: ["通用數學用語"],
      levels: ["S1", "S2"],
      confidence: "高"
    },
    {
      id: "rational-number",
      category: "數與代數",
      sourceTerm: "rational number",
      preferred: "有理數",
      aliases: ["rational numbers"],
      note: "可表示為兩個整數之商的數。",
      publishers: ["通用數學用語"],
      levels: ["S2", "S3"],
      confidence: "高"
    },
    {
      id: "irrational-number",
      category: "數與代數",
      sourceTerm: "irrational number",
      preferred: "無理數",
      aliases: ["irrational numbers"],
      note: "不能表示為兩個整數之商的實數。",
      publishers: ["通用數學用語"],
      levels: ["S2", "S3"],
      confidence: "高"
    },
    {
      id: "percentage",
      category: "數與代數",
      sourceTerm: "percentage",
      preferred: "百分率",
      aliases: ["percentages", "percent"],
      note: "按語境區分 percentage、percentage point 及百分比的用法。",
      publishers: ["通用數學用語"],
      levels: ["S1", "S2"],
      confidence: "中"
    },
    {
      id: "write-down",
      category: "題目指令",
      sourceTerm: "write down",
      preferred: "寫出",
      aliases: ["write down the"],
      note: "常見題目指令；按語境接「答案」或「……的值」。",
      publishers: ["通用題目指令"],
      levels: ["S1", "S2"],
      confidence: "高"
    },
    {
      id: "compare-values",
      category: "題目指令",
      sourceTerm: "compare the values of",
      preferred: "比較……的值",
      aliases: ["compare the value of"],
      note: "如需表達大小關係，可配合不等號使用。",
      publishers: ["通用題目指令"],
      levels: ["S1", "S2"],
      confidence: "高"
    },
    {
      id: "inequality-sign",
      category: "題目指令",
      sourceTerm: "inequality sign",
      preferred: "不等號",
      aliases: ["inequality signs"],
      note: "包括 <、>、≤、≥ 等符號；符號本身不翻譯。",
      publishers: ["通用題目指令"],
      levels: ["S1", "S2"],
      confidence: "高"
    },
    {
      id: "ascending-order",
      category: "題目指令",
      sourceTerm: "ascending order",
      preferred: "遞增次序",
      aliases: ["arrange in ascending order"],
      note: "指由小至大排列。",
      publishers: ["通用題目指令"],
      levels: ["S1", "S2"],
      confidence: "高"
    },
    {
      id: "solve",
      category: "題目指令",
      sourceTerm: "solve",
      preferred: "解",
      aliases: ["solve for", "solve the equation"],
      note: "solve an equation 可譯作「解方程」。",
      publishers: ["通用題目指令"],
      levels: ["S1", "S2", "S3"],
      confidence: "高"
    },
    {
      id: "answer",
      category: "題目指令",
      sourceTerm: "answer",
      preferred: "答案",
      aliases: ["answers"],
      note: "通常指最後結果；與 solution 的解題步驟有別。",
      publishers: ["通用題目指令"],
      levels: ["S1", "S2", "S3"],
      confidence: "高"
    },
    {
      id: "equation",
      category: "數與代數",
      sourceTerm: "equation",
      preferred: "方程",
      aliases: ["equations"],
      note: "數學語境中按上下文區分 equation 與 identity。",
      publishers: ["通用數學用語"],
      levels: ["S1", "S2", "S3"],
      confidence: "高"
    },
    {
      id: "linear-equation-one-variable",
      category: "數與代數",
      sourceTerm: "linear equation in one variable",
      preferred: "一元一次方程",
      aliases: ["linear equations in one variable"],
      note: "one variable 及 first degree 的資訊均保留。",
      publishers: ["通用數學用語"],
      levels: ["S1", "S2"],
      confidence: "高"
    },
    {
      id: "simultaneous-equations",
      category: "數與代數",
      sourceTerm: "simultaneous equations",
      preferred: "聯立方程",
      aliases: ["system of equations"],
      note: "指需要同時滿足的兩個或以上方程。",
      publishers: ["通用數學用語"],
      levels: ["S2", "S3"],
      confidence: "高"
    },
    {
      id: "factorization",
      category: "數與代數",
      sourceTerm: "factorization",
      preferred: "因式分解",
      aliases: ["factorisation", "factorize", "factorise"],
      note: "factorise an expression 可譯作「把代數式因式分解」。",
      publishers: ["通用數學用語"],
      levels: ["S2", "S3"],
      confidence: "高"
    },
    {
      id: "quadratic-equation",
      category: "數與代數",
      sourceTerm: "quadratic equation",
      preferred: "二次方程",
      aliases: ["quadratic equations"],
      note: "保留 quadratic 的次數資訊。",
      publishers: ["通用數學用語"],
      levels: ["S3", "S4"],
      confidence: "高"
    },
    {
      id: "function",
      category: "函數與圖像",
      sourceTerm: "function",
      preferred: "函數",
      aliases: ["functions"],
      note: "按上下文保留輸入、輸出及定義域的關係。",
      publishers: ["通用數學用語"],
      levels: ["S3", "S4", "S5"],
      confidence: "高"
    },
    {
      id: "domain-range",
      category: "函數與圖像",
      sourceTerm: "domain and range",
      preferred: "定義域和值域",
      aliases: ["domain", "range"],
      note: "domain 是輸入值的集合，range 是相應輸出值的集合。",
      publishers: ["通用數學用語"],
      levels: ["S3", "S4", "S5"],
      confidence: "高"
    },
    {
      id: "coordinate",
      category: "幾何與圖形",
      sourceTerm: "coordinate",
      preferred: "坐標",
      aliases: ["coordinates", "coordinate plane"],
      note: "香港繁體中文數學語境常用「坐標」字形。",
      publishers: ["通用數學用語"],
      levels: ["S1", "S2", "S3"],
      confidence: "高"
    },
    {
      id: "symmetry-transformation",
      category: "幾何與圖形",
      sourceTerm: "symmetry and transformation",
      preferred: "對稱及變換",
      aliases: ["symmetry and transformations"],
      note: "保留 symmetry 與 transformation 兩個概念。",
      publishers: ["通用數學用語"],
      levels: ["S1", "S2"],
      confidence: "高"
    },
    {
      id: "congruence-similarity",
      category: "幾何與圖形",
      sourceTerm: "congruence and similarity",
      preferred: "全等及相似",
      aliases: ["congruent and similar"],
      note: "congruent 與 similar 不應混用。",
      publishers: ["通用數學用語"],
      levels: ["S2", "S3"],
      confidence: "高"
    },
    {
      id: "area-volume",
      category: "度量",
      sourceTerm: "area and volume",
      preferred: "面積和體積",
      aliases: [],
      note: "按幾何對象區分 area、surface area 及 volume。",
      publishers: ["通用數學用語"],
      levels: ["S1", "S2"],
      confidence: "高"
    },
    {
      id: "statistics-probability",
      category: "統計與機率",
      sourceTerm: "statistics and probability",
      preferred: "統計與機率",
      aliases: ["statistics", "probability"],
      note: "在香港數學語境中 probability 通常譯作「機率」。",
      publishers: ["通用數學用語"],
      levels: ["S1", "S2", "S3"],
      confidence: "高"
    },
    {
      id: "mean-median-mode",
      category: "統計與機率",
      sourceTerm: "mean, median and mode",
      preferred: "平均數、中位數和眾數",
      aliases: ["mean median mode"],
      note: "保留三種集中趨勢量數的區別。",
      publishers: ["通用數學用語"],
      levels: ["S1", "S2"],
      confidence: "高"
    },
    {
      id: "derivative-function",
      category: "微積分",
      sourceTerm: "derivative of a function",
      preferred: "函數的導數",
      aliases: ["derivative", "derivatives of functions"],
      note: "derivative 指導數；如描述過程，可按上下文使用 differentiation。",
      publishers: ["通用數學用語"],
      levels: ["S4", "S5", "S6"],
      confidence: "高"
    },
    {
      id: "differentiation",
      category: "微積分",
      sourceTerm: "differentiation",
      preferred: "求導法",
      aliases: ["differentiation rules", "differential calculus"],
      note: "描述求導的運算或方法；公式保持原樣。",
      publishers: ["通用數學用語"],
      levels: ["S4", "S5", "S6"],
      confidence: "高"
    },
    {
      id: "tangent-slope",
      category: "微積分",
      sourceTerm: "slope of the tangent to a curve at a point",
      preferred: "曲線在某點的切線的斜率",
      aliases: ["slope of the tangent", "tangent slope"],
      note: "保留 curve、tangent 及 point 三層關係。",
      publishers: ["通用數學用語"],
      levels: ["S4", "S5", "S6"],
      confidence: "高"
    },
    {
      id: "addition-product-quotient-rules",
      category: "微積分",
      sourceTerm: "addition, product and quotient rules",
      preferred: "加法法則、積法則及商法則",
      aliases: ["product rule", "quotient rule"],
      note: "按所述運算保留法則名稱；不要刪去 product 或 quotient。",
      publishers: ["通用數學用語"],
      levels: ["S4", "S5", "S6"],
      confidence: "高"
    },
    {
      id: "chain-rule",
      category: "微積分",
      sourceTerm: "chain rule",
      preferred: "鏈式法則",
      aliases: ["chain rule for differentiation"],
      note: "複合函數求導的法則。",
      publishers: ["通用數學用語"],
      levels: ["S5", "S6"],
      confidence: "高"
    },
    {
      id: "second-derivative",
      category: "微積分",
      sourceTerm: "second derivative",
      preferred: "二階導數",
      aliases: ["second derivatives"],
      note: "保留 second 的階數資訊。",
      publishers: ["通用數學用語"],
      levels: ["S5", "S6"],
      confidence: "高"
    },
    {
      id: "integral",
      category: "微積分",
      sourceTerm: "integral",
      preferred: "積分",
      aliases: ["integrals", "integration"],
      note: "按上下文區分 integral、definite integral 及 indefinite integral。",
      publishers: ["通用數學用語"],
      levels: ["S5", "S6"],
      confidence: "高"
    },
    {
      id: "limit",
      category: "微積分",
      sourceTerm: "limit",
      preferred: "極限",
      aliases: ["limits", "limit representation"],
      note: "數學極限及相關表示法均保留公式結構。",
      publishers: ["通用數學用語"],
      levels: ["S4", "S5", "S6"],
      confidence: "高"
    },
    {
      id: "radian-measure",
      category: "三角學",
      sourceTerm: "radian measure",
      preferred: "弧度法",
      aliases: ["radian"],
      note: "按語境區分弧度單位與弧度法。",
      publishers: ["通用數學用語"],
      levels: ["S4", "S5", "S6"],
      confidence: "高"
    },
    {
      id: "trigonometric-functions",
      category: "三角學",
      sourceTerm: "trigonometric functions",
      preferred: "三角函數",
      aliases: ["trigonometric function"],
      note: "包括 sine、cosine 及 tangent 等函數。",
      publishers: ["通用數學用語"],
      levels: ["S4", "S5", "S6"],
      confidence: "高"
    },
    {
      id: "trigonometric-identities",
      category: "三角學",
      sourceTerm: "trigonometric identities",
      preferred: "三角恆等式",
      aliases: ["trigonometric identity"],
      note: "identity 與 equation 的數學含義不同。",
      publishers: ["通用數學用語"],
      levels: ["S4", "S5", "S6"],
      confidence: "高"
    },
    {
      id: "binomial-theorem",
      category: "數與代數",
      sourceTerm: "binomial theorem",
      preferred: "二項式定理",
      aliases: [],
      note: "保留 theorem 的定理層級。",
      publishers: ["通用數學用語"],
      levels: ["S5", "S6"],
      confidence: "高"
    },
    {
      id: "mathematical-induction",
      category: "數與代數",
      sourceTerm: "mathematical induction",
      preferred: "數學歸納法",
      aliases: ["principle of mathematical induction"],
      note: "常見證明方法名稱。",
      publishers: ["通用數學用語"],
      levels: ["S5", "S6"],
      confidence: "高"
    },
    {
      id: "factorial-combination",
      category: "數與代數",
      sourceTerm: "factorial and combination",
      preferred: "階乘和組合",
      aliases: ["factorial", "combination", "combinations"],
      note: "在排列組合語境區分 factorial 與 combination。",
      publishers: ["通用數學用語"],
      levels: ["S5", "S6"],
      confidence: "高"
    }
  ]
};

MATH_GLOSSARY.entries.push(
  { id: "learning-objective", category: "課程與教學", sourceTerm: "learning objective", preferred: "學習目標", aliases: ["learning objectives"], note: "教案中描述學生在課堂後能夠展示的知識、技能或理解。", publishers: ["通用教學用語"], levels: ["S1", "S2", "S3", "S4", "S5", "S6"], confidence: "高" },
  { id: "success-criteria", category: "課程與教學", sourceTerm: "success criteria", preferred: "成功準則", aliases: ["success criterion"], note: "用來判斷學生是否達到學習目標的可觀察準則。", publishers: ["通用教學用語"], levels: ["S1", "S2", "S3", "S4", "S5", "S6"], confidence: "中" },
  { id: "prior-knowledge", category: "課程與教學", sourceTerm: "prior knowledge", preferred: "先備知識", aliases: ["已有知識"], note: "開始新課題前預期學生已掌握的知識或技能。", publishers: ["通用教學用語"], levels: ["S1", "S2", "S3", "S4", "S5", "S6"], confidence: "高" },
  { id: "key-vocabulary", category: "課程與教學", sourceTerm: "key vocabulary", preferred: "關鍵詞彙", aliases: ["key words"], note: "課堂或單元需要學生理解及使用的詞語。", publishers: ["通用教學用語"], levels: ["S1", "S2", "S3", "S4", "S5", "S6"], confidence: "高" },
  { id: "common-misconception", category: "課程與教學", sourceTerm: "common misconception", preferred: "常見誤解", aliases: ["common misconceptions"], note: "學生常見而且需要透過教學澄清的錯誤理解。", publishers: ["通用教學用語"], levels: ["S1", "S2", "S3", "S4", "S5", "S6"], confidence: "高" },
  { id: "scheme-of-work", category: "課程與教學", sourceTerm: "scheme of work", preferred: "教學進度表", aliases: ["scheme of learning"], note: "按學期或單元編排課堂內容、時間及評量的文件。", publishers: ["通用教學用語"], levels: ["S1", "S2", "S3", "S4", "S5", "S6"], confidence: "高" },
  { id: "lesson-sequence", category: "課程與教學", sourceTerm: "lesson sequence", preferred: "課堂流程", aliases: ["lesson structure"], note: "課堂活動的先後次序，例如熱身、示範、練習及總結。", publishers: ["通用教學用語"], levels: ["S1", "S2", "S3", "S4", "S5", "S6"], confidence: "高" },
  { id: "starter-activity", category: "課程與教學", sourceTerm: "starter activity", preferred: "熱身活動", aliases: ["starter"], note: "課堂開始時用來引入課題或提取已有知識的活動。", publishers: ["通用教學用語"], levels: ["S1", "S2", "S3", "S4", "S5", "S6"], confidence: "中" },
  { id: "plenary", category: "課程與教學", sourceTerm: "plenary", preferred: "總結活動", aliases: ["lesson plenary"], note: "課堂結束時整理重點、檢查理解或引出下一步的活動。", publishers: ["通用教學用語"], levels: ["S1", "S2", "S3", "S4", "S5", "S6"], confidence: "中" },
  { id: "worked-example", category: "課程與教學", sourceTerm: "worked example", preferred: "示範例題", aliases: ["worked examples"], note: "展示完整解題步驟並說明每一步原因的例題。", publishers: ["通用教學用語"], levels: ["S1", "S2", "S3", "S4", "S5", "S6"], confidence: "高" },
  { id: "guided-practice", category: "課程與教學", sourceTerm: "guided practice", preferred: "引導練習", aliases: ["guided practise"], note: "教師提供提示或共同示範，學生逐步完成的練習。", publishers: ["通用教學用語"], levels: ["S1", "S2", "S3", "S4", "S5", "S6"], confidence: "高" },
  { id: "independent-practice", category: "課程與教學", sourceTerm: "independent practice", preferred: "獨立練習", aliases: ["independent practise"], note: "學生在較少提示下自行應用所學的練習。", publishers: ["通用教學用語"], levels: ["S1", "S2", "S3", "S4", "S5", "S6"], confidence: "高" },
  { id: "retrieval-practice", category: "課程與教學", sourceTerm: "retrieval practice", preferred: "提取練習", aliases: ["retrieval activity"], note: "透過回想而非重新閱讀，提取已有知識的活動。", publishers: ["通用教學用語"], levels: ["S1", "S2", "S3", "S4", "S5", "S6"], confidence: "中" },
  { id: "formative-assessment", category: "課程與教學", sourceTerm: "formative assessment", preferred: "形成性評估", aliases: ["assessment for learning"], note: "利用學習證據即時調整教學及支援學生進步的評估。", publishers: ["通用教學用語"], levels: ["S1", "S2", "S3", "S4", "S5", "S6"], confidence: "高" },
  { id: "diagnostic-questioning", category: "課程與教學", sourceTerm: "diagnostic questioning", preferred: "診斷式提問", aliases: ["diagnostic questions"], note: "用問題找出學生的理解、策略或誤解。", publishers: ["通用教學用語"], levels: ["S1", "S2", "S3", "S4", "S5", "S6"], confidence: "中" },
  { id: "scaffolding", category: "課程與教學", sourceTerm: "scaffolding", preferred: "鷹架", aliases: ["scaffold", "scaffolded practice"], note: "為學生提供暫時支援，並隨能力提升逐步撤去。", publishers: ["通用教學用語"], levels: ["S1", "S2", "S3", "S4", "S5", "S6"], confidence: "中" },
  { id: "teaching-differentiation", category: "課程與教學", sourceTerm: "differentiation", preferred: "分層教學", aliases: ["differentiated instruction"], note: "按學生不同需要、能力或準備程度調整內容、支援或任務；數學微分需按上下文區分。", publishers: ["通用教學用語"], levels: ["S1", "S2", "S3", "S4", "S5", "S6"], confidence: "中" },
  { id: "extension-task", category: "課程與教學", sourceTerm: "extension task", preferred: "延伸任務", aliases: ["extension activity"], note: "在核心任務以外要求學生深化、推廣或連結概念的任務。", publishers: ["通用教學用語"], levels: ["S1", "S2", "S3", "S4", "S5", "S6"], confidence: "高" },
  { id: "peer-assessment", category: "課程與教學", sourceTerm: "peer assessment", preferred: "同儕評估", aliases: ["peer review"], note: "學生根據準則互相檢視及回饋學習成果。", publishers: ["通用教學用語"], levels: ["S1", "S2", "S3", "S4", "S5", "S6"], confidence: "高" },
  { id: "self-assessment", category: "課程與教學", sourceTerm: "self-assessment", preferred: "自我評估", aliases: ["self assessment"], note: "學生根據準則檢視自己的理解或表現。", publishers: ["通用教學用語"], levels: ["S1", "S2", "S3", "S4", "S5", "S6"], confidence: "高" },
  { id: "exit-ticket", category: "課程與教學", sourceTerm: "exit ticket", preferred: "課末小測", aliases: ["exit slip"], note: "離開課堂前完成的短題或反思，用來收集理解證據。", publishers: ["通用教學用語"], levels: ["S1", "S2", "S3", "S4", "S5", "S6"], confidence: "中" },
  { id: "think-pair-share", category: "課程與教學", sourceTerm: "think–pair–share", preferred: "思考－二人討論－分享", aliases: ["think-pair-share"], note: "先個人思考，再與同伴討論，最後向全班分享的活動流程。", publishers: ["通用教學用語"], levels: ["S1", "S2", "S3", "S4", "S5"], confidence: "中" },
  { id: "mathematical-reasoning", category: "課程與教學", sourceTerm: "mathematical reasoning", preferred: "數學推理", aliases: ["reasoning"], note: "利用定義、性質、證據及邏輯建立或解釋結論。", publishers: ["通用教學用語"], levels: ["S1", "S2", "S3", "S4", "S5", "S6"], confidence: "高" }
);

if (typeof window !== "undefined") {
  window.MATH_GLOSSARY = MATH_GLOSSARY;
}
