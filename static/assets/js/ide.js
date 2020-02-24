window.Examples = window.Examples || { examples: [] }
window.Wenyan = window.Wenyan || { compile: () => null, KEYWORDS: [] }
window.Wyg = window.Wyg || { list: async () => [] }

// ========== Constants ==========

const EMBED = window.location.pathname === "/embed";
const TITLE = " - 文言 Wenyan Online IDE";
const PACKAGES_LIFETIME = 1000 * 60 * 60; // 60 min
const EXPLORER_WIDTH_MIN = 0;
const EXPLORER_WIDTH_MAX = 400;
const EDITOR_WIDTH_MIN = 150;
const EDITOR_HEIGHT_MIN = 36;
const OUTPUT_HEIGHT_MIN = 36;
const AUTOCOMPLETE_TRIGGER_REGEX = /[a-zA-Z_'"\\\/\*\+-]+$/;
const AUTOCOMPLETE_TRIGGER_NUMBER = /-?[0-9,]*.?[0-9,]+$/;
const CONTROL_KEYCODES = [13, 37, 38, 39, 40, 9, 27]; // Enter, Arrow Keys, etc

if (EMBED) console.debug('Working in Embedded mode')

// ========== Variables ==========

const dhv = document.getElementById("hand-v");
const dhh = document.getElementById("hand-h");
const dhex = document.getElementById("hand-ex");

const exlist = document.getElementById("explorer-list");
const exlistUser = document.getElementById("explorer-list-user");
const exlistExamples = document.getElementById("explorer-list-examples");
const exlistPackages = document.getElementById("explorer-list-packages");
const explorerPackages = document.getElementById("explorer-packages");

const outIframe = document.getElementById("out-iframe");
const outRender = document.getElementById("out-render");
const deleteBtn = document.getElementById("delete-current");
const currentFileName = document.getElementById("current-file-name");
const currentFileAuthor = document.getElementById("current-file-author");
const downloadRenderBtn = document.getElementById("download-render");
const packageInfoPanel = document.getElementById("package-info-panel");

let handv = window.innerWidth * 0.6;
let handh = window.innerHeight * 0.7;
let handex = window.innerWidth * 0.15;

let currentFile = {}
let renderedSVGs = []
let examples = {}
let cache = {}
let snippets = []
let savingLock = false // to ignore changes made from switching files
let editorCM
let jsCM
let customUIs = []

function CheckMigration() {
  return new Promise((resolve, reject) => {
    if (localStorage.getItem('wenyan-ide-migrated') === 'true') {
      return resolve()
    }

    const iframe = document.createElement('iframe')
    iframe.src = 'https://wy-lang.org/__migrate__'
    iframe.style = 'opacity:0;pointer-event:none;'
    document.body.appendChild(iframe)

    const handler = (e) => {
      const { key, value } = e.data
      if (key === 'wenyang-ide') {
        if (value) {
          const obj = JSON.parse(value)
          let set = true
          if (localStorage.getItem('wenyan-ide-files'))
            set = confirm('Migrating from wy-lang.org/ide.\n\nData already exists. Do you want to override?')
          
          if (set) {
            localStorage.setItem('wenyan-ide-files', JSON.stringify(obj.files))
            localStorage.setItem('wenyan-ide-config', JSON.stringify(obj.config))
          }
        }

        localStorage.setItem('wenyan-ide-migrated', 'true')

        window.removeEventListener('message', handler, false);
        iframe.remove()
        resolve()
      }
    }
    window.addEventListener('message', handler, false);

    iframe.onload = () => {
      iframe.contentWindow.postMessage({ key: 'wenyang-ide' }, '*')
    }
  })
}

(async () => {

if (!EMBED)
  await CheckMigration()

// ========== Configs ==========

window.Config = Storage('wenyan-ide-config', {
  lang: "js",
  romanizeIdentifiers: "none",
  dark: false,
  enablePackages: true,
  outputHanzi: true,
  hideImported: true,
  strict: false,
  showInvisibles: false,
  tabSize: 2,
  preferSpace: false,
}, EMBED ? null : localStorage)

window.WygStore = Storage('wenyan-ide-wyg', {
  packages: [],
  last_updated: -Infinity
})

window.Files = Storage('wenyan-ide-files', {
}, EMBED ? null : localStorage)

window.EmbedConfig = Storage('', {
  showConfigs: false,
  showBars: false,
  showCompile: false,
  hideOutput: false,
  readonly: false,
  title: '',
  author: '',
  code: '',
}, null)

// ========== Functions ==========

function camelToKebab(str) {
  return str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
}

function init() {
  for (const key of Object.keys(Examples.examples)) {
    examples[key] = {
      name: key,
      alias: Examples.examplesAlias[key],
      author: "examples",
      readonly: true,
      code: Examples.examples[key]
    };
  }

  for (var k of ["none", "pinyin", "baxter", "unicode"]) {
    var opt = document.createElement("option");
    opt.value = k;
    opt.innerHTML = k;
    document.querySelector("#config-romanize select").appendChild(opt);
  }

  for (var [value, display] of [
    ["js", "Javascript"],
    ["py", "Python"],
    ["rb", "Ruby"]
  ]) {
    var opt = document.createElement("option");
    opt.value = value;
    opt.innerHTML = display;
    document.querySelector("#config-lang select").appendChild(opt);
  }

  snippets = [
    { text: "批曰。", trigger: "//" },
    { text: "批曰。「「", trigger: "/*" },
    { text: "」」", trigger: "*/" },
    { text: "加", trigger: "+" },
    { text: "減", trigger: "-" },
    { text: "乘", trigger: "*" },
    { text: "除", trigger: "/" },
    { text: "。", trigger: "." },
    { text: "、", trigger: "," },
    { text: "「", trigger: "'" },
    { text: "」", trigger: "'" },
    { text: "「「", trigger: '"' },
    { text: "」」", trigger: '"' },
    ...Object.keys(Wenyan.KEYWORDS).map(x => ({
      text: x,
      trigger:
        x.length > 1
          ? Wenyan.hanzi2pinyin(x)
            .replace(/([A-z])[A-z]+?([1-9])/g, "$1")
            .toLowerCase()
          : Wenyan.hanzi2pinyin(x).toLowerCase()
    }))
  ];

  snippets.sort((a, b) => a.trigger.localeCompare(b.trigger));
  snippets.forEach(s => {
    s.displayText = s.text;
  });
}

function initConfigComponents() {
  const checkboxes = document.querySelectorAll(
    "button[data-config]:not(.dropdown)"
  );
  for (const cb of checkboxes) {
    cb.classList.toggle("checked", Config[cb.dataset.config]);

    cb.addEventListener("click", () => {
      cb.classList.toggle("checked");
      Config[cb.dataset.config] = cb.classList.contains("checked");
    });
  }

  const dropdowns = document.querySelectorAll("button.dropdown[data-config]");
  for (const dd of dropdowns) {
    const value = dd.querySelector(".value");
    const select = dd.querySelector("select");

    select.value = Config[dd.dataset.config];
    if (select.selectedOptions[0])
      value.innerText = select.selectedOptions[0].innerText;

    select.addEventListener("change", () => {
      value.innerText = select.selectedOptions[0].innerText;
      Config[dd.dataset.config] = select.value;
    });
  }
}

function getBarHeight() {
  if (EMBED && !EmbedConfig.showBars)
    return 0
  return 35
}

function initEmbed() {
  document.body.classList.toggle('embed', true)

  const query = new URLSearchParams(location.search);
  function updateConfigFromQuery(config) {
    for (const key of Object.keys(config)) {
      const value = query.get(camelToKebab(key))
      if (value == null)
        config[key] = config[key]
      else if (value === '')
        config[key] = true
      else if (value === 'false')
        config[key] = false
      else
        config[key] = value
    }
  }

  EmbedConfig.on('showConfigs', v => {
    document.body.classList.toggle('show-configs', v)
  })

  EmbedConfig.on('showCompile', v => {
    document.body.classList.toggle('show-compile', v)
    handv = v ? window.innerWidth * 0.5 : window.innerWidth;
    setView()
  })

  EmbedConfig.on('showBars', v => {
    document.body.classList.toggle('show-bars', v)
    setView()
  })

  EmbedConfig.on('hideOutput', v => {
    document.body.classList.toggle('show-output', !v)
    handh = (!v) ? window.innerHeight * 0.7 : window.innerHeight;
    setView()
  })

  EmbedConfig.on('title', v => {
    currentFile.name = decodeURIComponent(v || '')
    loadFile()
  })

  EmbedConfig.on('code', v => {
    currentFile.code = decodeURIComponent(v || '')
    loadFile()
  })

  EmbedConfig.on('readonly', v => {
    jsCM.setOption('readOnly', v)
    editorCM.setOption('readOnly', v)
  })

  updateConfigFromQuery(Config)
  updateConfigFromQuery(EmbedConfig)

  handex = 0;

  if (query.get('autorun') != null)
    crun()

  window.addEventListener('message', (e) => {
    const { action, field, value } = e.data || {}
    if (action === 'config') {
      if (field in Config)
        Config[field] = value
      else if (field in EmbedConfig)
        EmbedConfig[field] = value
      else
        throw new Error(`Invalid field "${field}" to set config to.`)
    } else if (action === 'title') {
      currentFile.name = value
      loadFile()
    } else if (action === 'author') {
      currentFile.author = value
      loadFile()
    } else if (action === 'info') {
      sendCurrentToParent()
    } else if (action === 'code') {
      currentFile.code = value
      loadFile()
    } else if (action === 'run') {
      crun()
    } else if (action === 'clear') {
      resetOutput()
    } else if (action === 'custom') {
      if (field === 'clear') {
        customUIs = []
      } else if (field === 'modify') {
        const idx = customUIs.findIndex(i=>i.name === value.name)
        if (idx >= 0)
          customUIs[idx] = value
      } else if (field === 'set') {
        customUIs = value
      } else {
        if (Array.isArray(value))
          customUIs.push(...value)
        else
          customUIs.push(value)
      }
      updateCustomUIs()
    } else {
      throw new Error('Invalid command ' + JSON.stringify(e.data))
    }
  })
}

function updateCustomUIs() {
  const containers = [
    'custom-editor-left',
    'custom-editor-right',
    'custom-output-left',
    'custom-output-right',
  ]
  for (const c of containers)
    document.getElementById(c).innerHTML = ''
  
  for (const config of customUIs) {
    const {
      id,
      icon,
      text,
      type = 'button',
      bar = 'editor',
      align = 'left',
      disabled = false,
    } = config

    const container = `custom-${bar}-${align}`

    const button = document.createElement('button')

    if (icon) {
      const iconEl = document.createElement('span')
      iconEl.classList = 'iconify'
      iconEl.dataset.icon = icon.includes(':') ? icon : `mdi:${icon}`
      iconEl.dataset.inline = 'false'
      button.classList.add('icon')
      button.appendChild(iconEl)
    }
    else if (text) {
      const textEl = document.createElement('span')
      textEl.innerText = text
      button.appendChild(textEl)
    }
    button.classList.add('custom')
    if (disabled)
      button.setAttribute('disabled', '')
    else
      button.removeAttribute('disabled', '')
    button.dataset.id = id
    button.onclick = e => sendCustomButtonClick(id, e)

    const el = document.getElementById(container)
    if (el)
      el.appendChild(button)
  }

  for (const c of containers) {
    const el = document.getElementById(c)
    el.classList.toggle('hidden', !el.innerHTML)
  }
}

function sendCustomButtonClick(id, event) {
  sendToParent({
    action: 'custom',
    id,
    event: JSON.parse(JSON.stringify(event))
  })
}

function registerHandlerEvents(handler, set) {
  function start(e) {
    e.preventDefault();
    const mouseHandler = event => {
      if (event.buttons === 1) {
        let x = event.pageX;
        let y = event.pageY;
        set({ x, y });
        setView();
      }
    };

    const touchHandler = event => {
      if (event.touches.length) {
        var x = event.touches[0].clientX;
        var y = event.touches[0].clientY;
        set({ x, y });
        setView();
      }
    };

    const clear = () => {
      document.body.removeEventListener("mousemove", mouseHandler);
      document.body.removeEventListener("touchmove", touchHandler);
      document.body.removeEventListener("mouseup", clear);
      document.body.removeEventListener("touchend", clear);
      document.body.removeEventListener("touchcancel", clear);
    };

    document.body.addEventListener("mousemove", mouseHandler);
    document.body.addEventListener("touchmove", touchHandler);
    document.body.addEventListener("mouseup", clear);
    document.body.addEventListener("touchend", clear);
    document.body.addEventListener("touchcancel", clear);
  }

  handler.addEventListener("mousedown", start);
  handler.addEventListener("touchstart", start);
}

function setView() {
  const W = window.innerWidth;
  const H = window.innerHeight;

  if (EMBED) {
    if (!EmbedConfig.showCompile)
      handv = W;
    if (EmbedConfig.hideOutput)
      handh = H;
  }
      
  document.body.style.setProperty('--handh', `${handh / H * 100}vh`);
  document.body.style.setProperty('--handex', `${handex / W * 100}vw`);
  document.body.style.setProperty('--handv', `${handv / W * 100}vw`);
  document.body.style.setProperty('--bar-height', `${getBarHeight()}px`);
}

function hideImportedModules(source) {
  const markerRegex = /\/\*___wenyan_module_([\s\S]+?)_(start|end)___\*\//g;
  const matches = [];

  var match;
  while ((match = markerRegex.exec(source))) {
    if (!match) break;

    if (matches.length) {
      const prev = matches[matches.length - 1];
      if (prev[2] !== "end" && prev[1] !== match[1]) continue; // ignore nested imports
    }

    matches.push(match);
  }

  for (const match of matches) {
    if (match[2] === "start") continue;

    source = source.replace(
      new RegExp(
        `\\/\\*___wenyan_module_${match[1]}_start___\\*\\/[\\s\\S]*\\/\\*___wenyan_module_${match[1]}_end___\\*\\/`
      ),
      `/* module ${match[1]} is hidden */\n`
    );
  }

  return source;
}

function initExplorer() {
  updateExplorerList();

  var toggler = document.getElementsByClassName("caret");
  var i;

  for (i = 0; i < toggler.length; i++) {
    toggler[i].addEventListener("click", function () {
      this.parentElement.querySelector(".nested").classList.toggle("active");
      this.classList.toggle("active");
    });
  }
}

function updateExplorerList() {
  if (EMBED)
    return
  exlistExamples.innerHTML = "";
  for (let file of Object.values(examples)) {
    exlistExamples.appendChild(createExplorerEntry(file));
  }

  exlistUser.innerHTML = "";
  for (let file of Object.values(Files)) {
    exlistUser.appendChild(createExplorerEntry(file));
  }

  explorerPackages.classList.toggle("hidden", !Config.enablePackages);
  if (Config.enablePackages) {
    exlistPackages.innerHTML = "";
    for (let pkg of WygStore.packages) {
      exlistPackages.appendChild(createExplorerPackageEntry(pkg));
    }
  }
}

function createExplorerEntry({ name, alias }) {
  const item = document.createElement("li");
  item.value = name;

  if (currentFile.name === name) item.classList.add("active");

  const a = document.createElement("span");
  const n = document.createElement("span");
  n.classList.add("name");
  n.innerText = alias || name;
  item.appendChild(n);
  if (alias) {
    a.classList.add("alias");
    a.innerText = name;
    item.appendChild(a);
  }
  item.onclick = () => openFile(name);
  return item;
}

function createExplorerPackageEntry(pkg) {
  const { name, author } = pkg;
  const item = document.createElement("li");
  item.value = name;

  const a = document.createElement("span");
  const n = document.createElement("span");
  n.classList.add("name");
  n.innerText = name;
  item.appendChild(n);
  a.classList.add("alias");
  a.innerText = "by " + author;
  item.appendChild(a);
  item.onclick = () => showPackageInfo(pkg);
  return item;
}

function openFile(name) {
  var searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get("file") !== name) {
    searchParams.set("file", name);
    history.pushState({ file: name }, name, "?" + searchParams.toString());
  }
  loadFile(name);
}

function loadFile(name = currentFile.name) {
  const newFile = currentFile.name !== name
  if (newFile) {
    currentFile = Files[name] || examples[name];
    if (!currentFile) {
      currentFile = { name, code: "" };
      Files[name] = currentFile;
    }
  }
  savingLock = true;
  editorCM.setValue(currentFile.code || "");
  savingLock = false;
  document.title = (currentFile.alias || currentFile.name) + TITLE;
  currentFileName.innerText = currentFile.alias || currentFile.name;
  if (currentFile.author)
    currentFileAuthor.innerText = `by ${currentFile.author}`;
  currentFileAuthor.classList.toggle('hidden', !currentFile.author) 
  updateExplorerList();
  deleteBtn.classList.toggle("hidden", !!currentFile.readonly);
  document.body.classList.toggle("readonly", currentFile.readonly || EmbedConfig.readonly);

  if (newFile) {
    if (currentFile.readonly) {
      crun();
    } else {
      resetOutput()
    }
  }
}

function parseUrlQuery() {
  const query = new URLSearchParams(location.search);

  loadFile(query.get("file") || "mandelbrot");
  updateExperimentFeatures(query.get("experiment") != null);
}

function updateExperimentFeatures(value) {
  document
    .querySelectorAll('[experiment="true"]')
    .forEach(i => i.classList.toggle("hidden", !value));
}

function deleteCurrentFile() {
  const yes = confirm(
    `Are you sure to delete file ${currentFile.alias ||
    currentFile.alias}?\n\nThis operation can NOT be undone.`
  );
  if (yes) {
    delete Files[currentFile.name];
    openFile(Object.keys(Files)[0] || "mandelbrot");
  }
}

function createNewFile() {
  const name = prompt("New filename", "Untitled");
  if (name) openFile(name);
}

function downloadCurrentFile() {
  var blob = new Blob([currentFile.code], {
    type: "text/wenyan;charset=utf-8"
  });
  saveAs(blob, `${currentFile.alias || currentFile.name}.wy`);
}

function downloadRenders() {
  const name = currentFile.alias || currentFile.name;
  if (renderedSVGs.length === 1) {
    var blob = new Blob([renderedSVGs[0]], {
      type: "image/svg+xml;charset=utf-8"
    });
    saveAs(blob, `${name}.svg`);
  } else {
    renderedSVGs.forEach((svg, i) => {
      var blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      saveAs(blob, `${name}-${i}.svg`);
    });
  }
}

function toggleHelp() {
  document.getElementById("setting-panel").classList.toggle("hidden", true);
  document.getElementById("help-panel").classList.toggle("hidden");
}

function toggleSettingPanel() {
  document.getElementById("help-panel").classList.toggle("hidden", true);
  document.getElementById("setting-panel").classList.toggle("hidden");
}

function renameCurrentFile() {
  if (currentFile.readonly || EmbedConfig.readonly) 
    return
  const name = prompt("Rename", currentFile.alias || currentFile.name);
  if (name) {
    delete Files[currentFile.name];
    delete currentFile.alias;
    currentFile.name = name;
    Files[name] = currentFile;
    openFile(name);
  }
  sendCurrentToParent()
}

function changeCurrentFileAuthor() {
  if (currentFile.readonly || EmbedConfig.readonly) 
    return
  const author = prompt("Rename", currentFile.author || '')
  if (!author)
    return

  currentFile.author = author
  openFile()
  sendCurrentToParent()
}

function showHint() {
  CodeMirror.showHint(
    editorCM,
    () => {
      const cursor = editorCM.getCursor();
      let start = cursor.ch - 30;
      const text = editorCM.getRange({ line: cursor.line, ch: start }, cursor);
      const end = cursor.ch;
      const line = cursor.line;

      let match
      if (match = text.match(AUTOCOMPLETE_TRIGGER_NUMBER)) {
        return {
          list: [Wenyan.num2hanzi(+match[0].replace(/,/g, ''))],
          from: CodeMirror.Pos(line, end - match[0].length),
          to: CodeMirror.Pos(line, end)
        }
      }
      else if (match = text.match(AUTOCOMPLETE_TRIGGER_REGEX)) {
        const list =
        match[0] === "\\"
          ? snippets
          : snippets.filter(item => item.trigger.startsWith(match[0]));

        return {
          list: list,
          from: CodeMirror.Pos(line, end - match[0].length),
          to: CodeMirror.Pos(line, end)
        };
      }
    },
    { completeSingle: false }
  );
}

function getImportContext() {
  let context = {
    ...Examples.examples
  };

  for (const key of Object.keys(Files)) {
    context[key] = Files[key].code;
  }

  if (Config.enablePackages) {
    for (const pkg of WygStore.packages) {
      context[pkg.name] = {
        entry: pkg.entry
      };
    }
  }

  return context;
}

function loadPackages() {
  updateExplorerList();
  if (
    Config.enablePackages &&
    Date.now() - WygStore.last_updated > PACKAGES_LIFETIME
  ) {
    Wyg.list().then(packages => {
      WygStore.packages = packages;
      WygStore.last_updated = +Date.now();
      updateExplorerList();
      crun();
    });
  }
}

let iframeInitiated = false

function resetOutput() {
  if (iframeInitiated) {
    outIframe.onload = undefined;
    outIframe.contentWindow.location.reload();
  }
  iframeInitiated = true
  outIframe.classList.toggle("hidden", false);
  outRender.classList.toggle("hidden", true);
  downloadRenderBtn.classList.toggle("hidden", true);
  jsCM.setValue('')
  renderedSVGs = [];
}

function updateCompiled(code) {
  var showcode = Config.hideImported ? hideImportedModules(code) : code;

  jsCM.setOption(
    "mode",
    {
      js: "javascript",
      py: "python",
      rb: "ruby"
    }[Config.lang]
  );

  if (Config.lang === "js") {
    jsCM.setValue(js_beautify(showcode, {
      indent_size: 2,
    }));
  } else {
    jsCM.setValue(code);
  }
}

function compile() {
  resetOutput();
  var log = "";
  try {
    let errorLog = "";
    var code = Wenyan.compile(editorCM.getValue(), {
      lang: Config.lang,
      romanizeIdentifiers: Config.romanizeIdentifiers,
      resetVarCnt: true,
      errorCallback: (...args) => (errorLog += args.join(" ") + "\n"),
      importContext: getImportContext(),
      importCache: cache,
      logCallback: x => {
        log += x + "\n";
      },
      strict: Config.strict
    });
    if (errorLog) {
      send({ text: errorLog });
      return;
    }
    if (Config.strict) {
      var sig = log
        .split("=== [PASS 2.5] TYPECHECK ===\n")[1]
        .split("=== [PASS 3] COMPILER ===")[0];
      send({ text: sig });
    }

    updateCompiled(code);
  } catch (e) {
    send({ text: e.toString() });
    console.error(e);
  }
}

function sendToParent(data) {
  if (window.parent !== window) {
    window.parent.postMessage({
      source: 'wenyan-ide',
      ...data
    }, '*')
  }
}

function send(data) {
  outIframe.onload = () => {
    outIframe.contentWindow.postMessage(data, "*");
  };
}

function executeCode(code) {
  send({
    code,
    options: {
      lang: Config.lang,
      outputHanzi: Config.outputHanzi
    }
  });
}

function sendCurrentToParent() {
  sendToParent({
    action: 'info',
    value: currentFile
  })
}

function run() {
  resetOutput();
  executeCode(jsCM.getValue());
}

function crun() {
  resetOutput();
  try {
    let errorOutput = "";
    var code = Wenyan.compile(editorCM.getValue(), {
      lang: Config.lang,
      romanizeIdentifiers: Config.romanizeIdentifiers,
      resetVarCnt: true,
      errorCallback: (...args) =>
        (errorOutput.innerText += args.join(" ") + "\n"),
      importContext: getImportContext(),
      importCache: cache,
      strict: Config.strict
    });

    updateCompiled(code);

    executeCode(code);
  } catch (e) {
    send({ text: e.toString() });
    jsCM.setValue("");
    console.error(e);
  }
}

function updateDark() {
  if (Config.dark) {
    document.body.style.filter = "invert(0.88)";
  } else {
    document.body.style.filter = "invert(0)";
  }
  document
    .getElementById("dark-icon-sunny")
    .classList.toggle("hidden", !Config.dark);
  document
    .getElementById("dark-icon-night")
    .classList.toggle("hidden", Config.dark);
}

function saveFile() {
  if (!currentFile.readonly)
    Files[currentFile.name] = currentFile
}

function render() {
  outRender.innerText = "";
  renderedSVGs = Render.render(
    currentFile.alias || currentFile.name,
    currentFile.code
  );
  for (const svg of renderedSVGs) {
    outRender.innerHTML += svg + "<br>";
  }
  outIframe.classList.toggle("hidden", true);
  outRender.classList.toggle("hidden", false);
  downloadRenderBtn.classList.toggle("hidden", false);
}

function showPackageInfo(pkg) {
  packageInfoPanel.querySelector(".import").onclick = () =>
    importPackageIntoCurrent(pkg);
  packageInfoPanel.querySelector(".title").innerText = pkg.name;
  packageInfoPanel.querySelector(".author").innerText = pkg.author;
  packageInfoPanel
    .querySelector(".description")
    .classList.toggle("hidden", !pkg.description);
  packageInfoPanel.querySelector(".description").innerText = pkg.description;
  packageInfoPanel
    .querySelector(".home-link")
    .classList.toggle("hidden", !pkg.repo);
  packageInfoPanel.querySelector(".home-link").href = Wyg.getRepoRoot(pkg.repo);
  packageInfoPanel.classList.toggle("hidden", false);
}

function closePackageInfo() {
  packageInfoPanel.classList.toggle("hidden", true);
}
window.closePackageInfo = closePackageInfo;

function importPackageIntoCurrent({ name }) {
  editorCM.setValue(`吾嘗觀「「${name}」」之書。\n${editorCM.getValue()}`);
  closePackageInfo();
}

function format() {
  let code = editorCM.getValue()
  if (!Config.preferSpace) {
    const regex = new RegExp(`^([\s\t]*)[ ]{${Config.tabSize}}([\s\t]*)`, 'gm')
    let prev_code = code
    while (true) {
      prev_code = code
      code = code.replace(regex, '$1\t$2')
      if (prev_code === code)
        break
    }
    // remove single spaces
    code = code.replace(/^(\t*)[ ]+/gm, '$1')
  }
  else {
    const spaces = new Array(Config.tabSize).fill(' ').join('')
    const regex = new RegExp(`^([\s\t]*)\t`, 'gm')
    let prev_code = code
    while (true) {
      prev_code = code
      code = code.replace(regex, `$1${spaces}`)
      if (prev_code === code)
        break
    }
  }

  // remove tailing spaces
  code = code.replace(/[ \t]*$/gm, '')
  editorCM.setValue(code)
}

/* =========== Scripts =========== */

init();

editorCM = CodeMirror(document.getElementById("in"), {
  value: "",
  mode: "wenyan",
  lineNumbers: true,
  theme: "wenyan-light",
  styleActiveLine: true,
  tabSize: 2,
  indentWithTabs: true,
  showInvisibles: Config.showInvisibles,
  extraKeys: {
    "Shift-Enter": crun,
    "Alt-Enter": compile
  }
});

editorCM.setSize(null, "100%");

jsCM = CodeMirror(document.getElementById("js"), {
  value: "",
  mode: "javascript",
  lineNumbers: true,
  theme: "wenyan-light",
  tabSize: 2,
  styleActiveLine: true
});

jsCM.setSize(null, "100%");

editorCM.on("change", e => {
  if (savingLock) return;

  if (!currentFile.readonly) {
    currentFile.code = editorCM.getValue();
    saveFile();
  } else {
    // make a copy for examples
    let num = 1;
    while (Files[`${currentFile.name}_${num}`]) {
      num += 1;
    }
    const name = `${currentFile.name}_${num}`;
    const newFile = {
      name: name,
      alias: currentFile.alias
        ? `${currentFile.alias}「${Wenyan.num2hanzi(num)}」`
        : "",
      code: editorCM.getValue()
    };
    Files[name] = newFile;
    currentFile = newFile;
    openFile(name);
  }

  if (EMBED)
    sendCurrentToParent()
});

editorCM.on("keyup", (cm, event) => {
  if (!CONTROL_KEYCODES.includes(event.keyCode)) showHint();
});

registerHandlerEvents(dhv, ({ x }) => {
  x = Math.max(x, handex + EDITOR_WIDTH_MIN);
  x = Math.min(x, window.innerWidth - EDITOR_WIDTH_MIN);
  handv = x;
});

registerHandlerEvents(dhh, ({ y }) => {
  y = Math.max(y, EDITOR_HEIGHT_MIN);
  y = Math.min(y, window.innerHeight - OUTPUT_HEIGHT_MIN);
  handh = y;
});

registerHandlerEvents(dhex, ({ x }) => {
  x = Math.max(x, EXPLORER_WIDTH_MIN);
  x = Math.min(x, EXPLORER_WIDTH_MAX, handv - EDITOR_WIDTH_MIN);
  handex = x;
});

window.addEventListener('keydown', evt => {
  if (evt.key === 's' && (evt.ctrlKey || evt.metaKey)) {
    sendToParent({ action: 'save' })
    evt.preventDefault()
  }
})

document.getElementById("compile").onclick = compile;
document.getElementById("run").onclick = run;
document.getElementById("crun").onclick = crun;
document.getElementById("new-file").onclick = createNewFile;
document.getElementById("download-current").onclick = downloadCurrentFile;
document.getElementById("help-button").onclick = toggleHelp;
document.getElementById("setting-button").onclick = toggleSettingPanel;
document.getElementById("rend").onclick = render;
downloadRenderBtn.onclick = downloadRenders;
deleteBtn.onclick = deleteCurrentFile;
currentFileName.onclick = renameCurrentFile;
currentFileAuthor.onclick = changeCurrentFileAuthor;

window.addEventListener("resize", setView);
if (!EMBED)
  window.addEventListener("popstate", parseUrlQuery);

initConfigComponents();
loadPackages();

Config.on('dark', updateDark, true)
Config.on('hideImported', () => crun())
Config.on('outputHanzi', () => crun())
Config.on('romanizeIdentifiers', () => crun())
Config.on('lang', () => crun())
Config.on('enablePackages', () => {
  loadPackages();
  crun();
})
Config.on('showInvisibles', (v) => {
  editorCM.setOption('showInvisibles', v)
  document.body.classList.toggle('show-invisibles', v)
})

if (EMBED)
  initEmbed();
else {
  parseUrlQuery();
  initExplorer();
}
setView();

document.body.classList.toggle('invisible')
})()
