// --- 全域變數與設定 ---
const BACKEND_URL =
  "https://baseball-0623-backend-924124779607.europe-west1.run.app";
let allHistoryData = [],
  currentRecord = null,
  benchmarkProfiles = {};
let speedScatterChartInstance,
  densityChartInstance,
  timeSeriesChartInstance,
  correlationChartInstance,
  scoreHistogramInstance;
const keyMap = {
  Trunk_flexion_excursion: "trunk_flexion_excursion",
  Pelvis_obliquity_at_FC: "pelvis_obliquity_at_fc",
  Trunk_rotation_at_BR: "trunk_rotation_at_br",
  Shoulder_abduction_at_BR: "shoulder_abduction_at_br",
  Trunk_flexion_at_BR: "trunk_flexion_at_br",
  Trunk_lateral_flexion_at_HS: "trunk_lateral_flexion_at_hs",
};
const featureNames = {
  Trunk_flexion_excursion: "軀幹屈曲幅度",
  Pelvis_obliquity_at_FC: "骨盆傾斜度",
  Trunk_rotation_at_BR: "軀幹旋轉",
  Shoulder_abduction_at_BR: "肩部外展",
  Trunk_flexion_at_BR: "軀幹屈曲",
  Trunk_lateral_flexion_at_HS: "軀幹側向屈曲",
};
const chartMetrics = [
  { key: "predictions.max_speed_kmh", name: "最大球速" },
  { key: "predictions.pitch_score", name: "動作品質分數" },
  { key: "predictions.ball_score", name: "好球機率" },
  ...Object.keys(keyMap).map((k) => ({
    key: `user_features.${k}`,
    name: featureNames[k],
  })),
];

