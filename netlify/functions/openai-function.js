// netlify/functions/openai-function.js
// 安全なサーバーサイド関数（Netlify Functions互換）

export async function handler(event, context) {
  try {
    const { imageBase64 } = JSON.parse(event.body);
    if (!imageBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: "No image provided" }) };
    }

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
                text: `
あなたは中古カメラ店「キタムラ」のプライスカードOCR解析AIです。
以下の画像から「商品名」と「税込価格」を正確に読み取り、次のようなJSON形式のみで出力してください。

{
  "商品": {
    "名前": "（商品名）",
    "価格": "税込（価格）円"
  }
}

注意：
- 余計な文字や説明は出力しない
- 商品名と税込価格の2つだけ返す
- 価格は半角数字と「円」のみ（カンマ可）
                `
              },
              {
                type: "image_url",
                image_url: {
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
