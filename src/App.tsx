/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, 
  Download, 
  Layout, 
  Eye, 
  Edit3, 
  Loader2, 
  AlertCircle,
  Globe,
  Copy,
  Check,
  BookOpen,
  Feather,
  Quote,
  History,
  Trash2,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';
import mermaid from 'mermaid';

// --- Mermaid Component ---
const Mermaid = ({ chart }: { chart: string }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && chart) {
      mermaid.initialize({
        startOnLoad: true,
        theme: 'base',
        themeVariables: {
          primaryColor: '#10B981',
          primaryTextColor: '#1A1A1A',
          primaryBorderColor: '#10B981',
          lineColor: '#10B981',
          secondaryColor: '#FDFCFB',
          tertiaryColor: '#FDFCFB',
        },
        securityLevel: 'loose',
      });
      mermaid.contentLoaded();
      
      // Clear previous content and render new chart
      const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
      mermaid.render(id, chart).then(({ svg }) => {
        if (ref.current) {
          ref.current.innerHTML = svg;
        }
      }).catch(err => {
        console.error("Mermaid render error:", err);
      });
    }
  }, [chart]);

  return <div key={chart} ref={ref} className="mermaid" />;
};

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface GroundingSource {
  uri: string;
  title: string;
}

interface Article {
  id: string;
  topic: string;
  content: string;
  sources: GroundingSource[];
  coverImage?: string | null;
  date: string;
}