// --- 核心功能函數 ---
function updateKeyframeImage(imgId, pId, url) {
  const i = $(`#${imgId}`),
    p = $(`#${pId}`);
  if (url) {
    i.attr("src", url).removeClass("hidden");
    p.addClass("hidden");
  } else {
    i.addClass("hidden").attr("src", "");
    p.removeClass("hidden");
  }
}
function updateKinematicCards(userFeatures, modelProfile) {
  const grid = $("#kinematic-comparison-grid");
  grid.empty();
  if (!userFeatures || !modelProfile) return;
  $("#benchmark-name-display").text(
    modelProfile.model_name.replace("_FS_v1", "").replace(/_/g, " ")
  );
  for (const userKey in keyMap) {
    const modelKey = keyMap[userKey];
    const userValue = userFeatures[userKey];
    const modelData = modelProfile.profile_data[modelKey];
    if (userValue === undefined || !modelData) continue;
    const { min, max, p10, p50_median, p90, mean, std } = modelData;
    const bullet_range = max - min;
    const bullet_p10_percent =
      bullet_range > 0 ? ((p10 - min) / bullet_range) * 100 : 0;
    const bullet_range_width =
      bullet_range > 0 ? ((p90 - p10) / bullet_range) * 100 : 0;
    const bullet_median_percent =
      bullet_range > 0 ? ((p50_median - min) / bullet_range) * 100 : 50;
    const bullet_user_percent =
      bullet_range > 0
        ? Math.max(0, Math.min(100, ((userValue - min) / bullet_range) * 100))
        : 50;
    const density_chart_min = mean - 2.5 * std;
    const density_range = 5 * std;
    const density_user_percent =
      density_range > 0
        ? Math.max(
            0,
            Math.min(
              100,
              ((userValue - density_chart_min) / density_range) * 100
            )
          )
        : 50;
    const z_score = std > 0 ? (userValue - mean) / std : 0;
    let analysisText = `Z-score: ${z_score.toFixed(1)}`;
    let textColor = "";
    if (Math.abs(z_score) > 2) {
      textColor = "text-red-600 font-semibold";
    } else if (Math.abs(z_score) > 1) {
      textColor = "text-yellow-600 font-semibold";
    } else {
      textColor = "text-green-600";
    }
    const cardHTML = `<div class="bg-gray-50 rounded-lg p-4 space-y-4 border border-gray-200"><div><p class="text-sm font-medium text-gray-600">${
      featureNames[userKey]
    }</p><p class="text-3xl font-bold text-gray-900">${userValue.toFixed(
      1
    )}<span class="text-lg ml-1">度</span></p></div><div class="space-y-2"><h4 class="text-xs font-bold text-gray-500">常態區間對比 (P10-P90)</h4><div class="bullet-chart-container"><div class="bullet-chart-range" style="left: ${bullet_p10_percent}%; width: ${bullet_range_width}%;"></div><div class="bullet-chart-median" style="left: ${bullet_median_percent}%;"></div><div class="bullet-chart-marker" style="left: ${bullet_user_percent}%;"></div></div><div class="flex justify-between text-xs text-gray-500"><span>${p10.toFixed(
      1
    )}</span><span>${p90.toFixed(
      1
    )}</span></div></div><div class="space-y-2"><h4 class="text-xs font-bold text-gray-500">統計分佈對比 (Mean/STD)</h4><div class="density-plot-container"><div class="density-zone bg-red-200" style="width: 15.87%;"></div><div class="density-zone bg-yellow-200" style="width: 18.26%;"></div><div class="density-zone bg-green-200" style="width: 31.74%;"></div><div class="density-zone bg-yellow-200" style="width: 18.26%;"></div><div class="density-zone bg-red-200" style="width: 15.87%;"></div><div class="density-marker" style="left: ${density_user_percent}%;"><div class="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-bold text-red-500">${userValue.toFixed(
      1
    )}</div></div></div><div class="flex justify-between text-xs text-gray-500"><span>${(
      mean - std
    ).toFixed(1)} (-1σ)</span><span>${mean.toFixed(1)} (Mean)</span><span>${(
      mean + std
    ).toFixed(
      1
    )} (+1σ)</span></div></div><p class="text-sm text-center pt-1 ${textColor}">${analysisText}</p></div>`;
    grid.append(cardHTML);
  }
}
function displayHistoryList(filterName) {
  const div = $("#history-records");
  div.empty();
  const records = filterName
    ? allHistoryData.filter((r) => r.pitcher_name === filterName)
    : allHistoryData;
  if (records.length === 0) {
    div.append('<p class="text-gray-500 text-center">沒有符合的紀錄</p>');
    return;
  }
  records.forEach((r) =>
    div.append(
      `<div class="p-3 rounded-lg hover:bg-gray-100 border-b"><div class="flex justify-between items-center"><p class="font-bold text-sm text-gray-800">${
        r.pitcher_name
      }</p><p class="text-xs text-gray-500">${new Date(
        r.created_at
      ).toLocaleDateString()}</p></div><div class="mt-2 flex justify-end gap-2"><button class="view-btn text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded" data-id="${
        r.id
      }">查看</button><button class="replay-btn text-xs bg-green-100 text-green-800 px-2 py-1 rounded" data-id="${
        r.id
      }">回放</button></div></div>`
    )
  );
}
function replay_record(record) {
  if (!record) return;
  currentRecord = record;
  $("#video-player")
    .attr("src", record.video_path || "")
    .removeClass("hidden");
  $("#video-placeholder").addClass("hidden");
  $("#analyze-another-btn").removeClass("hidden");
  $("#max-speed-kmh").text(record.predictions.max_speed_kmh.toFixed(1));
  $("#pitch-score").text(`${record.predictions.pitch_score} / 4`);
  $("#ball-score-display").text(
    `${(record.predictions.ball_score * 100).toFixed(0)}%`
  );
  $("#ball-score-raw").text(
    `模型判定: ${record.predictions.ball_score > 0.5 ? "好球" : "壞球"}`
  );
  updateKeyframeImage(
    "release-frame-img",
    "release-frame-placeholder",
    record.keyframe_urls.release_frame_url
  );
  updateKeyframeImage(
    "landing-frame-img",
    "landing-frame-placeholder",
    record.keyframe_urls.landing_frame_url
  );
  updateKeyframeImage(
    "shoulder-frame-img",
    "shoulder-frame-placeholder",
    record.keyframe_urls.shoulder_frame_url
  );
  const benchmarkProfile =
    benchmarkProfiles[$("#benchmark-model-select").val()];
  updateKinematicCards(record.user_features, benchmarkProfile);
}

