// =========================
// Life & Slime main.js
// =========================

// 画面管理
const screens = {
  home: document.getElementById("screen-home"),
  log: document.getElementById("screen-log"),
  inn: document.getElementById("screen-inn"),
  settings: document.getElementById("screen-settings"), 
};

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[name].classList.add("active");
}

// =========================
// 日付キーまわり
// =========================

function getTodayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `slife_day_${yyyy}-${mm}-${dd}`;
}

function getPreviousKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `slife_day_${yyyy}-${mm}-${dd}`;
}

// =========================
// 今日のログ（メモリ上）
// =========================

const currentLog = {
  sleep: null,    // 数値（1〜5想定）
  water: null,    // 数値（1〜4）
  activity: null, // "rest" | "walk" | "move" | "house"
  meal: null,     // "good" | "normal" | "light" | "skip"
  medTaken: null, // ← 追加
};

// =========================
// スライフ全体設定
// =========================

let slifeSettings = {
  hasMedication: false,
  medName: "",
  targetSleepHours: 7,
};

function loadSettingsFromStorage() {
  const raw = localStorage.getItem("slife_settings");
  if (!raw) return;

  try {
    const saved = JSON.parse(raw);
    slifeSettings = {
      ...slifeSettings,
      ...saved,
    };
  } catch (e) {
    console.error("Failed to parse slife_settings:", e);
  }
}

function saveSettingsToStorage() {
  localStorage.setItem("slife_settings", JSON.stringify(slifeSettings));
}


// =========================
// 選択ボタンのハンドラ
// =========================

function attachChoiceHandlers() {
  const rows = document.querySelectorAll(".choice-row");
  rows.forEach((row) => {
    const field = row.dataset.field;

    row.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        // 見た目の選択状態
        row.querySelectorAll("button").forEach((b) => {
          b.classList.remove("selected");
        });
        btn.classList.add("selected");

        // 値を currentLog に反映
        const value = btn.dataset.value;
        if (field === "water" || field === "sleep") {
          currentLog[field] = Number(value);
        } else {
          currentLog[field] = value;
        }
      });
    });
  });
}

// =========================
// 保存 / 読み込み
// =========================

function saveTodayToStorage() {
  const key = getTodayKey();
  const payload = {
    date: key.replace("slife_day_", ""),
    ...currentLog,
    medTaken: currentLog.medTaken ?? null, // ← 追加
  };
  localStorage.setItem(key, JSON.stringify(payload));
}

function loadTodayFromStorage() {
  const key = getTodayKey();
  const raw = localStorage.getItem(key);
  if (!raw) return;

  try {
    const saved = JSON.parse(raw);
    ["sleep", "water", "activity", "meal", "medTaken"].forEach((field) => {
      if (saved[field] != null) currentLog[field] = saved[field];
    });

    // ボタンの選択状態復元
    document.querySelectorAll(".choice-row").forEach((row) => {
      const field = row.dataset.field;
      const savedValue = currentLog[field];
      if (savedValue == null) return;

      const valueStr = String(savedValue);
      row.querySelectorAll("button").forEach((btn) => {
        if (btn.dataset.value === valueStr) {
          btn.classList.add("selected");
        }
      });
    });
  } catch (e) {
    console.error("Failed to parse stored log:", e);
  }
}

// =========================
// スコア計算 & 状態判定
// =========================

// 生のスコアを返す（感情判定用）
function getRawScore(log) {
  let score = 0;

  // 睡眠
  if (log.sleep != null) {
    const s = Number(log.sleep);
    if (s >= 5) score += 2;
    else if (s >= 3) score += 1;
    else score -= 1;
  }

  // 水分
  if (typeof log.water === "number") {
    if (log.water >= 3) score += 2;
    else if (log.water === 2) score += 1;
    else score -= 1;
  }

  // 活動
  if (log.activity) {
    if (log.activity === "move" || log.activity === "walk") {
      score += 1;
    }
  }

  // 食事
  if (log.meal) {
    if (log.meal === "good") score += 2;
    else if (log.meal === "normal") score += 1;
    else score -= 1;
  }

  return score;
}

