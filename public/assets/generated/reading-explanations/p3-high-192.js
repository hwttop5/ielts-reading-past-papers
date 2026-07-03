(function registerReadingExplanationData(global) {
  'use strict';
  if (!global.__READING_EXPLANATION_DATA__ || typeof global.__READING_EXPLANATION_DATA__.register !== "function") {
    throw new Error("reading_explanation_registry_missing");
  }
  global.__READING_EXPLANATION_DATA__.register("p3-high-192", {
  "schemaVersion": "ReadingExplanationV1",
  "examId": "p3-high-192",
  "meta": {
    "examId": "p3-high-192",
    "title": "Voynich Manuscript 伏尼契手稿",
    "category": "P3",
    "sourceDoc": "99. P3 - Voynich Manuscript 伏尼契手稿.pdf",
    "noteType": "pdf_answer_explanation_ocr",
    "matchedTitle": "Voynich Manuscript 伏尼契手稿",
    "ocrPages": [
      6,
      7
    ],
    "pdfPageCount": 7,
    "fallbackQuestionCount": 0
  },
  "passageNotes": [
    {
      "label": "Source",
      "text": "Explanations were extracted from the answer-analysis table in the source PDF by OCR. Minor OCR mistakes may remain; the official answer key is used for the answer field."
    }
  ],
  "questionExplanations": [
    {
      "sectionTitle": "1. true false not given (Questions 27-30)",
      "mode": "group",
      "items": [
        {
          "questionNumber": 27,
          "text": "题目 27\n答案：TRUE\nPDF 定位：..containing 240-odd pages of drawings and text of unknown age andauthorship.\"（第1段）\nPDF 解析：题干：It is uncertain when the Voynichmanuscriptwas written.文中 明确说手稿\"年代未知（unknownage)\"，即\"写于何时不确定\"，与题干 一致，故为TRUE。",
          "questionId": "q1"
        },
        {
          "questionNumber": 28,
          "text": "题目 28\n答案：NOT GIVEN\nPDF 定位：...known to scholars as the Voynich manuscript, after... wilfrid Voynich, who bought the manuscript from a Jesuit college in Italy in1912.\"（第1段）\nPDF 解析：题干说\"Voynich把手稿捐给贝内克图书馆\"。原文只说他在1912年买到 这部手稿，并未说明之后是否捐赠给耶鲁/贝内克图书馆，也未说明手稿如 何进入馆藏，信息缺失，故为NOTGIVEN。",
          "questionId": "q2"
        },
        {
          "questionNumber": 29,
          "text": "题目 29\n答案：TRUE\nPDF 定位：\"Over the years, the manuscript has attracted the attention of everyone fromamateur dabblerstotop code-breakers...\"(第2段)\nPDF 解析：题干:Interest... extendsbeyond that of academics andprofessional code-breakers.原文\"从业余爱好者到顶尖破译者\"→兴趣超出学者/职 业破译者的范围，故TRUE。",
          "questionId": "q3"
        },
        {
          "questionNumber": 30,
          "text": "题目 30\n答案：FALSE\nPDF 定位：\"It is possible to make out more than 7o distinct symbols among the170,000-charactertext.(第4段)\nPDF 解析：题干说\"justunder70symbols（不到70个）\"。原文为\"超过70个\"，与 题干相反，故FALSE。",
          "questionId": "q4"
        }
      ],
      "questionRange": {
        "start": 27,
        "end": 30
      },
      "text": "题目 27\n答案：TRUE\nPDF 定位：..containing 240-odd pages of drawings and text of unknown age andauthorship.\"（第1段）\nPDF 解析：题干：It is uncertain when the Voynichmanuscriptwas written.文中 明确说手稿\"年代未知（unknownage)\"，即\"写于何时不确定\"，与题干 一致，故为TRUE。\n\n题目 28\n答案：NOT GIVEN\nPDF 定位：...known to scholars as the Voynich manuscript, after... wilfrid Voynich, who bought the manuscript from a Jesuit college in Italy in1912.\"（第1段）\nPDF 解析：题干说\"Voynich把手稿捐给贝内克图书馆\"。原文只说他在1912年买到 这部手稿，并未说明之后是否捐赠给耶鲁/贝内克图书馆，也未说明手稿如 何进入馆藏，信息缺失，故为NOTGIVEN。\n\n题目 29\n答案：TRUE\nPDF 定位：\"Over the years, the manuscript has attracted the attention of everyone fromamateur dabblerstotop code-breakers...\"(第2段)\nPDF 解析：题干:Interest... extendsbeyond that of academics andprofessional code-breakers.原文\"从业余爱好者到顶尖破译者\"→兴趣超出学者/职 业破译者的范围，故TRUE。\n\n题目 30\n答案：FALSE\nPDF 定位：\"It is possible to make out more than 7o distinct symbols among the170,000-charactertext.(第4段)\nPDF 解析：题干说\"justunder70symbols（不到70个）\"。原文为\"超过70个\"，与 题干相反，故FALSE。"
    },
    {
      "sectionTitle": "2. matching (Questions 31-34)",
      "mode": "group",
      "items": [
        {
          "questionNumber": 31,
          "text": "题目 31\n答案：D\nPDF 定位：more often than expected in a standard language, casting doubt on claims that the manuscript concealed a real language..（第4段）\nPDF 解析：题干:the number of times that somewords occurmakes it unlikely...与Friedman的发现一致：词/短语出现过于频繁→不像自 然语言，故选D。",
          "questionId": "q5"
        },
        {
          "questionNumber": 32,
          "text": "题目 32\n答案：A\nPDF 定位：\"Most other mysteries involve second-hand reports, says Dr Gordon Rugg ... But this is one that you can see for yourself\"（第2段）\nPDF 解析：题干强调\"与其他类似对象不同，人们可以直接接触这份手稿\"。 Rugg的原话正是此意，故选A。",
          "questionId": "q6"
        },
        {
          "questionNumber": 33,
          "text": "题目 33\n答案：E\nPDF 定位：\"Others, such as Churchill, have suggested that the sheer weirdness... hints at an author who had lost touch with reality.\"（第9段）\nPDF 解析：题干：作者可能\"不完全神志清醒\"。Churchill认为作者\"与现实脱 节\"，即可能精神失常，语义等价，故选E。",
          "questionId": "q7"
        },
        {
          "questionNumber": 34,
          "text": "题目 34\n答案：C\nPDF 定位：\"Voynich himself believed that the manuscript was the work of Roger Bacon... n 1921 Voynich's view... appeared to win support fromthework of williamNewbold...\"（第3段)\nPDF 解析：题干：作者很可能就是Voynich所指的人。支持这一观点的是 Newbold（虽随后被证伪)，因此对应C。",
          "questionId": "q8"
        }
      ],
      "questionRange": {
        "start": 31,
        "end": 34
      },
      "text": "题目 31\n答案：D\nPDF 定位：more often than expected in a standard language, casting doubt on claims that the manuscript concealed a real language..（第4段）\nPDF 解析：题干:the number of times that somewords occurmakes it unlikely...与Friedman的发现一致：词/短语出现过于频繁→不像自 然语言，故选D。\n\n题目 32\n答案：A\nPDF 定位：\"Most other mysteries involve second-hand reports, says Dr Gordon Rugg ... But this is one that you can see for yourself\"（第2段）\nPDF 解析：题干强调\"与其他类似对象不同，人们可以直接接触这份手稿\"。 Rugg的原话正是此意，故选A。\n\n题目 33\n答案：E\nPDF 定位：\"Others, such as Churchill, have suggested that the sheer weirdness... hints at an author who had lost touch with reality.\"（第9段）\nPDF 解析：题干：作者可能\"不完全神志清醒\"。Churchill认为作者\"与现实脱 节\"，即可能精神失常，语义等价，故选E。\n\n题目 34\n答案：C\nPDF 定位：\"Voynich himself believed that the manuscript was the work of Roger Bacon... n 1921 Voynich's view... appeared to win support fromthework of williamNewbold...\"（第3段)\nPDF 解析：题干：作者很可能就是Voynich所指的人。支持这一观点的是 Newbold（虽随后被证伪)，因此对应C。"
    },
    {
      "sectionTitle": "3. summary completion (Questions 35-39)",
      "mode": "group",
      "items": [
        {
          "questionNumber": 35,
          "text": "题目 35\n答案：microscope\nPDF 定位：*.he manuscript proved that Bacon had access to a microscope ... The claim that this medieval monk had observed living cells.... (第3段)\nPDF 解析：Newbold主张作者能\"通过显微镜观察细胞\"。与\"lookatcells througha\"精准对应。",
          "questionId": "q9"
        },
        {
          "questionNumber": 36,
          "text": "题目 36\n答案：concepts\nPDF 定位/解析：\"Voynichese' is some sort of specially created artificial language, whose words are devised from concepts rather than linguistics.\"（第5段）",
          "questionId": "q10"
        },
        {
          "questionNumber": 37,
          "text": "题目 37\n答案：the computer\nPDF 定位：*..he suspected that major insights would come from using...the computer. In this he was right-it is now the key tool...\" (第6段)\nPDF 解析：Friedman相信\"计算机\"将继续推动破译进展。填\"thecomputer/ computer\"均满足字数要求。",
          "questionId": "q11"
        },
        {
          "questionNumber": 38,
          "text": "题目 38\n答案：spectral analysis\nPDF 定位：*..published the result... using a pattern-detecting method calledspectralanalysis.\"（第7段）\nPDF 解析：Landini采用的方法名即为spectralanalysis。",
          "questionId": "q12"
        },
        {
          "questionNumber": 39,
          "text": "题目 39\n答案：table\nPDF 定位/解析：*..a specially constructed grille is used to pick out symbols from atable..\"\"（第8段）",
          "questionId": "q13"
        }
      ],
      "questionRange": {
        "start": 35,
        "end": 39
      },
      "text": "题目 35\n答案：microscope\nPDF 定位：*.he manuscript proved that Bacon had access to a microscope ... The claim that this medieval monk had observed living cells.... (第3段)\nPDF 解析：Newbold主张作者能\"通过显微镜观察细胞\"。与\"lookatcells througha\"精准对应。\n\n题目 36\n答案：concepts\nPDF 定位/解析：\"Voynichese' is some sort of specially created artificial language, whose words are devised from concepts rather than linguistics.\"（第5段）\n\n题目 37\n答案：the computer\nPDF 定位：*..he suspected that major insights would come from using...the computer. In this he was right-it is now the key tool...\" (第6段)\nPDF 解析：Friedman相信\"计算机\"将继续推动破译进展。填\"thecomputer/ computer\"均满足字数要求。\n\n题目 38\n答案：spectral analysis\nPDF 定位：*..published the result... using a pattern-detecting method calledspectralanalysis.\"（第7段）\nPDF 解析：Landini采用的方法名即为spectralanalysis。\n\n题目 39\n答案：table\nPDF 定位/解析：*..a specially constructed grille is used to pick out symbols from atable..\"\"（第8段）"
    },
    {
      "sectionTitle": "4. single choice (Questions 40-40)",
      "mode": "group",
      "items": [
        {
          "questionNumber": 40,
          "text": "题目 40\n答案：C\nPDF 解析页 OCR：通篇依次回顾多位研究者（Newbold、Friedman、Landini、Zandbergen、Rugg、Churchill）及其方法与结论，展示\"众多破译尝试\"与分歧；并未解释手稿含 义（A）或确认作者身份（B)，也非比较媒体曝光度（D)。因此选Cdescribethenumerousattemptstodecodethemanuscript.",
          "questionId": "q14"
        }
      ],
      "questionRange": {
        "start": 40,
        "end": 40
      },
      "text": "题目 40\n答案：C\nPDF 解析页 OCR：通篇依次回顾多位研究者（Newbold、Friedman、Landini、Zandbergen、Rugg、Churchill）及其方法与结论，展示\"众多破译尝试\"与分歧；并未解释手稿含 义（A）或确认作者身份（B)，也非比较媒体曝光度（D)。因此选Cdescribethenumerousattemptstodecodethemanuscript."
    }
  ]
}
  );
})(typeof window !== "undefined" ? window : globalThis);
