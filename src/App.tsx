import React, { useState, useCallback } from 'react';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Download, 
  Search,
  Filter,
  ChevronRight,
  ChevronDown,
  FileUp,
  Trash2,
  Key,
  Sparkles,
  History,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { parseFile } from './utils/fileParser';
import { 
  generateTestCases, 
  generateXMindContent, 
  analyzeRequirements,
  generateIncrementalTestCases,
  TEST_STYLES,
  type TestCase, 
  type ImageContent,
  type TestStyle
} from './services/gemini';
import { historyService, type HistoryRecord } from './services/history';
import { exportToExcel, exportToXMind } from './utils/exportUtils';
import Markdown from 'react-markdown';
import { Shield, Zap, Target, Activity } from 'lucide-react';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [parsedText, setParsedText] = useState<string>('');
  const [designFiles, setDesignFiles] = useState<File[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [xmindContent, setXmindContent] = useState<string>('');
  const [analysisReport, setAnalysisReport] = useState<string>('');
  const [revisedDocument, setRevisedDocument] = useState<string>('');
  const [analysisTab, setAnalysisTab] = useState<'report' | 'revised'>('report');
  const [generationMode, setGenerationMode] = useState<'matrix' | 'xmind' | 'analysis'>('matrix');
  const [sourceType, setSourceType] = useState<'original' | 'revised' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('全部');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [customApiKey, setCustomApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-3-flash-preview');
  const [testStyle, setTestStyle] = useState<TestStyle>('standard');
  const [showApiKey, setShowApiKey] = useState(false);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [hasPlatformKey, setHasPlatformKey] = useState(false);
  const [isIncremental, setIsIncremental] = useState(false);
  const [oldFile, setOldFile] = useState<File | null>(null);
  const [oldParsedText, setOldParsedText] = useState<string>('');

  React.useEffect(() => {
    setHistory(historyService.getAll());
    const checkPlatformKey = async () => {
      let hasKey = false;
      if (window.aistudio?.hasSelectedApiKey) {
        hasKey = await window.aistudio.hasSelectedApiKey();
      }
      if (!hasKey && process.env.API_KEY) {
        hasKey = true;
      }
      setHasPlatformKey(hasKey);
    };
    checkPlatformKey();
  }, []);

  const handleOpenPlatformKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      // After opening, we assume they might have selected one
      const hasKey = await window.aistudio.hasSelectedApiKey();
      setHasPlatformKey(hasKey);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFile(droppedFile);
  }, []);

  const onDesignDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleDesignFiles(droppedFiles);
  }, [designFiles]);

  const handleFile = (selectedFile: File, isOld: boolean = false) => {
    const validTypes = ['.pdf', '.docx', '.md', '.txt'];
    const extension = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase();
    
    if (!validTypes.includes(extension)) {
      setError('请上传 PDF、Word 或 Markdown 文件。');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('需求文档大小不能超过 10MB。');
      return;
    }

    if (isOld) {
      setOldFile(selectedFile);
      setOldParsedText('');
    } else {
      setFile(selectedFile);
      setSourceType('original');
      setParsedText('');
      setTestCases([]);
      setXmindContent('');
      setAnalysisReport('');
      setRevisedDocument('');
    }
    setError(null);
  };

  const handleDesignFiles = (selectedFiles: File[]) => {
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    const newFiles = [...designFiles];
    
    for (const file of selectedFiles) {
      if (newFiles.length >= 4) {
        setError('最多只能上传 4 张设计图。');
        break;
      }
      if (!validTypes.includes(file.type)) {
        setError(`文件 ${file.name} 格式不支持，请上传 PNG 或 JPG。`);
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError(`文件 ${file.name} 超过 5MB 限制。`);
        continue;
      }
      newFiles.push(file);
    }
    
    setDesignFiles(newFiles);
    setError(null);
  };

  const removeDesignFile = (index: number) => {
    setDesignFiles(prev => prev.filter((_, i) => i !== index));
  };

  const loadHistoryRecord = (record: HistoryRecord) => {
    setGenerationMode(record.mode);
    setTestStyle(record.style);
    if (record.testCases) setTestCases(record.testCases);
    if (record.xmindContent) setXmindContent(record.xmindContent);
    if (record.analysisReport) setAnalysisReport(record.analysisReport);
    if (record.revisedDocument) setRevisedDocument(record.revisedDocument);
    setError(null);
    // Scroll to results
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteHistoryRecord = (id: string) => {
    historyService.delete(id);
    setHistory(historyService.getAll());
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const processFile = async (targetMode?: 'matrix' | 'xmind' | 'analysis', forceSource?: string) => {
    const mode = targetMode || generationMode;
    let textToUse = forceSource;
    
    if (!textToUse) {
      textToUse = sourceType === 'revised' ? revisedDocument : parsedText;
    }

    if (!file && !forceSource && !textToUse) return;

    try {
      let text = textToUse;
      if (!text && file) {
        setIsParsing(true);
        setError(null);
        text = await parseFile(file);
        setParsedText(text);
        setIsParsing(false);
      }
      
      if (!text) return;

      let oldText = oldParsedText;
      if (isIncremental && !oldText && oldFile) {
        setIsParsing(true);
        oldText = await parseFile(oldFile);
        setOldParsedText(oldText);
        setIsParsing(false);
      }
      
      setIsGenerating(true);
      setGenerationProgress('正在准备生成...');

      let images: ImageContent[] = [];
      if (designFiles.length > 0) {
        images = await Promise.all(designFiles.map(async f => ({
          data: await fileToBase64(f),
          mimeType: f.type
        })));
      }

      if (mode === 'matrix') {
        let cases: TestCase[] = [];
        if (isIncremental && oldText) {
          const result = await generateIncrementalTestCases(
            oldText, 
            text, 
            testCases, 
            images, 
            customApiKey, 
            selectedModel, 
            (msg) => setGenerationProgress(msg), 
            testStyle
          );
          
          // Merge results
          const updatedMap = new Map(result.updatedCases.map(tc => [tc.id, tc]));
          const deletedSet = new Set(result.deletedIds);
          
          const mergedCases = testCases
            .filter(tc => !deletedSet.has(tc.id))
            .map(tc => updatedMap.get(tc.id) || tc);
          
          cases = [...mergedCases, ...result.newCases];
        } else {
          cases = await generateTestCases(text, images, customApiKey, selectedModel, (msg) => setGenerationProgress(msg), testStyle);
        }

        setTestCases(cases);
        setXmindContent('');
        setAnalysisReport('');
        setRevisedDocument('');
        setGenerationMode('matrix');
        
        historyService.save({
          mode: 'matrix',
          style: testStyle,
          fileName: file?.name || '粘贴文本',
          testCases: cases
        });
      } else if (mode === 'xmind') {
        const xmind = await generateXMindContent(text, images, customApiKey, selectedModel, testStyle);
        setXmindContent(xmind);
        setTestCases([]);
        setAnalysisReport('');
        setRevisedDocument('');
        setGenerationMode('xmind');

        historyService.save({
          mode: 'xmind',
          style: testStyle,
          fileName: file?.name || '粘贴文本',
          xmindContent: xmind
        });
      } else {
        const result = await analyzeRequirements(text, images, customApiKey, selectedModel, testStyle);
        setAnalysisReport(result.report);
        setRevisedDocument(result.revisedDocument);
        setTestCases([]);
        setXmindContent('');
        setGenerationMode('analysis');

        historyService.save({
          mode: 'analysis',
          style: testStyle,
          fileName: file?.name || '粘贴文本',
          analysisReport: result.report,
          revisedDocument: result.revisedDocument
        });
      }
      setHistory(historyService.getAll());
    } catch (err) {
      setError(err instanceof Error ? err.message : '发生意外错误。');
    } finally {
      setIsParsing(false);
      setIsGenerating(false);
    }
  };

  const handleExportExcel = () => {
    if (sortedCases.length === 0) return;
    const name = `测试用例_${file?.name.split('.')[0] || '未命名'}.xlsx`;
    exportToExcel(sortedCases, name);
  };

  const handleExportXMind = async () => {
    if (!xmindContent) return;
    const name = `测试导图_${file?.name.split('.')[0] || '未命名'}.xmind`;
    await exportToXMind(xmindContent, name);
  };

  const exportAnalysisReport = () => {
    if (!analysisReport) return;
    const blob = new Blob([analysisReport], { type: 'text/markdown;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `需求分析报告_${file?.name.split('.')[0]}.md`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportRevisedDocument = () => {
    if (!revisedDocument) return;
    const blob = new Blob([revisedDocument], { type: 'text/markdown;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `优化后的需求文档_${file?.name.split('.')[0]}.md`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredCases = testCases.filter(tc => {
    const matchesSearch = tc.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         tc.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         tc.module.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType === '全部' || tc.type.includes(filterType);
    return matchesSearch && matchesFilter;
  });

  const typeOrder = ['功能', '接口', '兼容', '异常', '安全'];
  
  const getSortOrder = (type: string) => {
    const index = typeOrder.findIndex(t => type.includes(t));
    return index === -1 ? typeOrder.length : index;
  };

  const sortedCases = [...filteredCases].sort((a, b) => {
    const orderA = getSortOrder(a.type);
    const orderB = getSortOrder(b.type);
    if (orderA !== orderB) return orderA - orderB;
    // Secondary sort by module then ID
    if (a.module !== b.module) return a.module.localeCompare(b.module);
    return a.id.localeCompare(b.id);
  });

  const types = ['全部', '功能', '接口', '兼容', '异常', '安全', '其他'];

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 font-sans selection:bg-indigo-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="text-white w-5 h-5" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">需求转测试 <span className="text-indigo-600">AI</span></h1>
            </div>

            <nav className="hidden md:flex items-center gap-1 ml-8 self-stretch">
              <button 
                onClick={() => setGenerationMode('analysis')}
                className={cn(
                  "px-4 text-sm font-semibold transition-all relative flex items-center gap-2 h-full",
                  generationMode === 'analysis' ? "text-indigo-600" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                )}
              >
                <FileText className="w-4 h-4" />
                需求评审分析
                {generationMode === 'analysis' && (
                  <motion.div layoutId="nav-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
                )}
              </button>
              <button 
                onClick={() => {
                  if (generationMode === 'analysis') setGenerationMode('matrix');
                }}
                className={cn(
                  "px-4 text-sm font-semibold transition-all relative flex items-center gap-2 h-full",
                  (generationMode === 'matrix' || generationMode === 'xmind') ? "text-indigo-600" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                )}
              >
                <CheckCircle2 className="w-4 h-4" />
                需求转用例
                {(generationMode === 'matrix' || generationMode === 'xmind') && (
                  <motion.div layoutId="nav-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
                )}
              </button>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <a 
              href="#" 
              className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
            >
              使用文档
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 bg-indigo-900 rounded-2xl p-6 text-white shadow-xl shadow-indigo-200/50">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-300" />
            工作原理：{generationMode === 'analysis' ? '需求评审分析' : '需求转用例'}
          </h3>
          <div className="grid md:grid-cols-3 gap-6">
            {generationMode === 'analysis' ? (
              <>
                <div className="flex gap-3">
                  <span className="bg-indigo-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">1</span>
                  <div>
                    <p className="font-medium text-indigo-50">上传需求文档</p>
                    <p className="text-xs text-indigo-200 mt-1">支持 PRD、需求说明书等原始文档。</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="bg-indigo-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">2</span>
                  <div>
                    <p className="font-medium text-indigo-50">AI 深度分析</p>
                    <p className="text-xs text-indigo-200 mt-1">识别逻辑缺陷、边界场景及潜在遗漏点。</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="bg-indigo-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">3</span>
                  <div>
                    <p className="font-medium text-indigo-50">生成评审报告</p>
                    <p className="text-xs text-indigo-200 mt-1">获取结构化分析报告及需求优化建议。</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex gap-3">
                  <span className="bg-indigo-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">1</span>
                  <div>
                    <p className="font-medium text-indigo-50">选择数据源</p>
                    <p className="text-xs text-indigo-200 mt-1">可基于原始文档或已评审后的文档生成。</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="bg-indigo-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">2</span>
                  <div>
                    <p className="font-medium text-indigo-50">AI 拆解测试点</p>
                    <p className="text-xs text-indigo-200 mt-1">根据业务逻辑自动拆解详尽的测试场景。</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="bg-indigo-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">3</span>
                  <div>
                    <p className="font-medium text-indigo-50">一键导出结果</p>
                    <p className="text-xs text-indigo-200 mt-1">支持 Excel 模式用例或 Xmind 思维导图。</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Upload & Controls */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="mb-6">
                <button 
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors mb-2"
                >
                  <Key className="w-4 h-4" />
                  {showApiKey ? '隐藏 API Key 设置' : '设置自定义 API Key (可选)'}
                  <ChevronDown className={cn("w-4 h-4 transition-transform", showApiKey && "rotate-180")} />
                </button>
                <AnimatePresence>
                  {showApiKey && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden space-y-3"
                    >
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                          API Key 选项
                        </label>
                        <div className="space-y-2">
                          <button
                            onClick={handleOpenPlatformKey}
                            className={cn(
                              "w-full px-4 py-2 rounded-xl text-xs font-medium border transition-all flex items-center justify-between",
                              hasPlatformKey 
                                ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                                : "bg-white border-slate-200 text-slate-700 hover:border-indigo-500 hover:text-indigo-600"
                            )}
                          >
                            <span className="flex items-center gap-2">
                              <Key className="w-3 h-3" />
                              {hasPlatformKey ? '已关联平台 API Key' : '关联平台 API Key (推荐)'}
                            </span>
                            {hasPlatformKey && <CheckCircle2 className="w-3 h-3" />}
                          </button>

                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <Key className="h-3 w-3 text-slate-400" />
                            </div>
                            <input 
                              type="password"
                              placeholder="或输入自定义 API Key"
                              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                              value={customApiKey}
                              onChange={(e) => setCustomApiKey(e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                          选择模型
                        </label>
                        <div className="relative">
                          <select 
                            className="w-full pl-4 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer"
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                          >
                            <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (最强能力)</option>
                            <option value="gemini-3-flash-preview">Gemini 3 Flash (极速响应)</option>
                            <option value="gemini-2.5-flash">Gemini 2.5 Flash (稳定版本)</option>
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        如果不填写 Key，将使用系统默认 Key。您的设置仅在本地运行，不会被存储。
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="mb-6 pb-6 border-b border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "p-1.5 rounded-lg",
                      isIncremental ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"
                    )}>
                      <History className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">增量更新模式</h3>
                      <p className="text-[10px] text-slate-500">对比 V1.0 与 V1.1，仅生成变更用例</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsIncremental(!isIncremental)}
                    className={cn(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                      isIncremental ? "bg-indigo-600" : "bg-slate-200"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                        isIncremental ? "translate-x-6" : "translate-x-1"
                      )}
                    />
                  </button>
                </div>

                <AnimatePresence>
                  {isIncremental && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 mb-4">
                        <p className="text-xs text-amber-700 leading-relaxed">
                          <strong>提示：</strong> 请先上传<b>旧版本 (V1.0)</b> 或确保当前已有测试用例，然后再上传<b>新版本 (V1.1)</b>。AI 将自动分析差异。
                        </p>
                      </div>
                      
                      <div 
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const f = e.dataTransfer.files[0];
                          if (f) handleFile(f, true);
                        }}
                        className={cn(
                          "border-2 border-dashed rounded-xl p-4 transition-all flex flex-col items-center justify-center text-center cursor-pointer mb-2",
                          oldFile ? "border-amber-200 bg-amber-50/30" : "border-slate-200 hover:border-amber-400 hover:bg-slate-50"
                        )}
                        onClick={() => document.getElementById('oldFileInput')?.click()}
                      >
                        <input 
                          id="oldFileInput"
                          type="file" 
                          className="hidden" 
                          accept=".pdf,.docx,.md,.txt"
                          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0], true)}
                        />
                        {oldFile ? (
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-amber-600" />
                            <span className="text-xs font-medium text-slate-700 truncate max-w-[150px]">{oldFile.name}</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setOldFile(null); setOldParsedText(''); }}
                              className="p-1 hover:bg-amber-100 rounded-full text-slate-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
                              <FileUp className="w-4 h-4 text-slate-400" />
                            </div>
                            <p className="text-[10px] text-slate-500">点击或拖拽上传<b>旧版 PRD</b></p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <FileUp className="w-5 h-5 text-indigo-600" />
                {isIncremental ? '上传新版需求 (V1.1)' : '上传需求文档'}
              </h2>
              
              <div 
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                className={cn(
                  "border-2 border-dashed rounded-xl p-8 transition-all flex flex-col items-center justify-center text-center cursor-pointer mb-6",
                  file ? "border-indigo-200 bg-indigo-50/30" : "border-slate-200 hover:border-indigo-400 hover:bg-slate-50"
                )}
                onClick={() => document.getElementById('fileInput')?.click()}
              >
                <input 
                  id="fileInput"
                  type="file" 
                  className="hidden" 
                  accept=".pdf,.docx,.md,.txt"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
                
                {file ? (
                  <div className="space-y-2">
                    <FileText className="w-10 h-10 text-indigo-600 mx-auto" />
                    <p className="text-sm font-medium text-slate-900 truncate max-w-[200px]">{file.name}</p>
                    <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-10 h-10 text-slate-400 mx-auto" />
                    <p className="text-sm font-medium text-slate-900">点击或拖拽上传</p>
                    <p className="text-xs text-slate-500">支持 PDF, Word, Markdown</p>
                  </div>
                )}
              </div>

              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <FileUp className="w-5 h-5 text-indigo-600" />
                上传设计图（最多4张）
              </h2>
              
              <div 
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDesignDrop}
                className={cn(
                  "border-2 border-dashed rounded-xl p-6 transition-all flex flex-col items-center justify-center text-center cursor-pointer",
                  designFiles.length > 0 ? "border-indigo-200 bg-indigo-50/30" : "border-slate-200 hover:border-indigo-400 hover:bg-slate-50"
                )}
                onClick={() => designFiles.length < 4 && document.getElementById('designInput')?.click()}
              >
                <input 
                  id="designInput"
                  type="file" 
                  className="hidden" 
                  accept="image/png,image/jpeg,image/jpg"
                  multiple
                  onChange={(e) => e.target.files && handleDesignFiles(Array.from(e.target.files))}
                />
                
                <div className="space-y-2">
                  <Upload className={cn("w-8 h-8 mx-auto", designFiles.length > 0 ? "text-indigo-600" : "text-slate-400")} />
                  <p className="text-sm font-medium text-slate-900">点击或拖拽上传</p>
                  <p className="text-xs text-slate-500">支持 PNG, JPG (最多4张, 每张 &lt; 5MB)</p>
                </div>
              </div>

              {designFiles.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {designFiles.map((f, i) => (
                    <div key={i} className="relative group bg-slate-50 border border-slate-200 rounded-lg p-2 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span className="text-xs text-slate-600 truncate flex-1">{f.name}</span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          removeDesignFile(i);
                        }}
                        className="text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {(generationMode === 'matrix' || generationMode === 'xmind') && (
                <div className="mt-6 space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-slate-700">数据源</h3>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => file && setSourceType('original')}
                        disabled={!file}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                          sourceType === 'original' 
                            ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600" 
                            : "border-slate-200 bg-white hover:border-indigo-300",
                          !file && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <FileText className={cn("w-4 h-4", sourceType === 'original' ? "text-indigo-600" : "text-slate-400")} />
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-xs font-bold truncate", sourceType === 'original' ? "text-indigo-900" : "text-slate-700")}>
                            {file?.name || '原始需求文档'}
                          </p>
                          <p className="text-[10px] text-slate-500">PRD 原始解析内容</p>
                        </div>
                        {sourceType === 'original' && <CheckCircle2 className="w-4 h-4 text-indigo-600" />}
                      </button>

                      {revisedDocument && (
                        <button
                          onClick={() => setSourceType('revised')}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                            sourceType === 'revised' 
                              ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600" 
                              : "border-slate-200 bg-white hover:border-indigo-300"
                          )}
                        >
                          <div className="w-4 h-4 bg-indigo-600 rounded flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-3 h-3 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-xs font-bold truncate", sourceType === 'revised' ? "text-indigo-900" : "text-slate-700")}>
                              修正版: {file?.name}
                            </p>
                            <p className="text-[10px] text-slate-500">基于评审建议优化后的文档</p>
                          </div>
                          {sourceType === 'revised' && <CheckCircle2 className="w-4 h-4 text-indigo-600" />}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-slate-700">测试风格</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.keys(TEST_STYLES) as TestStyle[]).map((style) => {
                        const Icon = style === 'standard' ? Activity : 
                                     style === 'strict' ? Target : 
                                     style === 'fast' ? Zap : Shield;
                        return (
                          <button
                            key={style}
                            onClick={() => setTestStyle(style)}
                            className={cn(
                              "flex flex-col items-start p-2 rounded-xl border transition-all text-left",
                              testStyle === style 
                                ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600" 
                                : "border-slate-200 bg-white hover:border-indigo-300"
                            )}
                          >
                            <div className="flex items-center gap-1.5 mb-1">
                              <Icon className={cn("w-3 h-3", testStyle === style ? "text-indigo-600" : "text-slate-400")} />
                              <span className={cn("text-[10px] font-bold", testStyle === style ? "text-indigo-900" : "text-slate-700")}>
                                {TEST_STYLES[style].name}
                              </span>
                            </div>
                            <p className="text-[8px] text-slate-500 line-clamp-1">{TEST_STYLES[style].description}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-slate-700">视图模式</h3>
                    <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                      <button
                        onClick={() => setGenerationMode('matrix')}
                        className={cn(
                          "py-2 text-[10px] font-medium rounded-lg transition-all",
                          generationMode === 'matrix' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                      >
                        Excel模式
                      </button>
                      <button
                        onClick={() => setGenerationMode('xmind')}
                        className={cn(
                          "py-2 text-[10px] font-medium rounded-lg transition-all",
                          generationMode === 'xmind' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                      >
                        Xmind模式
                      </button>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100">
                    <button 
                      onClick={() => setShowHistory(!showHistory)}
                      className="flex items-center justify-between w-full text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <History className="w-4 h-4" />
                        历史记录 ({history.length})
                      </div>
                      <ChevronDown className={cn("w-4 h-4 transition-transform", showHistory && "rotate-180")} />
                    </button>
                    
                    <AnimatePresence>
                      {showHistory && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden mt-3 space-y-2"
                        >
                          {history.length === 0 ? (
                            <p className="text-xs text-slate-400 text-center py-4">暂无历史记录</p>
                          ) : (
                            history.map((record) => (
                              <div 
                                key={record.id}
                                className="group relative bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-xl p-3 transition-all cursor-pointer"
                                onClick={() => loadHistoryRecord(record)}
                              >
                                <div className="flex items-start justify-between mb-1">
                                  <span className={cn(
                                    "text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase",
                                    record.mode === 'matrix' ? "bg-blue-100 text-blue-700" :
                                    record.mode === 'xmind' ? "bg-purple-100 text-purple-700" :
                                    "bg-amber-100 text-amber-700"
                                  )}>
                                    {record.mode === 'matrix' ? '矩阵' : record.mode === 'xmind' ? '导图' : '评审'}
                                  </span>
                                  <span className="text-[8px] text-slate-400 flex items-center gap-1">
                                    <Clock className="w-2 h-2" />
                                    {new Date(record.timestamp).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                <p className="text-[10px] font-medium text-slate-700 truncate pr-4">{record.fileName}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[8px] text-slate-400 italic">风格: {TEST_STYLES[record.style].name}</span>
                                </div>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteHistoryRecord(record.id);
                                  }}
                                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {file && (
                <button
                  onClick={() => processFile()}
                  disabled={isParsing || isGenerating}
                  className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                >
                  {isParsing || isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {isParsing ? '正在解析文档...' : 'AI 正在分析生成...'}
                    </>
                  ) : (
                    <>
                      {(testCases.length > 0 || xmindContent || analysisReport || revisedDocument) ? '重新生成' : '开始分析生成'}
                    </>
                  )}
                </button>
              )}

              {testCases.length > 0 || xmindContent || analysisReport || revisedDocument ? (
                <button
                  onClick={() => {
                    setFile(null);
                    setDesignFiles([]);
                    setTestCases([]);
                    setXmindContent('');
                    setAnalysisReport('');
                    setRevisedDocument('');
                    setSourceType(null);
                  }}
                  className="w-full mt-4 text-slate-500 hover:text-red-600 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  清空并重新开始
                </button>
              ) : null}

              {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-8 space-y-6">
            {((generationMode === 'matrix' && !testCases.length) || 
              (generationMode === 'xmind' && !xmindContent) || 
              (generationMode === 'analysis' && !analysisReport && !revisedDocument)) && !isParsing && !isGenerating ? (
              <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 bg-white rounded-2xl border border-slate-200 border-dashed">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                  <FileText className="w-8 h-8 text-slate-300" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">尚未生成内容</h3>
                <p className="text-slate-500 max-w-xs mt-2">
                  {file ? '已加载文档，点击“生成”按钮开始分析。' : '上传文档并点击生成，在此查看 AI 驱动的测试用例、思维导图或需求分析。'}
                </p>
              </div>
            ) : (isParsing || isGenerating) ? (
              <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 bg-white rounded-2xl border border-slate-200">
                <div className="relative w-24 h-24 mb-6">
                  <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-indigo-600 animate-pulse" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-slate-900">AI 正在思考...</h3>
                <p className="text-slate-500 mt-2">{generationProgress || '正在分析需求并构建测试场景。'}</p>
                <div className="mt-8 w-full max-w-xs bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <motion.div 
                    className="bg-indigo-600 h-full"
                    initial={{ width: "0%" }}
                    animate={{ width: isParsing ? "30%" : "90%" }}
                    transition={{ duration: 2 }}
                  />
                </div>
              </div>
            ) : generationMode === 'matrix' ? (
              <div className="space-y-4">
                {/* Filters & Actions */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col md:flex-row gap-4 items-center justify-between shadow-sm">
                  <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="搜索测试用例..."
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:flex-none">
                      <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <select 
                        className="pl-10 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer"
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                      >
                        {types.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                    <button 
                      onClick={handleExportExcel}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-800 transition-colors shrink-0"
                    >
                      <Download className="w-4 h-4" />
                      导出 Excel
                    </button>
                  </div>
                </div>

                {/* Test Case List */}
                <div className="space-y-3">
                  <AnimatePresence mode="popLayout">
                    {sortedCases.map((tc, index) => (
                      <motion.div
                        key={tc.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:border-indigo-200 transition-colors shadow-sm"
                      >
                        <div 
                          className="p-4 flex items-center justify-between cursor-pointer"
                          onClick={() => setExpandedId(expandedId === tc.id ? null : tc.id)}
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                {tc.module}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                                  {tc.id}
                                </span>
                                <h4 className="font-semibold text-slate-900">{tc.title}</h4>
                              </div>
                              <div className="flex items-center gap-3 mt-2">
                                <span className={cn(
                                  "text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded",
                                  tc.priority === 'High' ? "bg-red-50 text-red-600" : 
                                  tc.priority === 'Medium' ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
                                )}>
                                  {tc.priority === 'High' ? '高' : tc.priority === 'Medium' ? '中' : '低'}
                                </span>
                                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                  {tc.type}
                                </span>
                              </div>
                            </div>
                          </div>
                          <button className="text-slate-400 hover:text-slate-600">
                            {expandedId === tc.id ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                          </button>
                        </div>

                        <AnimatePresence>
                          {expandedId === tc.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="border-t border-slate-100 bg-slate-50/50"
                            >
                              <div className="p-6 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div>
                                    <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">前置条件</h5>
                                    <p className="text-sm text-slate-700 bg-white p-3 rounded-lg border border-slate-100">{tc.preconditions}</p>
                                  </div>
                                  <div>
                                    <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">输入数据</h5>
                                    <p className="text-sm text-slate-700 bg-white p-3 rounded-lg border border-slate-100">{tc.inputData || '无'}</p>
                                  </div>
                                </div>
                                
                                <div>
                                  <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">测试步骤</h5>
                                  <div className="bg-white p-4 rounded-lg border border-slate-100">
                                    <ol className="space-y-2">
                                      {tc.steps.map((step, i) => (
                                        <li key={i} className="text-sm text-slate-700 flex gap-3">
                                          <span className="text-indigo-600 font-bold">{i + 1}.</span>
                                          {step}
                                        </li>
                                      ))}
                                    </ol>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-xl">
                                    <h5 className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-2">预期结果</h5>
                                    <p className="text-sm text-emerald-800 font-medium">{tc.expectedResult}</p>
                                  </div>
                                  <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-xl">
                                    <h5 className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-2">备注</h5>
                                    <p className="text-sm text-amber-800">{tc.remarks || '无'}</p>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {sortedCases.length === 0 && (
                    <div className="py-12 text-center">
                      <p className="text-slate-500">没有匹配搜索或筛选条件的测试用例。</p>
                    </div>
                  )}
                </div>
              </div>
            ) : generationMode === 'xmind' ? (
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between shadow-sm">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Xmind测试导图</h3>
                    <p className="text-sm text-slate-500">可直接复制以下内容到 XMind 使用</p>
                  </div>
                  <button 
                    onClick={handleExportXMind}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-800 transition-colors shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    导出 XMind 文件
                  </button>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm min-h-[500px]">
                  <pre className="whitespace-pre-wrap font-mono text-sm text-slate-700 leading-relaxed">
                    {xmindContent}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col gap-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl">
                      <button
                        onClick={() => setAnalysisTab('report')}
                        className={cn(
                          "px-4 py-1.5 text-xs font-medium rounded-lg transition-all",
                          analysisTab === 'report' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                      >
                        评审报告
                      </button>
                      <button
                        onClick={() => setAnalysisTab('revised')}
                        className={cn(
                          "px-4 py-1.5 text-xs font-medium rounded-lg transition-all",
                          analysisTab === 'revised' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                      >
                        修正后的文档
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      {analysisTab === 'revised' && (
                        <div className="flex items-center gap-2 mr-2 pr-2 border-r border-slate-200">
                          <button 
                            onClick={() => {
                              setSourceType('revised');
                              setGenerationMode('matrix');
                            }}
                            className="flex items-center gap-2 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-4 py-2 rounded-xl transition-colors"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            基于此修正文档进行测试设计
                          </button>
                        </div>
                      )}
                      <button 
                        onClick={analysisTab === 'report' ? exportAnalysisReport : exportRevisedDocument}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-800 transition-colors shrink-0"
                      >
                        <Download className="w-4 h-4" />
                        导出{analysisTab === 'report' ? '报告' : '文档'}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm min-h-[500px] prose prose-slate max-w-none">
                  <Markdown>{analysisTab === 'report' ? analysisReport : revisedDocument}</Markdown>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto py-8 border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-sm text-slate-500">
            由 Gemini AI 提供支持 • 为质量工程师打造
          </p>
        </div>
      </footer>
    </div>
  );
}
