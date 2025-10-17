// netlify/functions/openai-function.js
// デバッグ付き安定版

export async function handler(event, context) {
  try {
    const { imageBase64 } = JSON.parse(event.body || "{}");
    if (!imageBase64) {
      console.error("❌ No imageBase64 in body");
      return { statusCode: 400, body: JSON.stringify({ error: "No image provided" }) };
    }

    const base64Data = imageBase64.split(",")[1];
    console.log("✅ Image received, length:", base64Data?.length);

    const apiUrl = "https://api.openai.com/v1/chat/completions";
    const bodyData = {
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `
あなたは中古カメラ店「キタムラ」のプライスカードを解析するOCRエンジンです。
必ず以下のJSON構造だけを返します。説明文や余計な文字は禁止です。

{
  "商品": {
    "名前": "商品名（例：CONTAX S2 (60years) Body）",
    "価格": "税込49,800円"
  }
}

- 価格は必ず「税込」＋半角数字＋カンマ＋「円」形式
- 桁を省略してはいけません（49 → 49,800円）
- 不明でも「税込0円」など数値を必ず入れること
`
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${base64Data}` }
            }
          ]
        }
      ]
    };

    console.log("📤 Sending request to OpenAI...");
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(bodyData)
    });

    const text = await response.text();
    console.log("📥 Raw OpenAI response:", text);

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error("❌ Failed to parse OpenAI response:", err);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "OpenAI returned invalid JSON", raw: text })
      };
    }

    const content = data.choices?.[0]?.message?.content || "";
    console.log("🧩 AI content:", content);

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      const nameMatch = content.match(/名前["：:]*["\s]*([^",}]+)/);
      const priceMatch = content.match(/価格["：:]*["\s]*([^",}]+)/);
      parsed = {
        商品: {
          名前: nameMatch?.[1]?.trim() || "不明",
          価格: priceMatch?.[1]?.trim() || "税込0円"
        }
      };
    }

    console.log("✅ Parsed result:", parsed);

    return {
      statusCode: 200,
      body: JSON.stringify(parsed)
    };

  } catch (error) {
    console.error("💥 Unhandled error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}