// --- 宏觀圖表繪製函數 ---
function drawSpeedBallScoreScatterChart(records, currentId) {
  if (speedScatterChartInstance) speedScatterChartInstance.destroy();
  const ctx = document
    .getElementById("speedBallScoreScatterChart")
    .getContext("2d");
  const otherData = records
    .filter((r) => r.id !== currentId)
    .map((r) => ({
      x: r.predictions.max_speed_kmh,
      y: r.predictions.ball_score,
      recordId: r.id,
    }));
  const currentPoint = records.find((r) => r.id === currentId);
  const currentData = currentPoint
    ? [
        {
          x: currentPoint.predictions.max_speed_kmh,
          y: currentPoint.predictions.ball_score,
          recordId: currentPoint.id,
        },
      ]
    : [];
  speedScatterChartInstance = new Chart(ctx, {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "歷史紀錄",
          data: otherData,
          backgroundColor: "rgba(54, 162, 235, 0.6)",
        },
        {
          label: "當前紀錄",
          data: currentData,
          backgroundColor: "rgba(239, 68, 68, 1)",
          pointRadius: 8,
          pointHoverRadius: 10,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: "最大球速 (km/h)" } },
        y: { title: { display: true, text: "好球機率" }, min: 0, max: 1 },
      },
      onHover: (e, el, c) => {
        c.canvas.style.cursor = el[0] ? "pointer" : "default";
      },
      onClick: (e, el, c) => {
        if (el.length === 0) return;
        const dataPoint = c.data.datasets[el[0].datasetIndex].data[el[0].index];
        const record = allHistoryData.find((r) => r.id === dataPoint.recordId);
        if (record) {
          replay_record(record);
          $("#historyChartsModal").hide();
        }
      },
    },
  });
}
function drawBiomechanicsHistoryDensityChart(
  records,
  featureKey,
  currentValue
) {
  if (densityChartInstance) densityChartInstance.destroy();
  const ctx = document
    .getElementById("biomechanicsHistoryDensityChart")
    .getContext("2d");
  const values = records
    .map((r) => r.user_features[featureKey])
    .filter((v) => v !== undefined);
  if (values.length < 2) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.font = '16px "Inter", sans-serif';
    ctx.textAlign = "center";
    ctx.fillStyle = "#6b7280";
    ctx.fillText(
      "數據不足 (少於2筆)，無法進行穩定性分析",
      ctx.canvas.width / 2,
      ctx.canvas.height / 2
    );
    return;
  }
  const min = Math.min(...values),
    max = Math.max(...values),
    binCount = 10,
    binWidth = max - min > 0 ? (max - min) / binCount : 1;
  const bins = Array(binCount).fill(0),
    labels = [];
  let currentBinIndex = -1;
  for (let i = 0; i < binCount; i++) {
    const lower = min + i * binWidth,
      upper = lower + binWidth;
    labels.push(lower.toFixed(1));
    values.forEach((v) => {
      if (v >= lower && v < upper) bins[i]++;
    });
    if (currentValue >= lower && currentValue < upper) currentBinIndex = i;
  }
  const backgroundColors = bins.map((_, i) =>
    i === currentBinIndex ? "rgba(239, 68, 68, 0.8)" : "rgba(75, 192, 192, 0.6)"
  );
  densityChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: featureNames[featureKey],
          data: bins,
          backgroundColor: backgroundColors,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "次數" } },
        x: { title: { display: true, text: "數值區間" } },
      },
      plugins: { legend: { display: false } },
    },
  });
}
function drawTimeSeriesChart(records, metric) {
  if (timeSeriesChartInstance) timeSeriesChartInstance.destroy();
  const ctx = document.getElementById("timeSeriesChart").getContext("2d");
  const data = records
    .map((r) => ({
      x: new Date(r.created_at),
      y: getNestedValue(r, metric.key),
    }))
    .sort((a, b) => a.x - b.x);
  timeSeriesChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [
        {
          label: metric.name,
          data: data,
          borderColor: "rgba(239, 68, 68, 1)",
          tension: 0.1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: "time",
          time: { unit: "day" },
          title: { display: true, text: "日期" },
        },
        y: { title: { display: true, text: "數值" } },
      },
    },
  });
}
function drawCorrelationExplorerChart(records, metricX, metricY) {
  if (correlationChartInstance) correlationChartInstance.destroy();
  const ctx = document
    .getElementById("correlationExplorerChart")
    .getContext("2d");
  const data = records.map((r) => ({
    x: getNestedValue(r, metricX.key),
    y: getNestedValue(r, metricY.key),
  }));
  correlationChartInstance = new Chart(ctx, {
    type: "scatter",
    data: {
      datasets: [
        {
          label: `${metricX.name} vs ${metricY.name}`,
          data: data,
          backgroundColor: "rgba(139, 92, 246, 0.6)",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: metricX.name } },
        y: { title: { display: true, text: metricY.name } },
      },
    },
  });
}
function drawScoreHistogram(records) {
  if (scoreHistogramInstance) scoreHistogramInstance.destroy();
  const ctx = document.getElementById("scoreHistogramChart").getContext("2d");
  const scores = records.map((r) => r.predictions.pitch_score);
  const scoreCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  scores.forEach((s) => scoreCounts[s]++);
  scoreHistogramInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["1分", "2分", "3分", "4分"],
      datasets: [
        {
          label: "分數次數",
          data: Object.values(scoreCounts),
          backgroundColor: "rgba(20, 184, 166, 0.6)",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: { anchor: "end", align: "top" },
      },
    },
  });
}
function getNestedValue(obj, path) {
  return path.split(".").reduce((acc, part) => acc && acc[part], obj);
}

