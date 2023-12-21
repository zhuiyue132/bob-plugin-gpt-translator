//@ts-check

var lang = require("./lang.js");
var ChatGPTModels = ["gpt-3.5-turbo"];

var SYSTEM_PROMPT =
  "You are a translation engine that can only translate text and cannot interpret it.";

var HttpErrorCodes = {
  400: "Bad Request",
  401: "Unauthorized",
  402: "Payment Required",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  407: "Proxy Authentication Required",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  411: "Length Required",
  412: "Precondition Failed",
  413: "Payload Too Large",
  414: "URI Too Long",
  415: "Unsupported Media Type",
  416: "Range Not Satisfiable",
  417: "Expectation Failed",
  418: "I'm a teapot",
  421: "Misdirected Request",
  422: "Unprocessable Entity",
  423: "Locked",
  424: "Failed Dependency",
  425: "Too Early",
  426: "Upgrade Required",
  428: "Precondition Required",
  429: "Too Many Requests",
  431: "Request Header Fields Too Large",
  451: "Unavailable For Legal Reasons",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
  505: "HTTP Version Not Supported",
  506: "Variant Also Negotiates",
  507: "Insufficient Storage",
  508: "Loop Detected",
  510: "Not Extended",
  511: "Network Authentication Required",
};

/**
 *  生成一个 uuid
 * @returns
 */
function uuid() {
  let d = new Date().getTime();
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    d += performance.now(); // 添加性能参数以提高唯一性
  }
  const uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    function (c) {
      const r = (d + Math.random() * 16) % 16 | 0;
      d = Math.floor(d / 16);
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    }
  );
  return uuid;
}

/**
 * @param {string}  url
 * @returns {string}
 */
function ensureHttpsAndNoTrailingSlash(url) {
  const hasProtocol = /^[a-z]+:\/\//i.test(url);
  const modifiedUrl = hasProtocol ? url : "https://" + url;

  return modifiedUrl.endsWith("/") ? modifiedUrl.slice(0, -1) : modifiedUrl;
}

/**
 * The header object.
 */
function buildHeader() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${$option.apiKey}`,
  };
}

/**
 * @param {Bob.TranslateQuery} query
 * @returns {{
 *  generatedSystemPrompt: string,
 *  generatedUserPrompt: string
 * }}
 */
function generatePrompts(query) {
  let generatedSystemPrompt = SYSTEM_PROMPT;
  const { detectFrom, detectTo } = query;
  const sourceLang = lang.langMap.get(detectFrom) || detectFrom;
  const targetLang = lang.langMap.get(detectTo) || detectTo;
  let generatedUserPrompt = `translate from ${sourceLang} to ${targetLang}`;

  if (detectTo === "wyw" || detectTo === "yue") {
    generatedUserPrompt = `翻译成${targetLang}`;
  }

  if (
    detectFrom === "wyw" ||
    detectFrom === "zh-Hans" ||
    detectFrom === "zh-Hant"
  ) {
    if (detectTo === "zh-Hant") {
      generatedUserPrompt = "翻译成繁体白话文";
    } else if (detectTo === "zh-Hans") {
      generatedUserPrompt = "翻译成简体白话文";
    } else if (detectTo === "yue") {
      generatedUserPrompt = "翻译成粤语白话文";
    }
  }
  if (detectFrom === detectTo) {
    generatedSystemPrompt =
      "You are a text embellisher, you can only embellish the text, don't interpret it.";
    if (detectTo === "zh-Hant" || detectTo === "zh-Hans") {
      generatedUserPrompt = "润色此句";
    } else {
      generatedUserPrompt = "polish this sentence";
    }
  }

  generatedUserPrompt = `${generatedUserPrompt}:\n\n${query.text}`;

  return { generatedSystemPrompt, generatedUserPrompt };
}

/**
 * @param {string} prompt
 * @param {Bob.TranslateQuery} query
 * @returns {string}
 */
function replacePromptKeywords(prompt, query) {
  if (!prompt) return prompt;
  return prompt
    .replace("$text", query.text)
    .replace("$sourceLang", query.detectFrom)
    .replace("$targetLang", query.detectTo);
}

function buildRequestBody(query) {
  let { customUserPrompt } = $option;
  const { generatedUserPrompt, generatedSystemPrompt } = generatePrompts(query);
  customUserPrompt = replacePromptKeywords(customUserPrompt, query);

  const userPrompt = `${SYSTEM_PROMPT}${
    customUserPrompt || generatedUserPrompt
  }`;

  return {
    stream: false,
    model: ChatGPTModels[0],
    messages: [
      { role: "system", content: generatedSystemPrompt },
      { role: "user", content: userPrompt },
    ],
  };
}

function handleError(completion, result) {
  const { statusCode } = result.response;
  const reason = statusCode >= 400 && statusCode < 500 ? "param" : "api";
  completion({
    error: {
      type: reason,
      message: `接口响应错误 - ${HttpErrorCodes[statusCode]}`,
      addtion: `${JSON.stringify(result)}`,
    },
  });
}

/**
 * @type {Bob.Translate}
 */
function translate(query, completion) {
  if (!lang.langMap.get(query.detectTo)) {
    completion({
      error: {
        type: "unsupportLanguage",
        message: "不支持该语种",
        addtion: "不支持该语种",
      },
    });
  }

const { apiUrl } = $option;


  if (!apiUrl) {
    completion({
      error: {
        type: "secretKey",
        message: "配置错误 - 请确保您在插件配置中填入了正确的 API URL",
        addtion: "请在插件配置中填写 API URL",
      },
    });
  }

  const modifiedApiUrl = ensureHttpsAndNoTrailingSlash(apiUrl);

  let apiUrlPath = "/v1/chat/completions";

  const header = buildHeader();
  const body = buildRequestBody(query);

  let targetText = ""; // 初始化拼接结果变量
  (async () => {
    await $http.request({
      method: "POST",
      url: modifiedApiUrl + apiUrlPath,
      header,
      body: { ...body },
      handler: async (result) => {
        if (result.response.statusCode >= 400) {
          handleError(completion, result);
        } else {
          $log.info(`result: ${JSON.stringify(result)}`);

          targetText = result.data.choices[0].message.content;
          completion({
            result: {
              from: query.detectFrom,
              to: query.detectTo,
              toParagraphs: [targetText],
            },
          });
        }
      },
    });
  })().catch((err) => {
    completion({
      error: {
        type: err._type || "unknown",
        message: err._message || "未知错误",
        addtion: err._addition,
      },
    });
  });
}

function supportLanguages() {
  return lang.supportLanguages.map(([standardLang]) => standardLang);
}

exports.supportLanguages = supportLanguages;
exports.translate = translate;
