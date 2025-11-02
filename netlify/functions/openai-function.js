// netlify/functions/openai-function.js
// ✅ 最終安定版：Responses API + dataURL 方式（form-data不要）
// - モデル: gpt-4.1-mini
// - 入力: JSON (image_url に dataURL を渡す正規形)
// - 出力: { 商品: { 名前: "...", 価格: "税込xx,xxx円" } }
// - 日英混在OCR最適化、価格は税込のみを返す
// - フォールバックで軽い正規表現抽出も実装

// Netlify(Node18+) だと fetch はグローバルに存在
async function getFetch() {
  if (typeof fetch !== "undefined") return fetch;
  // 念のためのフォールバック（古い環境用）
  const mod = await import("node-fetch");
  return mod.default;
}

exports.handler = async (event) => {
  try {
    const f = await getFetch();

    // 入力取得
    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch (_) {}
    const imageBase64 = body.imageBase64;
    if (!imageBase64 || !/^data:image\/(png|jpe?g);base64,/.test(imageBase64)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "imageBase64(dataURL) が必要です。" }),
      };
    }

    // Responses API へ JSON で投げる（image_url に dataURL を渡す）
    const payload = {
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "次の画像は日本の中古カメラ店（キタムラなど）の値札です。" +
                "日英混在に対応して、以下の厳密なJSONだけを返してください。" +
                'フォーマット: { "商品": { "名前": "...", "価格": "税込xx,xxx円" } } ' +
                "要件: 価格は必ず『税込』表記のみ。『税抜』価格は無視。" +
                "商品名は機種名・モデル名のみ（『保証なし』『現状渡し』などの状態語や付属品記述は除外）。" +
                "余計な説明・前後のテキストは出力しない。JSONのみ返す。"
            },
            {
              type: "input_image",
              image_url: imageBase64 // ← dataURL をそのまま渡すのが正解
            }
          ]
        }
      ]
    };

    const resp = await f("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await resp.json();
    // デバッグ用ログ（NetlifyのFunctionsログで確認可能）
    console.log("🔎 OpenAI raw:", JSON.stringify(result).slice(0, 4000));

    // Responses API は output_text を返す（無い場合の保険も）
    let text =
      result?.output_text ??
      result?.output?.map?.(o => o?.content?.map?.(c => c?.text || "").join("")).join("") ??
      "";

    // JSONパースを試みる
    let parsed;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // 失敗したら軽い正規表現でフォールバック抽出
        // 税込価格
        const priceMatch = text.match(/税込\s?([\d,]+)\s?円/);
        const price = priceMatch ? `税込${priceMatch[1]}円` : "税込0円";
        // 商品名（JSON風 or 行頭の括弧内を避けてほどよい長さの語句）
        let name = "不明";
        const nameJsonLike = text.match(/"名前"\s*:\s*"([^"]+)"/);
        if (nameJsonLike && nameJsonLike[1]) {
          name = nameJsonLike[1];
        } else {
          // シンプルに最初のそれっぽい英日混在語句を拾う（CONTAX, Nikon, Leica 等を優先）
          const nameCandidate = text.match(/([A-Za-z0-9\-+./\s]*?(CONTAX|Nikon|Canon|Leica|FUJIFILM|OLYMPUS|PENTAX|Mamiya|Minolta|Ricoh|Voigtländer)[^\n\r]{0,60})/i);
          if (nameCandidate && nameCandidate[1]) name = nameCandidate[1].trim();
        }
        parsed = { 商品: { 名前: name, 価格: price } };
      }
    }

    // 最終返却（最低限の形を保証）
    if (!parsed || !parsed.商品) {
      parsed = { 商品: { 名前: "不明", 価格: "税込0円" } };
    }
    if (!/^税込[\d,]+円$/.test(parsed.商品.価格 || "")) {
      // 価格が想定外なら保険で 0円に
      parsed.商品.価格 = "税込0円";
    }

    return {
      statusCode: 200,
      body: JSON.stringify(parsed)
    };

  } catch (err) {
    console.error("❌ Vision handler error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || String(err) })
    };
  }
};
