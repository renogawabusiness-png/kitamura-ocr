// netlify/functions/openai-function.js
// OCR精度強化＋数値補完対応版

export async function handler(event, context) {
  try {
    const { imageBase64 } = JSON.parse(event.body);
    if (!imageBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: "No image provided" }) };
    }

    const base64Data = imageBase64.split(",")[1];

    // --- Step 1: OpenAI VisionでOCRを実行 ---
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `
以下の画像は中古カメラ店「キタムラ」のプライスカードです。
- 商品名と税込価格を読み取ってJSONで出力してください。
- 出力例：
{
  "商品": { "名前": "CONTAX S2 (60years) Body", "価格": "税込49,800円" }
}
- 「税込」+ 半角数字 + カンマ + 「円」形式を必ず維持。
- 数字が途中で途切れている場合は推定して補完する（例：49 → 49,800）。
- JSON以外の出力は禁止。
`
              },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${base64Data}` }
              }
            ]
          }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || "OpenAI API error");
    }

    // --- Step 2: JSON抽出 ---
    const content = data.choices?.[0]?.message?.content || "";
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }

    let name = parsed.商品?.名前 || "不明";
    let price = parsed.商品?.価格 || "";

    // --- Step 3: 価格補完（正規表現補正）---
    if (price) {
      // 価格から数値を抽出
      const numMatch = price.match(/(\d{1,3}(?:,\d{3})*|\d+)/);
      if (numMatch) {
        let num = numMatch[1].replace(/,/g, "");
        // 49 → 49800 のように補完
        if (num.length <= 2) {
          num = num.padEnd(5, "0");
        }
        const formatted = new Intl.NumberFormat("ja-JP").format(Number(num));
        price = `税込${formatted}円`;
      }
    } else {
      price = "税込不明円";
    }

    const result = { 商品: { 名前: name, 価格: price } };

    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}
