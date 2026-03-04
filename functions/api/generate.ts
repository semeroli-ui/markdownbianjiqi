import { GoogleGenAI } from "@google/genai";

export const onRequestPost = async (context) => {
  const { request, env } = context;

  // 1. 检查 API Key 是否配置
  if (!env.GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY 未在 Cloudflare 后台配置。" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const rawKey = env.GEMINI_API_KEY || "";
  // 支持逗号分隔的多个密钥，并清理空格
  const apiKeys = rawKey.split(",").map(k => k.replace(/[\n\r\s\t]/g, "")).filter(k => k.length > 20);

  if (apiKeys.length === 0) {
    return new Response(
      JSON.stringify({ 
        error: "未检测到有效的 API Key。",
        tip: "请确保在 Cloudflare 后台配置了以 AIza 开头的密钥。"
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { topic, keyPoints, systemPrompt, userQuery } = await request.json();
    
    let response;
    let lastError: any = null;
    const modelsToTry = ["gemini-3-flash-preview", "gemini-flash-latest", "gemini-1.5-flash"];

    // 轮询所有密钥
    for (const apiKey of apiKeys) {
      const ai = new GoogleGenAI({ apiKey });
      
      // 针对当前密钥尝试不同模型
      for (const modelName of modelsToTry) {
        try {
          // 第一次尝试：带联网搜索
          response = await ai.models.generateContent({
            model: modelName, 
            contents: userQuery,
            config: {
              systemInstruction: systemPrompt,
              tools: [{ googleSearch: {} }]
            }
          });
        } catch (err: any) {
          console.warn(`Attempt with ${modelName} and tools failed, trying without tools...`);
          try {
            // 第二次尝试：不带联网搜索（防止某些模型不支持工具）
            response = await ai.models.generateContent({
              model: modelName, 
              contents: userQuery,
              config: { systemInstruction: systemPrompt }
            });
          } catch (retryErr: any) {
            lastError = retryErr;
            console.warn(`Key ${apiKey.substring(0, 6)}... with model ${modelName} failed:`, retryErr.message);
            
            if (retryErr.message?.includes("API key not valid")) break; 
            continue;
          }
        }
        if (response) break; 
      }
      if (response) break; 
    }

    if (!response) {
      const errorMsg = lastError?.message || "未知错误";
      throw new Error(`所有模型均无法响应。最后一次尝试的模型报错: ${errorMsg}`);
    }

    const contentText = response.text || '';
    
    // --- 封面图生成 ---
    let coverImage = null;
    try {
      const aiForImage = new GoogleGenAI({ apiKey: apiKeys[0] }); // 使用第一个密钥尝试生成图片
      const imageResponse = await aiForImage.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: {
          parts: [{ text: `为以下主题创作一张精美的文章封面图，风格要求：极简主义、艺术感、高品质杂志风格。主题：${topic}` }]
        },
        config: {
          imageConfig: {
            aspectRatio: "16:9"
          }
        }
      });

      for (const part of imageResponse.candidates[0].content.parts) {
        if (part.inlineData) {
          coverImage = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }
    } catch (imgErr) {
      console.warn("Cover image generation failed:", imgErr);
    }

    // 提取搜索溯源信息
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const groundingSources = groundingChunks?.map((chunk: any) => ({
      uri: chunk.web?.uri || '',
      title: chunk.web?.title || '引用来源'
    })).filter((s: any) => s.uri) || [];

    return new Response(
      JSON.stringify({ 
        text: contentText, 
        sources: groundingSources,
        coverImage: coverImage 
      }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate content" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
