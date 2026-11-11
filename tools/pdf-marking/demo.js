(function (root) {
  "use strict";

  var MC_COUNT = 60;
  var TF_COUNT = 10;
  var MC_OPTIONS = ["A", "B", "C", "D"];
  var TF_OPTIONS = ["T", "F"];
  var DEMO_KEY = Array.from({ length: MC_COUNT }, function (_, index) { return MC_OPTIONS[index % MC_OPTIONS.length]; }).join("");
  var DEMO_TF_KEY = Array.from({ length: TF_COUNT }, function (_, index) { return TF_OPTIONS[index % TF_OPTIONS.length]; }).join("");
  var PAGE_WIDTH = 595.28;
  var PAGE_HEIGHT = 841.89;

  function buildDemoPlan() {
    var pages = [
      { pageNumber: 1, grade: "6", form: "F", studentId: "01", paleQuestions: [3], multipleQuestions: [], blankQuestions: [] },
      { pageNumber: 2, grade: "6", form: "F", studentId: "02", paleQuestions: [14], multipleQuestions: [5], blankQuestions: [] },
      { pageNumber: 3, grade: "6", form: "F", studentId: "03", paleQuestions: [], multipleQuestions: [], blankQuestions: [8] }
    ];
    pages.forEach(function (page) { page.answerKey = DEMO_KEY; page.tfAnswerKey = DEMO_TF_KEY; });
    return {
      questionCount: MC_COUNT,
      tfCount: TF_COUNT,
      answerKey: DEMO_KEY,
      tfAnswerKey: DEMO_TF_KEY,
      pages: pages
    };
  }

  function selectedValue(bubble, page) {
    if (bubble.type === "class-grade") return bubble.option === page.grade;
    if (bubble.type === "class-form") return bubble.option === page.form;
    if (bubble.type === "student-number") return bubble.option === page.studentId.charAt(bubble.column);
    return false;
  }

  function answerForQuestion(plan, type, number) {
    var key = type === "tf" ? plan.tfAnswerKey : plan.answerKey;
    var answer = key.charAt(number - 1);
    if (type === "mc" && plan.blankQuestions.indexOf(number) >= 0) return "";
    if (type === "mc" && plan.multipleQuestions.indexOf(number) >= 0) {
      var extra = MC_OPTIONS.find(function (option) { return option !== answer; });
      answer += extra;
    }
    return answer;
  }

  function bubbleState(plan, bubble) {
    var isMc = bubble.type === "mc";
    var isTf = bubble.type === "tf";
    if (!isMc && !isTf) return { filled: selectedValue(bubble, plan), shade: 0.12 };
    var answer = answerForQuestion(plan, bubble.type, bubble.number);
    var pale = isMc && plan.paleQuestions.indexOf(bubble.number) >= 0;
    return { filled: answer.indexOf(bubble.option) >= 0, shade: pale ? 0.82 : 0.12 };
  }

  function createDemoPdf(pdfLib, templateDefinition) {
    if (!pdfLib || !pdfLib.PDFDocument || !pdfLib.rgb) throw new Error("PDF 示範程式庫未載入。");
    var templates = root.PdfMarkingTemplates;
    var geometry = root.PdfMarkingGeometry;
    var definition = templateDefinition || templates.BUILTIN_TEMPLATES[0];
    if (!templates || !geometry || definition.kind !== "choice") throw new Error("示範只支援內置選擇題範本。");
    var plan = buildDemoPlan();
    var expanded = geometry.expandChoiceTemplate(definition, { mcCount: plan.questionCount, tfCount: plan.tfCount });
    return pdfLib.PDFDocument.create().then(async function (document) {
      var font = await document.embedFont(pdfLib.StandardFonts.Helvetica);
      plan.pages.forEach(function (pagePlan) {
        var page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        page.drawText("SYNTHETIC DEMO  |  PAGE " + pagePlan.pageNumber, {
          x: 24, y: PAGE_HEIGHT - 25, size: 11, font: font, color: pdfLib.rgb(0.15, 0.2, 0.25)
        });
        page.drawText("CLASS 6F  |  SAMPLE NO. " + pagePlan.studentId, {
          x: 24, y: PAGE_HEIGHT - 43, size: 8, font: font, color: pdfLib.rgb(0.25, 0.3, 0.35)
        });
        var radius = PAGE_WIDTH * expanded.params.radius;
        [
          { bubbles: expanded.classGrade, label: "GRADE" },
          { bubbles: expanded.classForm, label: "FORM" },
          { bubbles: expanded.studentNumber && expanded.studentNumber[0], label: "ID1" },
          { bubbles: expanded.studentNumber && expanded.studentNumber[1], label: "ID2" }
        ].forEach(function (field) {
          var first = field.bubbles && field.bubbles[0];
          if (!first) return;
          var centerX = first.x * PAGE_WIDTH;
          var centerY = PAGE_HEIGHT - first.y * PAGE_HEIGHT;
          page.drawText(field.label, {
            x: centerX - radius - field.label.length * 2.2 - 2,
            y: centerY + radius + 2, size: 4.2, font: font, color: pdfLib.rgb(0.25, 0.3, 0.35)
          });
        });
        expanded.items.forEach(function (item) {
          var first = item.choices[0];
          var centerY = PAGE_HEIGHT - first.y * PAGE_HEIGHT;
          var label = item.type === "mc" ? String(item.number).padStart(2, "0") : "T" + String(item.number).padStart(2, "0");
          page.drawText(label, { x: first.x * PAGE_WIDTH - 20, y: centerY - 1.7, size: 4.5, font: font, color: pdfLib.rgb(0.25, 0.3, 0.35) });
          item.choices.forEach(function (bubble) {
            page.drawText(bubble.option, {
              x: bubble.x * PAGE_WIDTH - 1.5, y: centerY - radius - 4.5,
              size: 4.2, font: font, color: pdfLib.rgb(0.25, 0.3, 0.35)
            });
          });
        });
        expanded.bubbles.forEach(function (bubble) {
          var mark = bubbleState(pagePlan, bubble);
          if (["class-grade", "class-form", "student-number"].indexOf(bubble.type) >= 0) {
            page.drawText(bubble.option, {
              x: bubble.x * PAGE_WIDTH - radius - 1.5,
              y: PAGE_HEIGHT - bubble.y * PAGE_HEIGHT - 1.6,
              size: 3.8, font: font, color: pdfLib.rgb(0.25, 0.3, 0.35)
            });
          }
          var options = {
            x: bubble.x * PAGE_WIDTH,
            y: PAGE_HEIGHT - bubble.y * PAGE_HEIGHT,
            size: radius,
            borderColor: pdfLib.rgb(0.16, 0.18, 0.2),
            borderWidth: 0.6
          };
          if (mark.filled) options.color = pdfLib.rgb(mark.shade, mark.shade, mark.shade);
          page.drawCircle(options);
        });
      });
      return new Uint8Array(await document.save());
    });
  }

  root.PdfMarkingDemo = {
    buildDemoPlan: buildDemoPlan,
    answerForQuestion: answerForQuestion,
    bubbleState: bubbleState,
    createDemoPdf: createDemoPdf
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.PdfMarkingDemo;
})(typeof window !== "undefined" ? window : globalThis);
