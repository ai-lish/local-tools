const MATH_DRIVE_SAMPLE = {
  label: "公開示例",
  text: "Let f(x) = x^2 + 2x + 1. Suppose f is differentiable on \\mathbb{R}.\n\\[\nf'(x) = 2x + 2.\n\\]\nTherefore, the minimum value of f is attained at x = -1, where f(-1) = 0.",
  sourceLanguage: "en",
  targetLanguage: "zh-Hant",
  fileName: "mathlingo-public-example.tex",
  message: "已載入公開數學示例。"
};

if (typeof window !== "undefined") {
  window.MATH_DRIVE_SAMPLE = MATH_DRIVE_SAMPLE;
}
