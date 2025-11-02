// netlify/functions/openai-function.js
// 📸 Step1：Vision File OCR 正式版（不明/0円問題を解消）
// モデル：gpt-4.1-mini（高精度 & 高画質向け）  
// 入力：画像ファイル（Base64 → Buffer）
// 出力：{ 商品: { 名前: "...", 価格: "税込xx,xxx円" } }

import fetch from "node-fetch";
import FormData from "form-data";

export async function handler(event) {
  try {
    console.log("📥 [Vision] Request received");

    const body = JSON.parse(event.body || "{}");
    const imageBase64 = body.imageBase64;

    if (!imageBase64) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No image provided" }),
      };
    }

    // Base64 → Buffer
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    // multipart form
    const form = new FormData();
    form.append("model", "gpt-4.1-mini");

    // Vision用 input フォーマット（←ここが重要）
    form.append(
      "input",
      JSON.stringify([
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "次の画像は日本の中古カメラ店（キタムラ）の値札です。商品名と税込価格のみ抽出してください。以下の形式で返してください：{ \"商品\": { \"名前\": \"...\", \"価格\": \"税込xx,xxx円\" } }"
            },
          ],
        },
      ])
    );

    // 画像を file として添付
    form.append("input_file", imageBuffer, {
      filename: "image.jpg",
      contentType: "image/jpeg",
    });

    console.log("📤 Sending to OpenAI /v1/responses ...");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: form,
    });

    const result = await response.json();
    console.log("📥 Raw Response:", JSON.stringify(result, null, 2));

    let output = result?.output_text ?? "";

    // 応答が空の場合の保険
    if (!output) {
      output = `{"商品":{"名前":"不明","価格":"税込0円"}}`;
    }

    // JSONとして解釈
    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch {
      parsed = { 商品: { 名前: "不明", 価格: "税込0円" } };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(parsed),
    };

  } catch (err) {
    console.error("❌ [Vision] Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
