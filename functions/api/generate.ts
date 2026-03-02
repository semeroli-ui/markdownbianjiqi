import { GoogleGenAI } from "@google/genai";

export const onRequestPost = async (context) => {
  const { request, env } = context;

  // 1. 检查 API Key 是否配置
  if (!env.GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY is not configured in Cloudflare Dashboard. Please add it to Settings -> Functions -> Environment variables." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { topic, keyPoints, systemPrompt, userQuery } = await request.json();

    // 正确的初始化方式：必须使用 { apiKey: ... }
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    
    // 切换到更稳定的 gemini-1.5-flash 模型，它的免费配额通常更高
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash", 
      contents: userQuery,
      config: {
        systemInstruction: systemPrompt,
        tools: [{ googleSearch: {} }]
      }
    });

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