// --- 初始化與事件監聽 ---
$(document).ready(function () {
  const ohtaniProfile = {
    model_name: "Ohtani, Shohei",
    profile_data: {
      trunk_flexion_excursion: {
        min: 41.57,
        max: 60.03,
        p10: 41.57,
        p50_median: 51.84,
        p90: 60.03,
        mean: 51.9,
        std: 5.0,
      },
      pelvis_obliquity_at_fc: {
        min: -2.36,
        max: 2.44,
        p10: -2.36,
        p50_median: 0.0,
        p90: 2.44,
        mean: 0.0,
        std: 1.2,
      },
      trunk_rotation_at_br: {
        min: 147.72,
        max: 155.39,
        p10: 147.72,
        p50_median: 151.18,
        p90: 155.39,
        mean: 151.0,
        std: 2.5,
      },
      shoulder_abduction_at_br: {
        min: 157.37,
        max: 169.89,
        p10: 157.37,
        p50_median: 162.64,
        p90: 169.89,
        mean: 163,
        std: 4.0,
      },
      trunk_flexion_at_br: {
        min: -66.14,
        max: -50.28,
        p10: -66.14,
        p50_median: -59.5,
        p90: -50.28,
        mean: -58.0,
        std: 5.0,
      },
      trunk_lateral_flexion_at_hs: {
        min: -6.01,
        max: 0.0,
        p10: -6.01,
        p50_median: -3.11,
        p90: 0.0,
        mean: -3.0,
        std: 1.5,
      },
    },
  };
  const userAvgProfile = {
    model_name: "My Average",
    profile_data: {
      trunk_flexion_excursion: {
        min: 40,
        max: 55,
        p10: 42,
        p50_median: 48,
        p90: 53,
        mean: 47,
        std: 3.0,
      },
      pelvis_obliquity_at_fc: {
        min: -2,
        max: 2,
        p10: -1.5,
        p50_median: 0.1,
        p90: 1.5,
        mean: 0.2,
        std: 0.8,
      },
      trunk_rotation_at_br: {
        min: 140,
        max: 160,
        p10: 142,
        p50_median: 150,
        p90: 158,
        mean: 150,
        std: 5.0,
      },
      shoulder_abduction_at_br: {
        min: 160,
        max: 180,
        p10: 162,
        p50_median: 170,
        p90: 178,
        mean: 170,
        std: 6.0,
      },
      trunk_flexion_at_br: {
        min: -60,
        max: -45,
        p10: -58,
        p50_median: -52,
        p90: -47,
        mean: -53,
        std: 4.0,
      },
      trunk_lateral_flexion_at_hs: {
        min: -5,
        max: 1,
        p10: -4,
        p50_median: -2,
        p90: 0,
        mean: -2.1,
        std: 1.0,
      },
    },
  };
  benchmarkProfiles = {
    "Ohtani, Shohei_FS_v1": ohtaniProfile,
    user_average: userAvgProfile,
  };
  const mockRecord1 = {
    id: 1,
    pitcher_name: "林桑",
    created_at: new Date(2025, 5, 1).toISOString(),
    video_path: "",
    user_features: {
      Trunk_flexion_excursion: 48.3,
      Pelvis_obliquity_at_FC: 0.0,
      Trunk_rotation_at_BR: 155.4,
      Shoulder_abduction_at_BR: 177.8,
      Trunk_flexion_at_BR: -54.4,
      Trunk_lateral_flexion_at_HS: -3.1,
    },
    predictions: {
      max_speed_kmh: 152.4,
      pitch_score: 3,
      ball_score: 0.85,
    },
    keyframe_urls: {
      release_frame_url: "https://placehold.co/400x225/e0e0e0/333?text=Release",
      landing_frame_url:
        "https://placehold.co/400x225/e0e0e0/333?text=Foot+Contact",
      shoulder_frame_url: "https://placehold.co/400x225/e0e0e0/333?text=Max+ER",
    },
  };
  const mockRecord2 = {
    id: 2,
    pitcher_name: "陳桑",
    created_at: new Date(2025, 5, 2).toISOString(),
    video_path: "",
    user_features: {
      Trunk_flexion_excursion: 55.1,
      Pelvis_obliquity_at_FC: -1.5,
      Trunk_rotation_at_BR: 149.0,
      Shoulder_abduction_at_BR: 165.2,
      Trunk_flexion_at_BR: -58.9,
      Trunk_lateral_flexion_at_HS: -2.5,
    },
    predictions: {
      max_speed_kmh: 148.1,
      pitch_score: 2,
      ball_score: 0.45,
    },
    keyframe_urls: {
      release_frame_url: "https://placehold.co/400x225/3b82f6/fff?text=Release",
      landing_frame_url:
        "https://placehold.co/400x225/10b981/fff?text=Foot+Contact",
      shoulder_frame_url: "https://placehold.co/400x225/f59e0b/fff?text=Max+ER",
    },
  };
  const mockRecord3 = {
    id: 3,
    pitcher_name: "林桑",
    created_at: new Date(2025, 5, 3).toISOString(),
    video_path: "",
    user_features: {
      Trunk_flexion_excursion: 46.8,
      Pelvis_obliquity_at_FC: 0.5,
      Trunk_rotation_at_BR: 152.1,
      Shoulder_abduction_at_BR: 175.5,
      Trunk_flexion_at_BR: -56.2,
      Trunk_lateral_flexion_at_HS: -2.8,
    },
    predictions: {
      max_speed_kmh: 151.8,
      pitch_score: 4,
      ball_score: 0.92,
    },
    keyframe_urls: {
      release_frame_url: "https://placehold.co/400x225/e0e0e0/333?text=Release",
      landing_frame_url:
        "https://placehold.co/400x225/e0e0e0/333?text=Foot+Contact",
      shoulder_frame_url: "https://placehold.co/400x225/e0e0e0/333?text=Max+ER",
    },
  };
  allHistoryData = [mockRecord3, mockRecord2, mockRecord1];

  const uniquePitchers = [
    ...new Set(allHistoryData.map((r) => r.pitcher_name)),
  ];
  uniquePitchers.forEach((name) =>
    $("#player-name-select").append(`<option value="${name}">${name}</option>`)
  );
  replay_record(allHistoryData[0]);
  displayHistoryList();

  $("#video-upload-area, #analyze-another-btn").on("click", () =>
    $("#video-upload").click()
  );
  $("#closeDetailModal, #closeHistoryChartsModal").on("click", function () {
    $(this).closest(".modal").hide();
  });
  $("#view-all-history-btn").on("click", () => {
    $("#player-name-select").val("");
    displayHistoryList();
  });
  $("#history-records").on("click", ".view-btn", function () {
    const record = allHistoryData.find((r) => r.id === $(this).data("id"));
    $("#detailModalContent").text(JSON.stringify(record, null, 2));
    $("#detailModal").css("display", "flex");
  });
  $("#history-records").on("click", ".replay-btn", function () {
    const record = allHistoryData.find((r) => r.id === $(this).data("id"));
    replay_record(record);
  });
  $("#player-name-select").on("change", function () {
    displayHistoryList($(this).val());
  });
  $("#benchmark-model-select").on("change", function () {
    if (currentRecord) {
      replay_record(currentRecord);
    }
  });
  $("#video-upload").on("change", async function () {
    alert("影片上傳與分析功能待後端 API 完成後串接。");
  });
  $("#modal-tabs").on("click", ".tab-button", function () {
    $(this).addClass("active").siblings().removeClass("active");
    $(".tab-content").hide();
    $(`#${$(this).data("tab")}-tab`).show();
  });

  function getSnapshotData() {
    if (!currentRecord) return [[], null];
    const snapshotTimestamp = new Date(currentRecord.created_at);
    const snapshotData = allHistoryData.filter(
      (r) => new Date(r.created_at) <= snapshotTimestamp
    );
    const selectedPitcher = $("#player-name-select").val();
    const recordsForPitcher = selectedPitcher
      ? snapshotData.filter((r) => r.pitcher_name === selectedPitcher)
      : snapshotData;
    return [recordsForPitcher, selectedPitcher];
  }

  $("#view-history-charts-btn").on("click", function () {
    const [records, pitcher] = getSnapshotData();
    if (records.length === 0) {
      alert((pitcher ? pitcher + " " : "") + "在該時間點沒有歷史數據可供分析");
      return;
    }

    $("#modal-tabs .tab-button:first").click();
    $(".chart-selector").empty();
    chartMetrics.forEach((m) =>
      $(".chart-selector").append(
        `<option value='${JSON.stringify(m)}'>${m.name}</option>`
      )
    );
    $("#corr-y-axis").val(JSON.stringify(chartMetrics[2])); // Default Y to ball_score

    drawSpeedBallScoreScatterChart(records, currentRecord.id);
    drawScoreHistogram(records);
    drawTimeSeriesChart(records, chartMetrics[0]);
    drawCorrelationExplorerChart(records, chartMetrics[0], chartMetrics[2]);
    drawBiomechanicsHistoryDensityChart(
      records,
      $("#history-density-selector").val(),
      currentRecord.user_features[$("#history-density-selector").val()]
    );

    $("#historyChartsModal").css("display", "flex");
  });
  $(
    "#time-series-metric, #corr-x-axis, #corr-y-axis, #history-density-selector"
  ).on("change", function () {
    const [records, pitcher] = getSnapshotData();
    if (records.length === 0) return;
    const metric_ts = JSON.parse($("#time-series-metric").val() || "null");
    const metric_corr_x = JSON.parse($("#corr-x-axis").val() || "null");
    const metric_corr_y = JSON.parse($("#corr-y-axis").val() || "null");
    const metric_density = $("#history-density-selector").val();
    if ($(this).is("#time-series-metric") && metric_ts)
      drawTimeSeriesChart(records, metric_ts);
    if (
      $(this).is("#corr-x-axis, #corr-y-axis") &&
      metric_corr_x &&
      metric_corr_y
    )
      drawCorrelationExplorerChart(records, metric_corr_x, metric_corr_y);
    if ($(this).is("#history-density-selector") && metric_density)
      drawBiomechanicsHistoryDensityChart(
        records,
        metric_density,
        currentRecord.user_features[metric_density]
      );
  });
});
