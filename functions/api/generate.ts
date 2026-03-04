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
  const cleanApiKey = rawKey.replace(/[\n\r\s\t]/g, "");

  // 安全检查：如果密钥太短或格式不对，直接拦截并提示
  if (cleanApiKey.length < 20) {
    return new Response(
      JSON.stringify({ 
        error: `API Key 格式似乎不对。收到长度: ${cleanApiKey.length}，开头: ${cleanApiKey.substring(0, 4)}...`,
        tip: "请确保从 AI Studio 复制了完整的密钥（通常以 AIza 开头）。"
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  try {
    const { topic, keyPoints, systemPrompt, userQuery } = await request.json();
    const ai = new GoogleGenAI({ apiKey: cleanApiKey });
    
    // 尝试模型顺序：1.5-flash-latest -> 1.5-flash-8b -> 2.0-flash
    let response;
    const modelsToTry = ["gemini-1.5-flash-latest", "gemini-1.5-flash-8b", "gemini-2.0-flash"];
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        response = await ai.models.generateContent({
          model: modelName, 
          contents: userQuery,
          config: {
            systemInstruction: systemPrompt,
            tools: [{ googleSearch: {} }]
          }
        });
        if (response) break; // 成功获取响应，跳出循环
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${modelName} failed:`, err.message);
        // 如果是配额错误，继续尝试下一个模型
        if (err.message?.includes("429") || err.message?.includes("quota")) {
          continue;
        }
        // 如果是其他致命错误，直接抛出
        throw err;
      }
    }

    if (!response) {
      const errorMsg = lastError?.message || "未知错误";
      throw new Error(`所有模型均无法响应。最后一次尝试的模型报错: ${errorMsg}`);
    }

    const contentText = response.text || '';
    
    // 提取搜索溯源信息
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const groundingSources = groundingChunks?.map((chunk: any) => ({
      uri: chunk.web?.uri || '',
      title: chunk.web?.title || '引用来源'
    })).filter((s: any) => s.uri) || [];

    return new Response(
      JSON.stringify({ text: contentText, sources: groundingSources }),
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
