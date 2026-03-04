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
    const modelsToTry = ["gemini-1.5-flash-latest", "gemini-1.5-flash-8b", "gemini-2.0-flash"];

    // 轮询所有密钥
    for (const apiKey of apiKeys) {
      const ai = new GoogleGenAI({ apiKey });
      
      // 针对当前密钥尝试不同模型
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
          if (response) break; 
        } catch (err: any) {
          lastError = err;
          console.warn(`Key ${apiKey.substring(0, 6)}... with model ${modelName} failed:`, err.message);
          
          // 如果是密钥无效，直接跳到下一个密钥
          if (err.message?.includes("API key not valid")) {
            break; 
          }
          // 如果是配额问题，尝试下一个模型或下一个密钥
          if (err.message?.includes("429") || err.message?.includes("quota")) {
            continue;
          }
          throw err;
        }
      }
      if (response) break; // 如果当前密钥成功了，跳出密钥循环
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
