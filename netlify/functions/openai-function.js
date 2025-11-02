// netlify/functions/openai-function.js
// 📸 OpenAI Vision 高精度 OCR（画像file方式）
// 仕様：1枚の画像ファイルをmultipart/form-dataで送信 → JSONで商品名・価格を返す

import fetch from "node-fetch";
import FormData from "form-data";

export async function handler(event) {
  try {
    console.log("📥 Request received to Vision API");

    // アップロードファイルを読み込む
    const body = JSON.parse(event.body);
    const imageBase64 = body.imageBase64;
    if (!imageBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: "No image provided" }) };
    }

    // base64 → バイナリ変換
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    // multipart/form-data を構築
    const form = new FormData();
    form.append(
      "file",
      imageBuffer,
      { filename: "image.jpg", contentType: "image/jpeg" }
    );

    // Vision API呼び出し
    form.append("model", "gpt-4o-mini");
    form.append(
      "messages",
      JSON.stringify([
        {
          role: "user",
          content: [
            { type: "text", text: "次の画像は中古カメラ店（キタムラ）のプライスカードです。税込価格（例：税込49,800円）と商品名を正確に抽出し、以下のJSON形式で出力してください：{ \"商品\": { \"名前\": \"...\", \"価格\": \"税込xx,xxx円\" } }" }
          ]
        }
      ])
    );

    console.log("📤 Sending request to OpenAI...");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });

    const result = await response.json();
    console.log("📥 Raw response:", JSON.stringify(result, null, 2));

    // 結果抽出
    let outputText = result?.choices?.[0]?.message?.content?.trim() || "";
    if (!outputText) outputText = '{"商品":{"名前":"不明","価格":"税込0円"}}';

    // JSONパースを安全に
    let parsed;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      parsed = { 商品: { 名前: "不明", 価格: "税込0円" } };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(parsed),
    };
  } catch (error) {
    console.error("❌ Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