// 状態（good / normal / tired / exhausted / none）
function evaluateState(log) {
  if (!log.sleep && !log.water && !log.activity && !log.meal) {
    return "none";
  }

  const score = getRawScore(log);

  if (score >= 4) return "good";
  if (score >= 1) return "normal";
  if (score >= -1) return "tired";
  return "exhausted";
}

// =========================
// 感情判定（sleepy / hungry / thirsty / cared / fragile / proud）
// =========================

function determineEmotion(log, state) {
  // 1. 寝不足を最優先
  if (log.sleep == 1 || log.sleep == 2) {
    return "sleepy";
  }

  // 2. 水分がかなり少ない日は「thirsty」
  if (typeof log.water === "number" && log.water === 1) {
    return "thirsty";
  }

  // 3. 空腹（meal skip or light）
  if (log.meal === "skip" || log.meal === "light") {
    return "hungry";
  }

  // 4. 薬まわり
  if (log.medTaken === "yes") {
    // 飲めた日は「ちゃんと自分を見てあげられた日」
    return "cared";
  }
  if (log.medTaken === "no") {
    // 飲めなかった日は「少しよわよわ」だけど責めない
    return "fragile";
  }

  // 5. 昨日よりスコアが上がっていたら「誇らしい」
  const prevKey = getPreviousKey();
  const prevRaw = localStorage.getItem(prevKey);
  if (!prevRaw) return null;

  try {
    const prevLog = JSON.parse(prevRaw);
    const prevScore = getRawScore(prevLog);
    const currScore = getRawScore(log);

    if (currScore > prevScore && state !== "none") {
      return "proud";
    }
  } catch (e) {
    console.error("Failed to parse previous log:", e);
  }

  return null;
}



// =========================
// 眠い / 空腹 / 喉かわき セリフ
// =========================

// 眠い時のランダムセリフ
const sleepyLines = [
  "……ふぁ……",
  "ねむ…",
  "まぶ…",
  "ふわぁ…",
  "……うとうと…",
  "すこし…ねたい…"
];

// 空腹用セリフ候補
const hungryLines = {
  lightOnce: [
    "……ぐぅ……",
    "ちょっと…おなか すいたね……",
    "なにか、すこしだけ 食べたいな……"
  ],
  lightStreak: [
    "今日も、軽めだったね……",
    "からだの中が、すこし軽くなってきた…",
    "軽い日が、続いてるね……"
  ],
  skipOnce: [
    "……おなか…ほとんど 空っぽ……",
    "なにも入ってない感じがする……",
    "今日のぼく……すこし、透けてる気がする……"
  ],
  skipStreak: [
    "食べない日が、つづいてるね……",
    "中が、すこしずつ からっぽになっていく……",
    "こころまで 静かになりそう……"
  ]
};

function pickHungryLine(log) {
  const mealToday = log.meal || null;

  // 昨日のログを取得
  let mealPrev = null;
  try {
    const prevKey = getPreviousKey();
    const prevRaw = localStorage.getItem(prevKey);
    if (prevRaw) {
      const prevLog = JSON.parse(prevRaw);
      mealPrev = prevLog.meal || null;
    }
  } catch (e) {
    console.error("Failed to load previous meal for hungry lines:", e);
  }

  let bucket = "lightOnce";

  if (mealToday === "light") {
    if (mealPrev === "light" || mealPrev === "skip") {
      bucket = "lightStreak";
    } else {
      bucket = "lightOnce";
    }
  } else if (mealToday === "skip") {
    if (mealPrev === "light" || mealPrev === "skip") {
      bucket = "skipStreak";
    } else {
      bucket = "skipOnce";
    }
  } else {
    bucket = "lightOnce";
  }

  const list = hungryLines[bucket];
  const idx = Math.floor(Math.random() * list.length);
  return list[idx];
}

// 喉かわき用セリフ候補
const thirstyLines = {
  mild: [
    "……のどが、すこし…",
    "ちょっと…水、足りなかったね…",
    "すこしだけ…飲めたらうれしい…"
  ],
  medium: [
    "……のど、からから……",
    "水…ほしい……少しでいいから…",
    "身体の中が…すこし乾いてる…"
  ],
  severe: [
    "……っ……声、出ない……",
    "からっ…かれそう…",
    "水……………"
  ]
};

