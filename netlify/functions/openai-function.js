// netlify/functions/openai-function.js
// 安全なサーバーサイド関数（Netlify Functions互換）

export async function handler(event, context) {
  try {
    const { imageBase64 } = JSON.parse(event.body);
    if (!imageBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: "No image provided" }) };
    }

    // Base64データの "data:image/png;base64,..." 部分を処理
    const base64Data = imageBase64.split(",")[1];

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
                text: "次の画像は中古カメラ店（キタムラ）のプライスカードです。税込価格のみ（例：税込49,800円）と商品名を抽出し、JSON形式で出力してください。"
              },
              {
                type: "image_url",
                image_url: {
                  // OpenAI Vision APIはURLまたはbase64エンコードされた画像を data URL 形式で受け取る
                  url: `data:image/jpeg;base64,${base64Data}`
                }
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

    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}
