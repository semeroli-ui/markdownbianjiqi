import { GoogleGenAI } from "@google/genai";

export const onRequestPost = async (context) => {
  const { request, env } = context;

  // 1. 检查 API Key 是否配置
  if (!env.GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY is not configured in Cloudflare Dashboard." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { topic, keyPoints, systemPrompt, userQuery } = await request.json();

    const ai = new GoogleGenAI(env.GEMINI_API_KEY);
    // 注意：在 Cloudflare 环境中，模型调用方式略有不同，建议使用 gemini-1.5-flash 或类似稳定版本
    // 这里保持与你之前一致，但如果报错，请尝试更换模型名称
    const model = ai.getGenerativeModel({ 
      model: "gemini-1.5-flash", // Cloudflare 环境下建议使用更稳定的名称
      systemInstruction: systemPrompt 
    });

    const result = await model.generateContent(userQuery);
    const response = await result.response;
    const contentText = response.text();

    // 处理来源（Grounding）在 Cloudflare 环境下可能需要根据 SDK 版本调整
    // 简便起见，先返回核心文本
    return new Response(
      JSON.stringify({ text: contentText, sources: [] }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate content" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
