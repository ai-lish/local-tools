/*
 * Public-safe example library for MathLingo.
 *
 * The question and lesson-plan snippets below are short, generic examples or
 * original adaptations. They are not reproductions of complete examination
 * questions, textbook pages, marking schemes, or lesson plans.
 */
const PUBLIC_EXAM_SOURCE = "https://www.hkeaa.edu.hk/en/Resources/publications/list_of_publications/hkdse_erqp_pub/";
const PUBLIC_ASSESSMENT_SOURCE = "https://www.hkeaa.edu.hk/DocLibrary/HKDSE/Subject_Information/math/2028hkdse-e-math-63f.pdf";

function makeExample(id, kind, category, levels, sourceLanguage, sourceText, targetText, note, sourceType, sourceUrl, tags) {
  return {
    id,
    kind,
    category,
    levels,
    sourceLanguage,
    targetLanguage: sourceLanguage === "en" ? "zh-Hant" : "en",
    sourceText,
    targetText,
    note,
    sourceType,
    sourceUrl: sourceUrl || "",
    tags: tags || [],
    adapted: true
  };
}

const examples = [
  // Public-examination wording patterns. Values and contexts are adapted.
  makeExample("exam-show-that", "公開試題型", "證明與論證", ["S4", "S5", "S6"], "en", "Show that the equation has two distinct real roots.", "證明該方程有兩個相異實根。", "show that 通常要求寫出足夠的推理，不只是列出答案。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["show that", "proof"]),
  makeExample("exam-hence-find", "公開試題型", "證明與論證", ["S4", "S5", "S6"], "en", "Hence, find the value of the constant k.", "因此，求常數 k 的值。", "hence 指示使用前一部分的結果；可按上下文譯作「利用上面的結果」。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["hence", "constant"]),
  makeExample("exam-hence-or-otherwise", "公開試題型", "證明與論證", ["S5", "S6"], "en", "Find the answer, hence or otherwise.", "利用上面的結果或其他方法求答案。", "保留題目容許不同解法的語氣。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["hence or otherwise"]),
  makeExample("exam-give-reason", "公開試題型", "證明與論證", ["S1", "S2", "S3", "S4"], "en", "Give a reason for your answer.", "為你的答案說明理由。", "比單純的「給出理由」更自然；答案仍須與理由相配。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["reason", "explain"]),
  makeExample("exam-explain-answer", "公開試題型", "證明與論證", ["S1", "S2", "S3", "S4"], "en", "Explain how you obtain your answer.", "解釋你如何得到答案。", "可用於要求呈現方法、步驟或判斷依據的題目。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["explain", "working"]),
  makeExample("exam-solve-equation", "公開試題型", "數與代數", ["S1", "S2", "S3"], "en", "Solve the equation $3x-7=11$.", "解方程 $3x-7=11$。", "solve an equation 用「解方程」，不要譯作「解答方程」。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["solve", "equation"]),
  makeExample("exam-solve-inequality", "公開試題型", "數與代數", ["S2", "S3", "S4"], "en", "Solve the inequality and express the answer on a number line.", "解不等式，並在數線上表示答案。", "number line 與 inequality 常在同一題出現；符號保持原樣。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["inequality", "number line"]),
  makeExample("exam-simultaneous", "公開試題型", "數與代數", ["S2", "S3"], "en", "Solve the following simultaneous equations.", "解下列聯立方程。", "following 可譯作「下列」，不必逐字譯作「跟隨」。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["simultaneous equations"]),
  makeExample("exam-factorise", "公開試題型", "數與代數", ["S2", "S3", "S4"], "en", "Factorise the expression completely.", "把代數式完全因式分解。", "completely 表示應繼續分解至不能再分解。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["factorise", "algebra"]),
  makeExample("exam-simplify", "公開試題型", "數與代數", ["S1", "S2", "S3"], "en", "Simplify your answer as far as possible.", "把答案化至最簡。", "as far as possible 是常見的答案格式要求。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["simplify"]),
  makeExample("exam-exact-form", "公開試題型", "答案格式", ["S3", "S4", "S5"], "en", "Give your answer in exact form.", "以精確形式表示答案。", "exact form 通常表示保留根式、分數或 π，不作小數近似。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["exact form"]),
  makeExample("exam-three-sf", "公開試題型", "答案格式", ["S1", "S2", "S3", "S4"], "en", "Give your answer correct to 3 significant figures.", "答案準確至 3 個有效數字。", "significant figures 譯作「有效數字」，不是「重要數字」。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["significant figures", "rounding"]),
  makeExample("exam-decimal-places", "公開試題型", "答案格式", ["S1", "S2", "S3"], "en", "Give your answer correct to 2 decimal places.", "答案準確至小數點後 2 位。", "decimal places 與 significant figures 要清楚區分。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["decimal places"]),
  makeExample("exam-no-calculator", "公開試題型", "答案格式", ["S1", "S2", "S3", "S4"], "en", "Do not use a calculator in this question.", "本題不得使用計算器。", "若是考試指示，可按整份文件 house style 統一「計算器／計算機」。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["calculator", "instruction"]),
  makeExample("exam-write-down", "公開試題型", "題目指令", ["S1", "S2"], "en", "Write down the value of $x$.", "寫出 $x$ 的值。", "write down 是直接要求寫出結果的固定指令。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["write down"]),
  makeExample("exam-state", "公開試題型", "題目指令", ["S1", "S2", "S3"], "en", "State the range of possible values of $n$.", "寫出 $n$ 的可能值範圍。", "state 可按語境譯作「寫出」或「說明」，須與題目要求一致。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["state", "range"]),
  makeExample("exam-determine", "公開試題型", "題目指令", ["S3", "S4", "S5"], "en", "Determine the coordinates of the point of intersection.", "求兩圖形交點的坐標。", "determine 在數學題目中通常是「求」或「確定」。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["determine", "coordinates"]),
  makeExample("exam-find-equation", "公開試題型", "函數與圖像", ["S3", "S4", "S5"], "en", "Find the equation of the straight line passing through the two points.", "求通過這兩點的直線方程。", "straight line 可譯作「直線」，不必加入「的圖像」。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["straight line", "equation"]),
  makeExample("exam-gradient", "公開試題型", "函數與圖像", ["S3", "S4", "S5"], "en", "Find the gradient of the tangent at $x=2$.", "求 $x=2$ 時切線的斜率。", "香港中學數學常用「斜率」；gradient 與 slope 需按 house style 統一。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["gradient", "tangent"]),
  makeExample("exam-sketch-graph", "公開試題型", "函數與圖像", ["S3", "S4", "S5"], "en", "Sketch the graph, indicating the intercepts and turning point.", "草繪圖像，並標示截距及轉向點。", "indicating 不是要求精確繪圖，而是標出指定特徵。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["sketch", "graph"]),
  makeExample("exam-domain-range", "公開試題型", "函數與圖像", ["S3", "S4", "S5"], "en", "State the domain and range of the function.", "寫出函數的定義域和值域。", "domain／range 是固定術語對；不要混用「範圍」而失去精確性。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["domain", "range"]),
  makeExample("exam-transform", "公開試題型", "函數與圖像", ["S3", "S4"], "en", "Describe the transformation that maps the graph of $y=f(x)$ onto the graph of $y=f(x)+4$.", "描述把 $y=f(x)$ 的圖像變換為 $y=f(x)+4$ 的變換。", "describe the transformation 常要求指出平移方向和距離。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["transformation", "translation"]),
  makeExample("exam-geometry-proof", "公開試題型", "幾何與圖形", ["S2", "S3", "S4"], "en", "Prove that the two triangles are congruent.", "證明這兩個三角形全等。", "congruent triangles 譯作「全等三角形」，而非「相等三角形」。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["congruent", "geometry"]),
  makeExample("exam-angle-measure", "公開試題型", "幾何與圖形", ["S1", "S2", "S3"], "en", "Find the value of the angle marked $x$.", "求標示為 $x$ 的角的值。", "mark 可按圖形語境譯作「標示」。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["angle", "find"]),
  makeExample("exam-draw-locus", "公開試題型", "幾何與圖形", ["S3", "S4", "S5"], "en", "Draw the locus of a point which is equidistant from $A$ and $B$.", "畫出與 $A$ 和 $B$ 距離相等的點的軌跡。", "locus 是「軌跡」；equidistant 表示距離相等。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["locus", "equidistant"]),
  makeExample("exam-trig-ratio", "公開試題型", "三角學", ["S3", "S4", "S5"], "en", "Use the sine rule to find the length of $AB$.", "利用正弦定理求 $AB$ 的長度。", "sine rule、cosine rule、area rule 應分別使用固定中文術語。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["sine rule", "trigonometry"]),
  makeExample("exam-trig-angle", "公開試題型", "三角學", ["S3", "S4", "S5"], "en", "Find the acute angle, correct to the nearest degree.", "求銳角，答案準確至最接近的度。", "acute angle 是「銳角」；nearest degree 可譯作「最接近的度」。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["acute angle", "degree"]),
  makeExample("exam-probability", "公開試題型", "統計與機率", ["S3", "S4", "S5"], "en", "Find the probability that at least one of the events occurs.", "求至少一個事件發生的機率。", "at least 與 at most 的界線要保留，尤其在機率題。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["probability", "at least"]),
  makeExample("exam-expected-value", "公開試題型", "統計與機率", ["S5", "S6"], "en", "Find the expected value and variance of the random variable.", "求隨機變數的期望值及方差。", "expected value、variance 是統計與機率常見術語。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["expected value", "variance"]),
  makeExample("exam-standard-deviation", "公開試題型", "統計與機率", ["S4", "S5", "S6"], "en", "Calculate the standard deviation of the data set.", "計算這組數據的標準差。", "data set 可譯作「數據組」或「數據集」，須按整份文件統一。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["standard deviation"]),
  makeExample("exam-cumulative-frequency", "公開試題型", "統計與機率", ["S3", "S4"], "en", "Draw a cumulative frequency curve and estimate the median.", "畫出累積頻數曲線，並估計中位數。", "estimate 不代表精確計算；cumulative frequency 是「累積頻數」。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["cumulative frequency", "median"]),
  makeExample("exam-correlation", "公開試題型", "統計與機率", ["S4", "S5", "S6"], "en", "Comment on the strength and direction of the correlation.", "評論相關性的強度及方向。", "comment on 要求根據數據作簡短解釋，不只是寫出數值。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["correlation", "interpret"]),
  makeExample("exam-calculus-differentiate", "公開試題型", "微積分", ["S5", "S6"], "en", "Differentiate the function with respect to $x$.", "對該函數求 $x$ 的導數。", "differentiate 可譯作「對……求導」；with respect to 是「對……」。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["differentiate", "derivative"]),
  makeExample("exam-calculus-integrate", "公開試題型", "微積分", ["S5", "S6"], "en", "Evaluate the definite integral between the given limits.", "計算給定上下限之間的定積分。", "evaluate 在此是「計算」；definite integral 是「定積分」。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["definite integral", "limits"]),
  makeExample("exam-area-under-curve", "公開試題型", "微積分", ["S5", "S6"], "en", "Find the area bounded by the curve and the $x$-axis.", "求該曲線與 $x$ 軸所圍成的面積。", "bounded by 是幾何與積分題常用句型。", "公開試題型（改寫）", PUBLIC_EXAM_SOURCE, ["area", "curve"]),
  makeExample("exam-assessment-objective", "公開試題型", "評核語境", ["S4", "S5", "S6"], "en", "Communicate mathematical ideas and present arguments mathematically.", "傳達數學概念，並以數學方式陳述論證。", "這類句子適合翻譯評核框架、課程文件或試卷說明。", "公開試／課程文件用語（改寫）", PUBLIC_ASSESSMENT_SOURCE, ["communicate", "argument"]),
  makeExample("exam-assessment-technique", "公開試題型", "評核語境", ["S4", "S5", "S6"], "en", "Apply appropriate techniques to solve a variety of problems.", "運用適當技巧解決各類問題。", "appropriate techniques 可譯作「適當技巧」；避免過度口語化。", "公開試／課程文件用語（改寫）", PUBLIC_ASSESSMENT_SOURCE, ["apply", "techniques"]),

  // Publisher-style junior and senior question patterns. These are original adaptations.
  makeExample("pub-directed-number", "出版社題型", "數與代數", ["S1"], "en", "Use a directed number to describe a temperature drop of $6^\circ\mathrm{C}$.", "用有向數表示氣溫下降 $6^\circ\mathrm{C}$。", "use a directed number to describe 是初中題目的常見指令句型。", "出版社題型（改寫）", "", ["directed number", "temperature"]),
  makeExample("pub-opposite-number", "出版社題型", "數與代數", ["S1"], "en", "Write down the opposite number of $-13$.", "寫出 $-13$ 的相反數。", "opposite number 是「相反數」，不是「相反的數字」。", "出版社題型（改寫）", "", ["opposite number"]),
  makeExample("pub-number-line", "出版社題型", "數與代數", ["S1"], "en", "Mark the positions of $-2$, $0$ and $5$ on the number line.", "在數線上標示 $-2$、$0$ 和 $5$ 的位置。", "mark the positions 可譯作「標示……的位置」。", "出版社題型（改寫）", "", ["number line", "mark"]),
  makeExample("pub-ascending", "出版社題型", "數與代數", ["S1", "S2"], "en", "Arrange the following numbers in ascending order.", "按遞增次序排列下列數字。", "ascending order 是「遞增次序」；descending order 是「遞減次序」。", "出版社題型（改寫）", "", ["ascending order"]),
  makeExample("pub-prime-factors", "出版社題型", "數與代數", ["S1", "S2"], "en", "Express $84$ as a product of its prime factors.", "把 $84$ 表示為其質因數的乘積。", "prime factors 及 product 的數學術語要保留精確。", "出版社題型（改寫）", "", ["prime factors", "product"]),
  makeExample("pub-hcf-lcm", "出版社題型", "數與代數", ["S1", "S2"], "en", "Find the H.C.F. and L.C.M. of $24$ and $36$.", "求 $24$ 和 $36$ 的最大公因數及最小公倍數。", "香港教材常見 H.C.F.／L.C.M. 的縮寫；正式文件可首次寫出全名。", "出版社題型（改寫）", "", ["HCF", "LCM"]),
  makeExample("pub-ratio", "出版社題型", "數與代數", ["S1", "S2"], "en", "Divide $84$ in the ratio $3:4$.", "按 $3:4$ 的比例把 $84$ 分配。", "divide in the ratio 要保留「按……比例分配」的意思。", "出版社題型（改寫）", "", ["ratio", "divide"]),
  makeExample("pub-percentage-change", "出版社題型", "數與代數", ["S1", "S2"], "en", "Find the percentage increase from $80$ to $92$.", "求由 $80$ 增至 $92$ 的百分率增幅。", "percentage increase 是「百分率增幅」，可按 house style 簡化為「百分率增加」。", "出版社題型（改寫）", "", ["percentage increase"]),
  makeExample("pub-estimation", "出版社題型", "度量", ["S1"], "en", "Estimate the area of the shaded region.", "估計陰影部分的面積。", "estimate 是「估計」；shaded region 是「陰影部分」。", "出版社題型（改寫）", "", ["estimate", "area"]),
  makeExample("pub-standard-form", "出版社題型", "數與代數", ["S2", "S3"], "en", "Write the number in standard form.", "以標準形式表示該數。", "standard form 在香港中學數學中通常指科學記數法格式。", "出版社題型（改寫）", "", ["standard form"]),
  makeExample("pub-substitute", "出版社題型", "數與代數", ["S2", "S3"], "en", "Substitute $x=4$ into the expression and simplify.", "把 $x=4$ 代入代數式，並化至最簡。", "substitute into 是「代入」，不要譯成一般的「替代」。", "出版社題型（改寫）", "", ["substitute", "expression"]),
  makeExample("pub-linear-equation", "出版社題型", "數與代數", ["S1", "S2"], "en", "Form a linear equation from the information given.", "根據所給資料列出一元一次方程。", "form an equation 會按語境譯作「列出／建立方程」。", "出版社題型（改寫）", "", ["linear equation", "form"]),
  makeExample("pub-quadratic-roots", "出版社題型", "數與代數", ["S3", "S4"], "en", "Find the roots of the quadratic equation.", "求二次方程的根。", "root 在方程語境是「根」，在函數語境則可能是「零點」。", "出版社題型（改寫）", "", ["quadratic", "roots"]),
  makeExample("pub-complete-square", "出版社題型", "函數與圖像", ["S3", "S4"], "en", "Express the quadratic function in vertex form.", "把二次函數表示成頂點形式。", "vertex form 是「頂點形式」；不要只譯作「頂點方程」。", "出版社題型（改寫）", "", ["vertex form", "quadratic function"]),
  makeExample("pub-straight-line", "出版社題型", "函數與圖像", ["S3", "S4"], "en", "Find the equation of the line with gradient $-2$ and $y$-intercept $5$.", "求斜率為 $-2$ 且 $y$ 截距為 $5$ 的直線方程。", "y-intercept 是「y 截距」；可按 house style 使用「縱截距」。", "出版社題型（改寫）", "", ["gradient", "intercept"]),
  makeExample("pub-coordinate", "出版社題型", "幾何與圖形", ["S1", "S2", "S3"], "en", "Find the midpoint of $AB$ and state its coordinates.", "求 $AB$ 的中點，並寫出其坐標。", "香港繁體中文數學語境常用「坐標」字形。", "出版社題型（改寫）", "", ["midpoint", "coordinates"]),
  makeExample("pub-transformation", "出版社題型", "幾何與圖形", ["S2", "S3"], "en", "Reflect the triangle in the $y$-axis and label the image.", "把三角形反射於 $y$ 軸，並標示像。", "image 在變換語境是「像」，不是一般的「圖像」。", "出版社題型（改寫）", "", ["reflection", "image"]),
  makeExample("pub-pythagoras", "出版社題型", "幾何與圖形", ["S2", "S3"], "en", "Use Pythagoras' theorem to find the unknown side.", "利用畢氏定理求未知邊。", "theorem 名稱按香港教材 house style 統一。", "出版社題型（改寫）", "", ["Pythagoras", "side"]),
  makeExample("pub-area-volume", "出版社題型", "度量", ["S1", "S2", "S3"], "en", "Find the total surface area and volume of the prism.", "求柱體的總表面面積及體積。", "surface area 與 area 不要混譯；total 要保留。", "出版社題型（改寫）", "", ["surface area", "volume"]),
  makeExample("pub-similarity", "出版社題型", "幾何與圖形", ["S2", "S3", "S4"], "en", "The two figures are similar. Find the scale factor.", "這兩個圖形相似。求比例因子。", "scale factor 是「比例因子」；按教材也可能見「縮放因子」。", "出版社題型（改寫）", "", ["similar", "scale factor"]),
  makeExample("pub-bearings", "出版社題型", "幾何與圖形", ["S3", "S4"], "en", "Find the bearing of $B$ from $A$.", "求 $B$ 從 $A$ 的方位角。", "bearing 是「方位角」，from A 的方向不可漏譯。", "出版社題型（改寫）", "", ["bearing", "direction"]),
  makeExample("pub-trig-identity", "出版社題型", "三角學", ["S4", "S5"], "en", "Prove the trigonometric identity.", "證明該三角恆等式。", "identity 與 equation 不同；identity 用「恆等式」。", "出版社題型（改寫）", "", ["identity", "trigonometry"]),
  makeExample("pub-sequence", "出版社題型", "數與代數", ["S3", "S4"], "en", "Find the $n$th term of the sequence.", "求該數列的第 $n$ 項。", "nth term 是「第 n 項」，大小寫可按公式保留。", "出版社題型（改寫）", "", ["sequence", "nth term"]),
  makeExample("pub-arithmetic-series", "出版社題型", "數與代數", ["S4", "S5"], "en", "Find the sum of the first $n$ terms of the arithmetic sequence.", "求該等差數列首 $n$ 項的和。", "arithmetic sequence 是「等差數列」；sum of terms 是「項的和」。", "出版社題型（改寫）", "", ["arithmetic sequence", "sum"]),
  makeExample("pub-statistics-mean", "出版社題型", "統計與機率", ["S1", "S2", "S3"], "en", "Calculate the mean, median and mode of the data.", "計算這組數據的平均數、中位數及眾數。", "三個統計量宜固定使用同一組中文術語。", "出版社題型（改寫）", "", ["mean", "median", "mode"]),
  makeExample("pub-box-plot", "出版社題型", "統計與機率", ["S3", "S4"], "en", "Draw a box-and-whisker diagram for the data.", "為這組數據繪畫盒鬚圖。", "box-and-whisker diagram 是「盒鬚圖」。", "出版社題型（改寫）", "", ["box plot", "data"]),
  makeExample("pub-probability-tree", "出版社題型", "統計與機率", ["S3", "S4"], "en", "Complete the probability tree diagram.", "完成機率樹形圖。", "complete 可譯作「完成」；diagram 類型應保留。", "出版社題型（改寫）", "", ["probability tree"]),
  makeExample("pub-calculus-tangent", "出版社題型", "微積分", ["S5", "S6"], "en", "Find the equation of the tangent at the point where $x=1$.", "求 $x=1$ 所在點的切線方程。", "tangent at a point 是微積分教學進度常見句型。", "出版社題型（改寫）", "", ["tangent", "calculus"]),
  makeExample("pub-calculus-stationary", "出版社題型", "微積分", ["S5", "S6"], "en", "Find the coordinates of the stationary point.", "求駐點的坐標。", "stationary point 是「駐點」，不要直譯成「靜止點」。", "出版社題型（改寫）", "", ["stationary point"]),
  makeExample("pub-calculus-optimisation", "出版社題型", "微積分", ["S5", "S6"], "en", "Find the maximum possible area.", "求可能的最大面積。", "optimisation 題型可在 note 補充「最優化／極值」視語境處理。", "出版社題型（改寫）", "", ["maximum", "optimisation"]),

  // Curriculum documents and lesson-plan wording.
  makeExample("curriculum-programme", "課程文件／教案", "課程文件", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Programme of Study: Algebra and Functions", "課程進度：代數及函數", "Programme of Study 可按文件類型譯作「課程進度」或「學習進程」。", "課程文件／教案（示例）", "", ["programme of study", "curriculum"]),
  makeExample("curriculum-scheme", "課程文件／教案", "課程文件", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Scheme of Work: Term 2", "教學進度表：第二學期", "Scheme of Work 是教學文件標題常見用語。", "課程文件／教案（示例）", "", ["scheme of work", "term"]),
  makeExample("curriculum-unit-title", "課程文件／教案", "課程文件", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Unit title: Introduction to Differentiation", "單元名稱：微分簡介", "unit title 可譯作「單元名稱」；differentiation 可按課程用語譯作「微分」。", "課程文件／教案（示例）", "", ["unit title", "differentiation"]),
  makeExample("curriculum-learning-objectives", "學習目標", "學習目標", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "By the end of the lesson, students will be able to solve a linear equation and check the solution.", "在課堂結束時，學生能夠解一元一次方程，並驗算解。", "By the end of the lesson, students will be able to… 是可量度學習目標的固定開首。", "課程文件／教案（示例）", "", ["learning objective", "students will be able to"]),
  makeExample("curriculum-objective-identify", "學習目標", "學習目標", ["S1", "S2", "S3"], "en", "Students will be able to identify the key features of a quadratic graph.", "學生能夠辨認二次函數圖像的主要特徵。", "identify 通常譯作「辨認／識別」，按學生年級選擇字眼。", "課程文件／教案（示例）", "", ["identify", "quadratic graph"]),
  makeExample("curriculum-objective-explain", "學習目標", "學習目標", ["S2", "S3", "S4"], "en", "Students will be able to explain why the angle sum of a triangle is $180^\circ$.", "學生能夠解釋為何三角形的內角和是 $180^\circ$。", "學習目標中的 explain 應保留「解釋」而非只寫「知道」。", "課程文件／教案（示例）", "", ["explain", "angle sum"]),
  makeExample("curriculum-objective-apply", "學習目標", "學習目標", ["S3", "S4", "S5"], "en", "Students will be able to apply the sine rule to solve non-right-angled triangles.", "學生能夠運用正弦定理解決非直角三角形。", "apply 是課程文件常見的可觀察動詞，譯作「運用」。", "課程文件／教案（示例）", "", ["apply", "sine rule"]),
  makeExample("curriculum-objective-justify", "學習目標", "學習目標", ["S4", "S5", "S6"], "en", "Students will be able to justify the method used and communicate the answer clearly.", "學生能夠為所採用的方法提供理據，並清楚表達答案。", "justify 不只是「證明」，在教學目標中可譯作「提供理據」。", "課程文件／教案（示例）", "", ["justify", "communicate"]),
  makeExample("curriculum-success-criteria", "學習目標", "評量語境", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Success criteria: I can show all my working and explain each step.", "成功準則：我能展示所有計算步驟，並解釋每一步。", "Success criteria 可譯作「成功準則」或「成功指標」；整份文件應一致。", "課程文件／教案（示例）", "", ["success criteria", "working"]),
  makeExample("curriculum-prior-knowledge", "課程文件／教案", "課程文件", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Prior knowledge: Students should be familiar with fractions and equivalent ratios.", "已有知識：學生應熟悉分數及等值比。", "Prior knowledge 是教案中的固定欄位；亦可譯作「先備知識」。", "課程文件／教案（示例）", "", ["prior knowledge", "fractions"]),
  makeExample("curriculum-key-vocabulary", "課程文件／教案", "課程文件", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Key vocabulary: coefficient, constant term, factor and root.", "關鍵詞彙：係數、常數項、因式及根。", "Key vocabulary 適合在詞庫和教案中互相連結。", "課程文件／教案（示例）", "", ["key vocabulary", "algebra"]),
  makeExample("curriculum-common-misconception", "課程文件／教案", "評量語境", ["S1", "S2", "S3", "S4"], "en", "Common misconception: Students may reverse the inequality sign when multiplying by a negative number.", "常見誤解：學生把不等式兩邊乘以負數時，可能會把不等號方向倒轉。", "common misconception 是教案與課程文件很重要的欄位。", "課程文件／教案（示例）", "", ["misconception", "inequality"]),
  makeExample("curriculum-differentiation", "課程文件／教案", "課程文件", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Differentiation: Provide a scaffold for students who need additional support and an extension task for early finishers.", "分層教學：為需要額外支援的學生提供鷹架，並為提早完成的學生提供延伸任務。", "differentiation 在教育語境是「分層教學／照顧學習差異」，不是數學的微分。", "課程文件／教案（示例）", "", ["differentiation", "scaffold", "extension"]),
  makeExample("curriculum-assessment", "課程文件／教案", "評量語境", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Assessment for learning: Use the exit ticket to identify students who need further practice.", "促進學習的評估：利用課末小測找出需要進一步練習的學生。", "Assessment for learning 是教育文件常見術語；exit ticket 可譯作「課末小測」。", "課程文件／教案（示例）", "", ["assessment for learning", "exit ticket"]),
  makeExample("curriculum-resources", "課程文件／教案", "課程文件", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Resources: mini-whiteboards, graph paper, rulers and a dynamic geometry app.", "教學資源：小白板、方格紙、直尺及動態幾何應用程式。", "Resources 可按學校 house style 譯作「資源／教學資源」。", "課程文件／教案（示例）", "", ["resources", "materials"]),
  makeExample("curriculum-timing", "課程文件／教案", "課程文件", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Timing: 10 minutes for retrieval practice, 25 minutes for guided practice and 15 minutes for independent work.", "時間分配：10 分鐘作提取練習、25 分鐘作引導練習，以及 15 分鐘作獨立練習。", "教案時間表的 minutes／practice 宜保持平行結構。", "課程文件／教案（示例）", "", ["timing", "lesson structure"]),
  makeExample("curriculum-homework", "課程文件／教案", "課程文件", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Homework: Complete questions 1–6 and write one sentence explaining a mistake you corrected.", "家課：完成第 1 至 6 題，並寫一句解釋你所改正的一個錯誤。", "question numbers 和 ranges 可按出版 house style 統一格式。", "課程文件／教案（示例）", "", ["homework", "reflection"]),
  makeExample("curriculum-lesson-sequence", "課程文件／教案", "教案結構", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Lesson sequence: starter, teacher modelling, guided practice, independent practice and plenary.", "課堂流程：熱身活動、教師示範、引導練習、獨立練習及總結活動。", "lesson sequence 可譯作「課堂流程」；各活動名稱保持一致。", "課程文件／教案（示例）", "", ["lesson sequence", "starter", "plenary"]),
  makeExample("curriculum-chinese-objective", "學習目標", "學習目標", ["S1", "S2", "S3", "S4", "S5", "S6"], "zh-Hant", "學習目標：學生能夠利用圖表比較兩組數據，並以完整句子解釋結論。", "Learning objective: Students will be able to compare two sets of data using graphs and explain the conclusion in a complete sentence.", "中文教案翻譯成英文時，能夠／可以通常對應 will be able to，而非單純 can。", "課程文件／教案（示例）", "", ["Chinese to English", "learning objective"]),
  makeExample("curriculum-chinese-method", "教學法", "教學法", ["S1", "S2", "S3", "S4"], "zh-Hant", "教學法：先由教師示範，再讓學生兩人一組完成引導練習。", "Teaching method: The teacher models the procedure first, followed by guided practice in pairs.", "中文教案中的「先……再……」可用 followed by 保持流程關係。", "課程文件／教案（示例）", "", ["Chinese to English", "method"]),

  // Teaching methods and lesson routines.
  makeExample("method-retrieval", "教學法", "教學法", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Retrieval practice: Begin the lesson with four short questions from previous topics.", "提取練習：課堂開始時先處理四道來自以往課題的短題目。", "retrieval practice 是從記憶提取已有知識的教學活動。", "教學法（示例）", "", ["retrieval practice"]),
  makeExample("method-explicit-instruction", "教學法", "教學法", ["S1", "S2", "S3", "S4"], "en", "Use explicit instruction to model how to set out a proof.", "運用直接教學示範如何編排證明。", "explicit instruction 常譯作「直接教學」；正式文件可按學校術語調整。", "教學法（示例）", "", ["explicit instruction", "proof"]),
  makeExample("method-worked-example", "教學法", "教學法", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Worked example: Annotate each step and explain why it is valid.", "示範例題：為每一步加上註解，並解釋其為何有效。", "worked example 不只是「工作例子」，是展示完整解題過程的例題。", "教學法（示例）", "", ["worked example"]),
  makeExample("method-guided-practice", "教學法", "教學法", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Guided practice: Complete the first step together before working independently.", "引導練習：先共同完成第一步，然後再獨立作答。", "guided practice 與 independent practice 通常成對出現。", "教學法（示例）", "", ["guided practice"]),
  makeExample("method-independent", "教學法", "教學法", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Independent practice: Students solve a set of questions without prompts.", "獨立練習：學生在沒有提示的情況下解答一組題目。", "without prompts 可譯作「沒有提示」，不要漏掉學習支援程度。", "教學法（示例）", "", ["independent practice"]),
  makeExample("method-think-pair-share", "教學法", "教學法", ["S1", "S2", "S3", "S4"], "en", "Think–pair–share: Give students silent thinking time before discussion.", "思考－二人討論－分享：討論前先給予學生安靜思考的時間。", "Think–pair–share 是合作學習流程，可按學校用語保留英文括號。", "教學法（示例）", "", ["think-pair-share", "collaborative learning"]),
  makeExample("method-collaborative", "教學法", "教學法", ["S1", "S2", "S3", "S4", "S5"], "en", "Collaborative learning: Ask each group to compare two different methods.", "協作學習：要求每組比較兩種不同的方法。", "group／pair／team 的層級和數量要按上下文翻譯。", "教學法（示例）", "", ["collaborative learning"]),
  makeExample("method-inquiry", "教學法", "教學法", ["S2", "S3", "S4", "S5", "S6"], "en", "Inquiry-based learning: Students investigate what changes when the gradient is doubled.", "探究式學習：學生探究斜率加倍時會有甚麼變化。", "inquiry-based learning 可譯作「探究式學習」。", "教學法（示例）", "", ["inquiry-based learning"]),
  makeExample("method-problem-based", "教學法", "教學法", ["S2", "S3", "S4", "S5", "S6"], "en", "Problem-based learning: Start with a real-world optimisation problem.", "問題為本學習：由一個真實情境的最優化問題開始。", "problem-based learning 與 project-based learning 不應混譯。", "教學法（示例）", "", ["problem-based learning"]),
  makeExample("method-concrete", "教學法", "教學法", ["S1", "S2", "S3"], "en", "Use concrete, pictorial and abstract representations of the fraction.", "運用分數的具體、圖像及抽象表徵。", "CPA 是數學教學文件常用的 multiple representations 框架。", "教學法（示例）", "", ["concrete-pictorial-abstract", "representations"]),
  makeExample("method-formative", "教學法", "評量語境", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Formative assessment: Use responses to adjust the next explanation.", "形成性評估：根據學生的回答調整下一步講解。", "formative assessment 著重用評估資料改善學習與教學。", "教學法（示例）", "", ["formative assessment"]),
  makeExample("method-diagnostic", "教學法", "評量語境", ["S1", "S2", "S3", "S4", "S5"], "en", "Diagnostic questioning: Ask students to choose the error in a worked solution.", "診斷式提問：要求學生找出示範解答中的錯誤。", "diagnostic questioning 用於找出誤解，不一定是正式測驗。", "教學法（示例）", "", ["diagnostic questioning", "error analysis"]),
  makeExample("method-error-analysis", "教學法", "評量語境", ["S1", "S2", "S3", "S4", "S5"], "en", "Error analysis: Compare a correct solution with a plausible incorrect solution.", "錯誤分析：比較正確解答與一個看似合理但不正確的解答。", "plausible incorrect solution 適合處理學生常見錯誤示例。", "教學法（示例）", "", ["error analysis"]),
  makeExample("method-scaffolding", "教學法", "教學法", ["S1", "S2", "S3", "S4"], "en", "Scaffolding: Provide a partially completed table and remove the prompts gradually.", "鷹架：提供一張部分完成的表格，並逐步減少提示。", "scaffolding 是暫時支援，語意上包含逐步撤去支援。", "教學法（示例）", "", ["scaffolding"]),
  makeExample("method-gradual-release", "教學法", "教學法", ["S1", "S2", "S3", "S4", "S5"], "en", "Gradual release of responsibility: I do, we do, you do.", "逐步放手：教師示範、師生共同完成、學生獨立完成。", "三段流程可用中文完整表達，避免只保留英文口號。", "教學法（示例）", "", ["gradual release"]),
  makeExample("method-peer-assessment", "教學法", "評量語境", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Peer assessment: Use the success criteria to give one strength and one next step.", "同儕評估：根據成功準則指出一項優點及一項下一步改善方向。", "one strength and one next step 是常見的回饋句型。", "教學法（示例）", "", ["peer assessment", "feedback"]),
  makeExample("method-self-assessment", "教學法", "評量語境", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Self-assessment: Rate your confidence and identify one question you still have.", "自我評估：評定你對內容的信心，並指出一條仍有疑問的問題。", "rate your confidence 不必直譯成「評分你的自信」。", "教學法（示例）", "", ["self-assessment"]),
  makeExample("method-hinge-question", "教學法", "評量語境", ["S1", "S2", "S3", "S4", "S5"], "en", "Hinge question: Pause and check understanding before moving on.", "關鍵檢核題：在繼續下一部分前停下來檢查理解程度。", "hinge question 是課堂中影響是否繼續教學的檢核題。", "教學法（示例）", "", ["hinge question"]),
  makeExample("method-mini-whiteboard", "教學法", "教學法", ["S1", "S2", "S3", "S4"], "en", "Mini-whiteboard check: Everyone writes an answer and shows it at the same time.", "小白板檢核：所有人寫下答案，然後同時展示。", "mini-whiteboard 在香港教案可譯作「小白板」。", "教學法（示例）", "", ["mini-whiteboard"]),
  makeExample("method-multiple-representations", "教學法", "教學法", ["S1", "S2", "S3", "S4", "S5"], "en", "Use multiple representations to connect the table, graph and equation.", "運用多重表徵連結表格、圖像及方程。", "multiple representations 是數學概念教學的核心用語。", "教學法（示例）", "", ["multiple representations"]),

  // Everyday classroom language for teachers and students.
  makeExample("class-turn-page", "課堂用語", "課堂管理", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Turn to page 42 and look at Example 3.", "翻到第 42 頁，查看例題 3。", "classroom instruction 的祈使句可直接使用動詞開首。", "課堂教學用語（示例）", "", ["page", "example"]),
  makeExample("class-write-title", "課堂用語", "課堂管理", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Write the date and lesson title at the top of your page.", "在頁面頂部寫上日期及課堂名稱。", "lesson title 亦可按學校文件譯作「課題」。", "課堂教學用語（示例）", "", ["date", "lesson title"]),
  makeExample("class-work-alone", "課堂用語", "課堂管理", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Work on this question individually for three minutes.", "用三分鐘獨立完成這道題。", "individually 在課堂用語中常譯作「獨立」。", "課堂教學用語（示例）", "", ["individually"]),
  makeExample("class-work-pairs", "課堂用語", "課堂管理", ["S1", "S2", "S3", "S4"], "en", "Work in pairs and compare your methods.", "兩人一組，並比較你們的方法。", "work in pairs 是最常見的合作學習指令之一。", "課堂教學用語（示例）", "", ["pairs", "compare"]),
  makeExample("class-show-working", "課堂用語", "解題表達", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Show your working clearly.", "清楚展示你的計算步驟。", "working 在數學課堂語境通常是「計算步驟／解題過程」。", "課堂教學用語（示例）", "", ["working", "show"]),
  makeExample("class-check-units", "課堂用語", "解題表達", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Check that your answer has the correct units.", "檢查你的答案是否附有正確的單位。", "單位是數學文件翻譯中的高頻覆核點。", "課堂教學用語（示例）", "", ["units", "check"]),
  makeExample("class-estimate-first", "課堂用語", "解題策略", ["S1", "S2", "S3", "S4"], "en", "Estimate the answer first, then calculate it exactly.", "先估計答案，然後精確計算。", "first／then 要在翻譯中保留先後次序。", "課堂教學用語（示例）", "", ["estimate", "calculate"]),
  makeExample("class-notice", "課堂用語", "數學討論", ["S1", "S2", "S3", "S4", "S5"], "en", "What do you notice about the pattern?", "你留意到這個規律有甚麼特點？", "notice 是引導觀察，不一定是正式的「注意」。", "課堂教學用語（示例）", "", ["notice", "pattern"]),
  makeExample("class-how-know", "課堂用語", "數學討論", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "How do you know that your answer is reasonable?", "你如何知道你的答案合理？", "reasonable 在數學討論中可譯作「合理」，不必改成「正確」。", "課堂教學用語（示例）", "", ["reasoning", "reasonable"]),
  makeExample("class-explain-partner", "課堂用語", "數學討論", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Explain your reasoning to your partner.", "向你的同伴解釋你的推理。", "reasoning 可譯作「推理／推理過程」，按年級調整。", "課堂教學用語（示例）", "", ["reasoning", "partner"]),
  makeExample("class-improve-answer", "課堂用語", "數學討論", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Can anyone improve this explanation?", "有誰可以改善這個解釋？", "改善同學答案時，宜保持建設性語氣。", "課堂教學用語（示例）", "", ["improve", "explanation"]),
  makeExample("class-exact-value", "課堂用語", "解題表達", ["S3", "S4", "S5", "S6"], "en", "Keep the answer in exact form until the final step.", "在最後一步之前，把答案保留為精確形式。", "until the final step 是過程控制用語。", "課堂教學用語（示例）", "", ["exact form"]),
  makeExample("class-rounding", "課堂用語", "解題表達", ["S1", "S2", "S3", "S4", "S5"], "en", "Round only at the end of the calculation.", "只在計算最後才進行四捨五入。", "rounding 的位置會影響答案準確度。", "課堂教學用語（示例）", "", ["rounding"]),
  makeExample("class-different-method", "課堂用語", "解題策略", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Try a different method and decide which is more efficient.", "嘗試另一種方法，並判斷哪一種較有效率。", "efficient 是「有效率」，不一定是「容易」。", "課堂教學用語（示例）", "", ["method", "efficient"]),
  makeExample("class-calculator-ready", "課堂用語", "課堂管理", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Keep your calculator closed until you are asked to use it.", "在獲准使用計算器前，先不要打開計算器。", "keep … closed 是課堂管理的禮貌指令。", "課堂教學用語（示例）", "", ["calculator", "classroom management"]),
  makeExample("class-mark-own", "課堂用語", "評量語境", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Mark your own work using the answer key.", "使用答案表自行批改。", "answer key 是「答案表／答案索引」，視文件類型選擇。", "課堂教學用語（示例）", "", ["marking", "answer key"]),
  makeExample("class-correct-mistake", "課堂用語", "評量語境", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Correct the mistake and write one sentence explaining the correction.", "改正錯誤，並寫一句解釋改正之處。", "correct 作動詞是「改正」，作形容詞才是「正確」。", "課堂教學用語（示例）", "", ["correct", "mistake"]),
  makeExample("class-exit-ticket", "課堂用語", "評量語境", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Complete the exit ticket before you leave.", "離開前完成課末小測。", "exit ticket 是課末快速收集理解證據的活動。", "課堂教學用語（示例）", "", ["exit ticket"]),
  makeExample("class-pack-away", "課堂用語", "課堂管理", ["S1", "S2", "S3", "S4", "S5", "S6"], "en", "Pack away your equipment and leave the worksheet on the desk.", "收拾你的器材，並把工作紙留在桌上。", "pack away 是「收拾」，equipment 可按學校用語譯作「器材／用品」。", "課堂教學用語（示例）", "", ["pack away", "worksheet"]),
  makeExample("class-chinese-show", "課堂用語", "解題表達", ["S1", "S2", "S3", "S4", "S5", "S6"], "zh-Hant", "請在答案旁邊寫出計算步驟，並圈出最後答案。", "Write your working next to the answer and circle the final answer.", "中文課堂指令翻成英文時，可用祈使句保持簡潔。", "課堂教學用語（示例）", "", ["Chinese to English", "working"]),
  makeExample("class-chinese-discuss", "課堂用語", "數學討論", ["S1", "S2", "S3", "S4", "S5"], "zh-Hant", "先與鄰座同學討論，再請一位同學分享方法。", "Discuss with the person next to you first, then ask one student to share the method.", "先／再的流程在英文中以 first／then 清晰表達。", "課堂教學用語（示例）", "", ["Chinese to English", "discussion"]),
  makeExample("class-chinese-review", "課堂用語", "課堂管理", ["S1", "S2", "S3", "S4", "S5", "S6"], "zh-Hant", "我們會在下一課檢討這道題的不同解法。", "We will review different methods for this question in the next lesson.", "review 在這裡是「檢討／溫習」，並非只限於校對答案。", "課堂教學用語（示例）", "", ["Chinese to English", "review"]),
  makeExample("class-chinese-question", "課堂用語", "數學討論", ["S1", "S2", "S3", "S4", "S5", "S6"], "zh-Hant", "如果你不明白，請指出你在哪一步遇到困難。", "If you are unsure, tell me which step you are finding difficult.", "課堂支援語氣可用 unsure 和 finding difficult，避免令學生感到被責備。", "課堂教學用語（示例）", "", ["Chinese to English", "support"]),
  makeExample("class-chinese-justify", "課堂用語", "數學討論", ["S2", "S3", "S4", "S5", "S6"], "zh-Hant", "不要只寫答案；請解釋你如何知道這個結論成立。", "Do not write only the answer; explain how you know that the conclusion is valid.", "這是要求數學論證的常用課堂句型。", "課堂教學用語（示例）", "", ["Chinese to English", "justify"])
];

const MATH_EXAMPLES = {
  meta: {
    name: "MathLingo public example library",
    version: "0.3-public",
    updatedAt: "2026-08-31",
    uiLabel: "公開試／出版社／教學示例",
    title: "示例庫",
    description: "以公開試題型、出版社題型的短例，以及課程文件、教案、學習目標、教學法和課堂用語示範翻譯方向。每張卡片都可直接載入工作區。",
    filterNote: "題目及教學語境均以短句、自製改寫或通用句型示範；不是完整教材重製。",
    sourceNote: "公開試類示例連往 HKEAA 公開資源；出版社類示例只保留題型和用語層次，並以自製句子呈現。正式出版前仍應按原文件上下文和 house style 覆核。"
  },
  entries: examples
};

if (typeof window !== "undefined") {
  window.MATH_EXAMPLES = MATH_EXAMPLES;
}