// --- App Component ---
export default function App() {
  const [topic, setTopic] = useState('');
  const [keyPoints, setKeyPoints] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('split');
  const [history, setHistory] = useState<Article[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Load history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('insight_scribe_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem('insight_scribe_history', JSON.stringify(history));
  }, [history]);

  const showToast = (text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 3000);
  };

  const generateContent = async () => {
    if (!topic.trim()) {
      setError("请输入调研主题");
      return;
    }

    setIsLoading(true);
    setError(null);
    setMarkdown('');
    setSources([]);

    const now = format(new Date(), 'yyyy-MM-dd');
    
    const userQuery = `请针对以下主题进行深度调研，生成一份具有深度且文辞精美的 Hugo 博客文章。
主题：${topic}
深度要求：${keyPoints || '从行业背景、核心逻辑、社会影响及未来演进角度深入分析'}

**文档结构与美感要求：**
1. **YAML Front-matter**: 包含 title, date (${now}), draft: false, tags, categories。
2. **文章摘要 (Article Summary)**: 必须以 "## 文章摘要" 为标题，撰写一段约150-200字、富有文学色彩的综述。
3. **Hugo 标记**: 摘要后插入 \`<!--more-->\`。
4. **正文叙事**:
   - 标题命名要专业且具有美感（如使用“溯源”、“演进”、“博弈”、“展望”等词汇）。
   - 使用 H2 为大节，H3 为细分点。
   - 必须包含一个数据对比表格。
   - 使用引用(Blockquote)来提炼文章的核心金句。
5. **SEO 与 语气**: 语气专业、儒雅，适合发布在高品质科技或人文博客。
6. **逻辑图表**: 必须包含一个 Mermaid 流程图或时序图，用于展示核心逻辑或流程，代码块标记为 \`\`\`mermaid\`\`\`。`;

    const systemPrompt = "你是一位兼具技术深度与文学修养的专栏作家。你擅长将复杂的调研数据转化为逻辑严密、文辞优美的 Markdown 文章，完美支持 Hugo 博客规范。";

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          keyPoints,
          systemPrompt,
          userQuery
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate content");
      }

      const result = await response.json();
      const contentText = result.text;
      const groundingSources = result.sources || [];
      const generatedCover = result.coverImage;

      if (contentText) {
        setMarkdown(contentText);
        setSources(groundingSources);
        setCoverImage(generatedCover);
        
        // Add to history
        const newArticle: Article = {
          id: Date.now().toString(),
          topic,
          content: contentText,
          sources: groundingSources,
          coverImage: generatedCover,
          date: now
        };
        setHistory(prev => [newArticle, ...prev.slice(0, 9)]);
        showToast("创作完成，文稿已成。");
      } else {
        throw new Error("模型未能生成有效文稿，请重试。");
      }
    } catch (err: any) {
      setError(err.message || "发生未知错误");
    } finally {
      setIsLoading(false);
    }
  };

  const downloadMarkdown = () => {
    if (!markdown) return;
    
    let finalContent = markdown;
    if (coverImage) {
      // If it's a Hugo post, try to insert into front-matter or just at the top
      if (markdown.startsWith('---')) {
        const parts = markdown.split('---');
        if (parts.length >= 3) {
          // Insert into front-matter
          parts[1] = parts[1] + `featured_image: "${coverImage}"\n`;
          finalContent = parts.join('---');
        }
      }
      // Also add a visible image tag at the top for standard previewers
      finalContent = `![Cover](${coverImage})\n\n` + finalContent;
    }

    const blob = new Blob([finalContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeTitle = topic.replace(/[\\/:"*?<>|]/g, '_') || 'article';
    a.href = url;
    a.download = `${safeTitle}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("文稿已导出（含封面图）");
  };

  const copyToClipboard = () => {
    let finalContent = markdown;
    if (coverImage) {
      finalContent = `![Cover](${coverImage})\n\n` + finalContent;
    }
    navigator.clipboard.writeText(finalContent);
    showToast("已复制源码（含封面图）");
  };

  const loadFromHistory = (article: Article) => {
    setTopic(article.topic);
    setMarkdown(article.content);
    setSources(article.sources);
    setCoverImage(article.coverImage || null);
    setShowHistory(false);
  };

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  return (
    <div className="flex h-screen bg-paper text-ink overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-80 border-r border-black/5 bg-white/50 backdrop-blur-sm flex flex-col">
        <div className="p-8 border-b border-black/5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-brand rounded-full flex items-center justify-center shadow-lg shadow-brand/20">
              <Feather className="text-white w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-serif font-black tracking-widest uppercase text-ink">InsightScribe</h1>
              <p className="text-[10px] text-brand font-bold tracking-widest uppercase">博见文库</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <section>
            <label className="block text-[10px] font-black text-black/40 uppercase tracking-[0.2em] mb-4">创作设定</label>
            <div className="space-y-6">
              <div className="group">
                <label className="block text-xs font-bold text-black/60 mb-2 group-focus-within:text-brand transition-colors">调研主题</label>
                <input 
                  type="text" 
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="如：AI时代的文学重构"
                  className="w-full bg-transparent border-b border-black/10 py-2 text-lg outline-none focus:border-brand transition-all placeholder:text-black/10 font-serif"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-black/60 mb-2">创作导向</label>
                <textarea 
                  value={keyPoints}
                  onChange={(e) => setKeyPoints(e.target.value)}
                  placeholder="在此输入您的特定视角或补充细节..."
                  rows={4}
                  className="w-full bg-black/5 border border-transparent p-4 rounded-xl text-sm outline-none focus:bg-white focus:border-black/10 transition-all resize-none font-sans"
                />
              </div>
              <button 
                onClick={generateContent} 
                disabled={isLoading || !topic}
                className="w-full flex items-center justify-center gap-3 py-4 bg-brand text-white rounded-xl hover:bg-brand-dark disabled:opacity-20 transition-all font-bold text-sm shadow-xl shadow-brand/20 active:scale-[0.98]"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {markdown ? '重研此篇' : '提笔创作'}
              </button>
            </div>
          </section>

          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs flex gap-3 items-start animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p className="leading-relaxed font-medium">{error}</p>
            </div>
          )}

          {sources.length > 0 && (
            <section className="pt-6 border-t border-black/5">
              <h2 className="text-[10px] font-black text-black/30 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Globe className="w-3 h-3" /> 溯源参考 ({sources.length})
              </h2>
              <div className="space-y-3">
                {sources.map((s, i) => (
                  <a key={i} href={s.uri} target="_blank" rel="noopener noreferrer" className="block group">
                    <div className="text-[11px] font-medium text-black/60 group-hover:text-ink truncate transition-colors">{s.title}</div>
                    <div className="text-[9px] text-black/30 font-mono truncate">{new URL(s.uri).hostname}</div>
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="p-4 border-t border-black/5">
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/5 rounded-lg transition-colors text-xs font-bold text-black/60"
          >
            <div className="flex items-center gap-2">
              <History className="w-4 h-4" />
              历史创作
            </div>
            <span className="bg-black/5 px-2 py-0.5 rounded-full">{history.length}</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col relative">
        {/* Workspace Header */}
        <header className="h-16 border-b border-black/5 bg-white/50 backdrop-blur-md flex items-center justify-between px-8">
          <div className="flex items-center gap-1 bg-black/5 p-1 rounded-lg">
            {[
              { id: 'edit', label: '源码', icon: Edit3 },
              { id: 'preview', label: '预览', icon: Eye },
              { id: 'split', label: '对照', icon: Layout }
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setViewMode(tab.id as any)}
                className={cn(
                  "flex items-center gap-2 px-4 py-1.5 rounded-md text-[11px] font-bold transition-all",
                  viewMode === tab.id ? "bg-white shadow-sm text-ink" : "text-black/40 hover:text-black/60"
                )}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {markdown && (
              <>
                <button onClick={copyToClipboard} className="p-2 hover:bg-black/5 rounded-lg transition-colors text-black/40 hover:text-ink" title="复制源码">
                  <Copy className="w-4 h-4" />
                </button>
                <button onClick={downloadMarkdown} className="flex items-center gap-2 px-4 py-2 bg-black/5 hover:bg-black/10 text-ink rounded-lg transition-all font-bold text-xs">
                  <Download className="w-3.5 h-3.5" /> 导出 MD
                </button>
              </>
            )}
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden p-8 gap-8">
          <AnimatePresence mode="wait">
            {(viewMode === 'edit' || viewMode === 'split') && (
              <motion.div 
                key="edit"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 bg-white rounded-2xl shadow-sm border border-black/5 overflow-hidden flex flex-col"
              >
                <div className="px-6 py-2 border-b border-black/5 bg-black/[0.02] flex justify-between items-center">
                  <span className="text-[9px] font-black text-black/20 tracking-widest uppercase">Markdown Editor</span>
                  <span className="text-[9px] font-mono text-black/20">{markdown.length} Characters</span>
                </div>
                <textarea 
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                  className="flex-1 p-8 font-mono text-sm leading-relaxed outline-none bg-transparent resize-none text-black/70"
                  placeholder="在此挥洒文墨..."
                />
              </motion.div>
            )}

            {(viewMode === 'preview' || viewMode === 'split') && (
              <motion.div 
                key="preview"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex-1 bg-white rounded-2xl shadow-sm border border-black/5 overflow-y-auto p-12"
              >
                <div className="max-w-2xl mx-auto markdown-body">
                  {coverImage && (
                    <motion.img 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      src={coverImage} 
                      alt="Cover" 
                      className="w-full aspect-video object-cover rounded-2xl shadow-2xl mb-12 border-4 border-white"
                    />
                  )}
                  <ReactMarkdown
                    components={{
                      code({ node, inline, className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || '');
                        if (!inline && match && match[1] === 'mermaid') {
                          return <Mermaid chart={String(children).replace(/\n$/, '')} />;
                        }
                        return (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      }
                    }}
                  >
                    {markdown || "_等待灵感降临..._"}
                  </ReactMarkdown>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* History Overlay */}
        <AnimatePresence>
          {showHistory && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 bg-paper/95 backdrop-blur-xl p-12 flex flex-col"
            >
              <div className="flex justify-between items-center mb-12">
                <h2 className="text-3xl font-serif font-black tracking-tight">历史创作</h2>
                <button onClick={() => setShowHistory(false)} className="p-3 hover:bg-black/5 rounded-full transition-colors">
                  <Trash2 className="w-6 h-6 text-black/20" />
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-12">
                {history.length === 0 ? (
                  <div className="col-span-full h-64 flex flex-col items-center justify-center text-black/20 border-2 border-dashed border-black/5 rounded-3xl">
                    <Feather className="w-12 h-12 mb-4" />
                    <p className="font-serif italic">尚无历史记录</p>
                  </div>
                ) : (
                  history.map(item => (
                    <div 
                      key={item.id}
                      onClick={() => loadFromHistory(item)}
                      className="group bg-white p-6 rounded-2xl border border-black/5 shadow-sm hover:shadow-xl hover:border-black/10 transition-all cursor-pointer relative"
                    >
                      <button 
                        onClick={(e) => deleteHistoryItem(item.id, e)}
                        className="absolute top-4 right-4 p-2 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <div className="text-[10px] font-black text-black/20 mb-2 uppercase tracking-widest">{item.date}</div>
                      <h3 className="text-lg font-serif font-bold mb-4 group-hover:text-blue-600 transition-colors line-clamp-2">{item.topic}</h3>
                      <div className="flex items-center justify-between mt-auto pt-4 border-t border-black/5">
                        <span className="text-[10px] font-bold text-black/40">{item.content.length} 字</span>
                        <ChevronRight className="w-4 h-4 text-black/20 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-[60] bg-white/60 backdrop-blur-md flex flex-col items-center justify-center">
            <div className="relative mb-8">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-24 h-24 rounded-full border-2 border-black/5 border-t-ink"
              />
              <Feather className="w-8 h-8 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-ink animate-pulse" />
            </div>
            <h2 className="text-xl font-serif font-black tracking-widest uppercase">正在博采众长</h2>
            <p className="mt-2 text-black/40 text-xs font-medium tracking-widest italic">穿梭于数海云端，为您裁切锦绣文章...</p>
          </div>
        )}

        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[100]"
            >
              <div className="bg-brand text-white px-6 py-3 rounded-full shadow-2xl shadow-brand/30 flex items-center gap-3 text-xs font-bold tracking-wider">
                <Check className="w-4 h-4 text-white" />
                {toast}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