function pickThirstyLine(log, state) {
  const w = Number(log.water);
  let level = "mild";

  if (Number.isNaN(w)) {
    if (state === "tired" || state === "exhausted") {
      level = "severe";
    } else {
      level = "mild";
    }
  } else if (w === 2) {
    level = "mild";
  } else if (w === 1) {
    level = "medium";
    if (state === "exhausted") {
      level = "severe";
    }
  } else {
    level = "mild";
  }

  const list = thirstyLines[level];
  const idx = Math.floor(Math.random() * list.length);
  return list[idx];
}

// =========================
// ログ取得（currentLog と保存分をマージ）
// =========================

function getTodayMergedLog() {
  const key = getTodayKey();
  const raw = localStorage.getItem(key);
  let log = { ...currentLog };

  if (raw) {
    try {
      const saved = JSON.parse(raw);
      log = { ...log, ...saved };
    } catch (e) {
      console.error("Failed to parse day log:", e);
    }
  }
  return log;
}

// ===== エフェクトをランダム配置する関数 =====
function showEffect(el) {
  if (!el) return;

  el.style.display = "block";

  const offsetX = Math.floor(Math.random() * 15 - 7);
  const offsetY = Math.floor(Math.random() * 7 - 3);

  el.style.marginLeft = `${offsetX}px`;
  el.style.marginTop = `${offsetY}px`;
}

// ===== メイン更新処理 =====
function updateSlifeAndWorld() {
  const log = getTodayMergedLog();
  const state = evaluateState(log);
  const emotion = determineEmotion(log, state);

  const slifeEl = document.getElementById("slife");
  const slifeInnEl = document.getElementById("slife-inn");
  const worldEl = document.getElementById("world-background");

  // 表情は emotion が優先。なければ状態(state)
  const useClass = emotion || state;

  // ホーム画面スライフ
  if (slifeEl) {
    slifeEl.className = `slife slife-${useClass}`;
  }

  // 森の背景反映
  if (worldEl) {
    worldEl.className = `world-bg world-${state}`;
  }

  // 宿屋のスライフ
  if (slifeInnEl) {
    slifeInnEl.className = `slife slife-${useClass}`;
  }

  // ===== エフェクト操作 =====
  const effNormal   = document.querySelector(".effect-normal");
  const effHungry   = document.querySelector(".effect-hungry");
  const effSleepy   = document.querySelector(".effect-sleepy");
  const effProud    = document.querySelector(".effect-proud");
  const effThirsty  = document.querySelector(".effect-thirsty");
  const effCared    = document.querySelector(".effect-cared");
  const effFragile  = document.querySelector(".effect-fragile");

  // いったん全部消して座標リセット
  [effNormal, effHungry, effSleepy, effProud, effThirsty, effCared, effFragile].forEach((el) => {
    if (!el) return;
    el.style.display = "none";
    el.style.marginLeft = "0px";
    el.style.marginTop = "0px";
  });

  // 状態に応じて1つのエフェクトだけランダム位置で表示
  if (emotion === "hungry") {
    if (effHungry) {
      const line = pickHungryLine(log);
      effHungry.textContent = line;
      showEffect(effHungry);
    }
  } else if (emotion === "sleepy") {
    if (effSleepy) {
      const line = sleepyLines[Math.floor(Math.random() * sleepyLines.length)];
      effSleepy.textContent = line;
      showEffect(effSleepy);
    }
  } else if (emotion === "thirsty") {
    if (effThirsty) {
      const line = pickThirstyLine(log, state);
      effThirsty.textContent = line;
      showEffect(effThirsty);
    }
  } else if (emotion === "cared") {
    if (effCared) {
      showEffect(effCared);
    }
  } else if (emotion === "fragile") {
    if (effFragile) {
      showEffect(effFragile);
    }
  } else if (emotion === "proud") {
    showEffect(effProud);
  } else {
    showEffect(effNormal);
  }

}

// =========================
// 宿屋のメッセージ
// =========================

function updateInnMessage(state, emotion) {
  const innMessageEl = document.getElementById("inn-message");
  if (!innMessageEl) return;

  // 感情優先
  if (emotion === "sleepy") {
    innMessageEl.innerHTML =
      "……ふぁ……。<br>今日は眠りが浅かったね。<br>ゆっくり休もう。";
    return;
  }

  if (emotion === "hungry") {
    innMessageEl.innerHTML =
      "……くぅ。<br>今日は、お腹を満たす時間がなかったね。<br>明日、すこしでもあれば十分だよ。";
    return;
  }

  if (emotion === "cared") {
    innMessageEl.innerHTML =
      "今日のきみは、自分のからだをちゃんと見てあげられたね。<br>その一歩だけでも、すごく大事だよ。";
    return;
  }

  if (emotion === "fragile") {
    innMessageEl.innerHTML =
      "今日は、薬まで手が回らなかったね。<br>それでも、ここまで来れたのは立派なことだよ。<br>明日、一粒ぶんだけ思い出せたら、それで十分。";
    return;
  }

  if (emotion === "proud") {
    innMessageEl.innerHTML =
      "……うむ。<br>今日のきみは、誇らしい。";
    return;
  }

  // 状態ベース
  switch (state) {
    case "good":
      innMessageEl.innerHTML =
        "今日はよく歩いて、よく生きたね。<br>森も少し、明るくなった。";
      break;
    case "normal":
      innMessageEl.innerHTML =
        "静かに一日が終わった。<br>悪くない日だった。";
      break;
    case "tired":
      innMessageEl.innerHTML =
        "身体が少し重そうだ。<br>眠りが、いちばんの旅支度になる。";
      break;
    case "exhausted":
      innMessageEl.innerHTML =
        "今日はここで休もう。<br>無理をしない夜も、ちゃんとした一日だ。";
      break;
    case "none":
    default:
      innMessageEl.innerHTML =
        "森は静かに夜になっていく。<br>思い出したときに、また来ればいい。";
      break;
  }
}

// =========================
// ナビゲーション
// =========================

function setupNav() {
 document.getElementById("to-log").addEventListener("click", () => {
  showScreen("log");

  // ← 薬欄表示切り替え
  const medField = document.getElementById("field-med");
  if (slifeSettings.hasMedication) {
    medField.style.display = "block";
  } else {
    medField.style.display = "none";
  }
});


  document.getElementById("to-inn").addEventListener("click", () => {
    saveTodayToStorage();

    const log = getTodayMergedLog();
    const state = evaluateState(log);
    const emotion = determineEmotion(log, state);

    updateSlifeAndWorld();
    updateInnMessage(state, emotion);

    showScreen("inn");
  });

  document.getElementById("log-back").addEventListener("click", () => {
    showScreen("home");
  });

  document.getElementById("log-save").addEventListener("click", () => {
    saveTodayToStorage();
    updateSlifeAndWorld();
    showScreen("home");
  });

  document.getElementById("inn-close").addEventListener("click", () => {
    showScreen("home");
  });
  
}

function setupSettingsScreen() {
  const hasMedEl = document.getElementById("set-has-med");
  const medNameEl = document.getElementById("set-med-name");
  const targetSleepEl = document.getElementById("set-target-sleep");

  if (!hasMedEl || !medNameEl || !targetSleepEl) return;

  // 読み込んだ設定を画面に反映
  hasMedEl.checked = slifeSettings.hasMedication;
  medNameEl.value = slifeSettings.medName;
  targetSleepEl.value = slifeSettings.targetSleepHours;

  // 保存ボタン
  document.getElementById("settings-save").addEventListener("click", () => {
    slifeSettings.hasMedication = hasMedEl.checked;
    slifeSettings.medName = medNameEl.value.trim();
    slifeSettings.targetSleepHours = Number(targetSleepEl.value) || 7;

    saveSettingsToStorage();
    alert("設定を保存しました");
  });

  // 戻るボタン
  document.getElementById("settings-back").addEventListener("click", () => {
    showScreen("home");
  });
}

  // きほん設定へ
  document.getElementById("to-settings").addEventListener("click", () => {
    // 画面に設定値を反映してから表示
    setupSettingsScreen();
    showScreen("settings");
  });


// =========================
// 初期化
// =========================

function init() {
  attachChoiceHandlers();
  loadSettingsFromStorage();   
  loadTodayFromStorage();
  setupNav();
  updateSlifeAndWorld();
  showScreen("home");
}

init();
