import { GoogleGenAI, Type } from "@google/genai";

export interface TestCase {
  module: string;
  id: string;
  title: string;
  type: string;
  preconditions: string;
  steps: string[];
  inputData: string;
  expectedResult: string;
  priority: 'High' | 'Medium' | 'Low';
  remarks: string;
}

export type TestStyle = 'standard' | 'strict' | 'fast' | 'security';

export const TEST_STYLES = {
  standard: {
    name: '标准模式',
    description: '平衡覆盖率与效率，适用于日常测试。',
    instruction: '平衡功能覆盖与异常场景，生成全面的测试用例。'
  },
  strict: {
    name: '严格模式',
    description: '侧重边界值、极值、非法输入及复杂的逻辑校验。',
    instruction: '重点关注边界值测试、极值测试、非法输入校验以及复杂的业务逻辑组合场景。'
  },
  fast: {
    name: '快速模式',
    description: '侧重主流程冒烟测试，快速验证核心功能。',
    instruction: '侧重于核心业务流程（Happy Path）和冒烟测试，确保主流程畅通。'
  },
  security: {
    name: '安全专项',
    description: '侧重越权、注入、敏感数据泄露及权限控制。',
    instruction: '重点关注安全性测试，包括水平/垂直越权、SQL注入、XSS、敏感信息泄露、权限控制及身份验证。'
  }
};

export interface ImageContent {
  data: string;
  mimeType: string;
}

async function extractModules(
  requirementText: string,
  customApiKey?: string,
  modelName: string = "gemini-3-flash-preview"
): Promise<string[]> {
  const apiKey = customApiKey || process.env.API_KEY || process.env.GEMINI_API_KEY || '';
  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `
    你是一名资深需求分析师。请阅读以下需求文档，并将其拆分为多个独立的功能模块或业务流程。
    
    **要求：**
    1. 提取出的模块应该是逻辑独立的，方便后续针对每个模块生成详细的测试用例。
    2. 模块数量不宜过多或过少（通常 5-10 个为佳，取决于文档复杂度）。
    3. 只返回模块名称列表。
    4. **全局规则：所有输出内容必须使用中文。**

    **需求文档内容：**
    ${requirementText.substring(0, 30000)} ... (仅截取部分用于提取目录)
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Error extracting modules:", error);
    return ["核心功能流程"]; // Fallback
  }
}

export async function updateProjectOutline(
  currentOutline: string,
  newRequirement: string,
  customApiKey?: string,
  modelName: string = "gemini-3-flash-preview"
): Promise<string> {
  const apiKey = customApiKey || process.env.API_KEY || process.env.GEMINI_API_KEY || '';
  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `
    你是一名资深需求架构师。请根据新上传的需求文档，更新并完善现有的【项目总体需求大纲】。
    
    **目标：**
    维护一份反映项目全貌的、结构化的需求大纲。这份大纲将作为后续生成测试用例的核心业务背景。
    
    **要求：**
    1. **功能拆分**：将各个大功能拆分成独立的章节（使用 ## 标题），每个章节应包含该功能的详细需求、业务规则和逻辑流程。
    2. **整合与去重**：将新需求中的功能点、业务流程、业务规则整合到现有大纲中。如果新需求是对现有功能的修改，请更新相应部分。
    3. **保持结构化**：使用清晰的 Markdown 层级结构（模块 -> 功能点 -> 核心规则）。
    4. **突出业务逻辑**：重点记录业务流程、状态流转、核心算法、权限控制等关键逻辑。
    5. **简洁而全面**：不需要保留文档中的所有废话，但必须保留所有具有业务价值的信息。
    6. **全局规则：所有输出内容必须使用中文。**

    **现有大纲：**
    ${currentOutline || "（暂无现有大纲）"}

    **新上传的需求文档：**
    ${newRequirement}
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts: [{ text: prompt }] }
    });

    return response.text || currentOutline;
  } catch (error) {
    console.error("Error updating project outline:", error);
    return currentOutline;
  }
}

export async function generateTestCases(
  requirementText: string, 
  images?: ImageContent[], 
  customApiKey?: string,
  modelName: string = "gemini-3-flash-preview",
  onProgress?: (message: string) => void,
  style: TestStyle = 'standard',
  projectOutline?: string
): Promise<TestCase[]> {
  const styleInstruction = TEST_STYLES[style].instruction;
  const businessContext = projectOutline ? `
    **业务背景与功能边界（项目总体需求大纲）：**
    ${projectOutline}
    
    请始终参考以上【项目总体需求大纲】作为业务背景。
  ` : "";

  const qualityRequirements = `
    **生成要求（极其重要）：**
    1. **真实业务场景**：所有测试用例必须基于该APP的实际功能模块、业务流程和业务规则。
    2. **去通用化**：严禁生成与当前APP无关或通用化的测试场景（如通用的登录、注册模板，除非需求中明确定义了这些逻辑）。
    3. **逻辑一致性**：测试点、步骤和预期结果需与需求中的页面结构、接口逻辑和业务规则保持严格一致。
    4. **合理补充**：如需求中存在未明确说明的细节，请结合已有业务逻辑（参考大纲）进行合理补充，但不得脱离整体产品设计。
  `;

  // Check if document is long (threshold: 15000 chars)
  if (requirementText.length > 15000) {
    onProgress?.("文档较长，正在提取功能模块以进行分段分析...");
    const modules = await extractModules(requirementText, customApiKey, modelName);
    let allTestCases: TestCase[] = [];
    
    // Process each module sequentially to avoid hitting rate limits too hard and to stay organized
    for (let i = 0; i < modules.length; i++) {
      const moduleName = modules[i];
      onProgress?.(`正在生成模块 [${moduleName}] 的测试用例 (${i + 1}/${modules.length})...`);
      
      const modulePrompt = `
        你是一名顶级软件测试专家。我将提供整个产品的功能文档。
        请针对 **${moduleName}** 模块生成**极其详尽的测试用例矩阵**。
        
        ${businessContext}
        ${qualityRequirements}

        **测试风格要求：**
        ${styleInstruction}

        **关键目标：**
        1. **深度挖掘**：深入挖掘该模块中的每一个功能点、每一个输入框、每一个按钮、每一个接口参数。
        2. **多维度覆盖**：UI交互、表单验证、异常场景、边界值、权限校验等。
        3. **全局规则：所有生成的测试用例内容（标题、步骤、预期结果等）必须使用中文。**

        **用例结构要求：**
        - 模块名称：必须使用 "${moduleName}"。
        - 用例编号：MOD_TC_XXX 格式。
        - 用例标题、测试类型、前置条件、测试步骤、输入数据、预期结果、优先级、备注。

        **需求文档全文如下：**
        ${requirementText}
      `;

      const moduleParts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [{ text: modulePrompt }];
      if (images && images.length > 0) {
        images.forEach(img => {
          moduleParts.push({
            inlineData: {
              mimeType: img.mimeType,
              data: img.data.split(',')[1] || img.data
            }
          });
        });
      }

      const apiKey = customApiKey || process.env.API_KEY || process.env.GEMINI_API_KEY || '';
      const ai = new GoogleGenAI({ apiKey });
      
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: { parts: moduleParts },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  module: { type: Type.STRING },
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  type: { type: Type.STRING },
                  preconditions: { type: Type.STRING },
                  steps: { 
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                  inputData: { type: Type.STRING },
                  expectedResult: { type: Type.STRING },
                  priority: { type: Type.STRING, enum: ["High", "Medium", "Low"] },
                  remarks: { type: Type.STRING }
                },
                required: ["module", "id", "title", "type", "preconditions", "steps", "inputData", "expectedResult", "priority", "remarks"]
              }
            }
          }
        });

        if (response.text) {
          const moduleCases = JSON.parse(response.text);
          allTestCases = [...allTestCases, ...moduleCases];
        }
      } catch (e) {
        console.error(`Error generating cases for module ${moduleName}:`, e);
        // Continue to next module even if one fails
      }
    }
    
    if (allTestCases.length > 0) return allTestCases;
    // If all failed or returned empty, fall back to normal generation
  }

  const apiKey = customApiKey || process.env.API_KEY || process.env.GEMINI_API_KEY || '';
  const ai = new GoogleGenAI({ apiKey });
  const model = modelName;
  
  const prompt = `
    你是一名顶级软件测试专家。我将提供整个产品的功能文档、页面设计和接口列表。请帮我生成**极其详尽的全套测试用例矩阵**。
    
    **测试风格要求：**
    ${styleInstruction}

    **关键目标：**
    1. **穷尽性测试**：不要只生成几个示例。你需要深入挖掘文档中的每一个功能点、每一个输入框、每一个按钮、每一个接口参数。
    2. **数量要求**：请根据文档复杂度生成尽可能多的用例（目标 30-50 条以上，如果文档复杂则更多）。必须确保覆盖所有模块。
    3. **全局规则：所有生成的测试用例内容必须使用中文。**
    4. **多维度覆盖：**
       - **前端**：UI交互、表单验证（各种非法输入）、页面跳转、E2E流程、响应式适配。
       - **后端**：所有 API 的请求/响应、必填项、类型校验、权限校验、逻辑校验、异常处理。
       - **场景**：正向流程、负向流程、边界值（极值、空值、超长值）、异常场景（断网、超时、并发、非法操作）。

    **用例结构要求：**
    - 模块名称：清晰标注所属功能块或接口。
    - 用例编号：MOD001_TC001 格式。
    - 用例标题：简洁明确。
    - 测试类型：功能/性能/安全/兼容性/边界值/异常/接口。
    - 前置条件：执行该用例的前提。
    - 测试步骤：步骤必须详细，任何人拿到都能复现。
    - 输入数据：具体的测试数据（如：'admin123', '-1', '超长字符串...'）。
    - 预期结果：明确的成功或失败判定标准。
    - 优先级：High/Medium/Low。
    - 备注：说明该用例设计的意图或注意点。

    **需求文档内容如下：**
    ${requirementText}

    ${images && images.length > 0 ? "此外，我还提供了一些设计图作为参考，请结合设计图中的 UI 细节（如按钮位置、输入框类型、视觉反馈等）来完善测试用例。" : ""}

    请严格按照以上要求，生成一份完整、专业、可直接用于生产环境的测试用例矩阵。
  `;

  const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [{ text: prompt }];
  if (images && images.length > 0) {
    images.forEach(img => {
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.data.split(',')[1] || img.data
        }
      });
    });
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              module: { type: Type.STRING },
              id: { type: Type.STRING },
              title: { type: Type.STRING },
              type: { type: Type.STRING },
              preconditions: { type: Type.STRING },
              steps: { 
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              inputData: { type: Type.STRING },
              expectedResult: { type: Type.STRING },
              priority: { type: Type.STRING, enum: ["High", "Medium", "Low"] },
              remarks: { type: Type.STRING }
            },
            required: ["module", "id", "title", "type", "preconditions", "steps", "inputData", "expectedResult", "priority", "remarks"]
          }
        }
      }
    });

    if (!response.text) {
      throw new Error("AI 未返回任何内容，请重试。");
    }

    return JSON.parse(response.text);
  } catch (error: unknown) {
    console.error("Gemini API Error (Test Cases):", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("Safety")) {
      throw new Error("内容被安全过滤器拦截，请检查您的文档或图片内容。");
    }
    if (errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("Quota")) {
      throw new Error("API 请求配额已耗尽或请求过于频繁。请稍后再试，或在设置中配置您自己的 API Key 以获得更高配额。");
    }
    throw new Error(`生成测试用例失败: ${errorMsg || "未知错误"}`);
  }
}

export async function generateXMindContent(
  requirementText: string, 
  images?: ImageContent[], 
  customApiKey?: string,
  modelName: string = "gemini-3-flash-preview",
  style: TestStyle = 'standard',
  projectOutline?: string
): Promise<string> {
  const apiKey = customApiKey || process.env.API_KEY || process.env.GEMINI_API_KEY || '';
  const ai = new GoogleGenAI({ apiKey });
  const model = modelName;
  const styleInstruction = TEST_STYLES[style].instruction;
  
  const businessContext = projectOutline ? `
    **业务背景与功能边界（项目总体需求大纲）：**
    ${projectOutline}
    
    请始终参考以上【项目总体需求大纲】作为业务背景。
  ` : "";

  const qualityRequirements = `
    **生成要求（极其重要）：**
    1. **真实业务场景**：所有测试点必须基于该APP的实际功能模块、业务流程和业务规则。
    2. **去通用化**：严禁生成与当前APP无关或通用化的测试场景。
    3. **逻辑一致性**：测试点、步骤和预期结果需与需求中的页面结构、接口逻辑和业务规则保持严格一致。
  `;

  const prompt = `
    你是一名拥有10年以上经验的软件测试专家，擅长测试分析和测试设计。

    我会提供产品需求文档（PRD）或功能说明，你需要根据需求内容生成 **XMind结构的测试用例思维导图**。

    ${businessContext}
    ${qualityRequirements}

    **测试风格要求：**
    ${styleInstruction}

    【目标】

    生成可以直接用于测试执行的思维导图，结构为：

    功能
    测试点
    测试步骤 + 预期结果

    【输出格式】

    必须使用 **Markdown 标题层级结构**，以确保 XMind 导入后能识别为 3 级结构：

    # 功能模块 (第1级)
    ## 测试点名称 (第2级)
    ### 步骤：xxxx \n预期：xxxx (第3级)

    示例格式：

    # 用户登录
    ## 正常登录-用户名密码正确
    ### 步骤：输入正确用户名和密码点击登录\n预期：登录成功并进入首页
    ## 异常登录-密码错误
    ### 步骤：输入正确用户名和错误密码点击登录\n预期：提示“密码错误”

    【测试设计要求】

    每个功能需要覆盖以下测试维度：

    1 功能测试
    2 异常场景
    3 边界值测试
    4 用户误操作
    5 权限测试
    6 网络异常
    7 数据异常
    8 UI交互
    9 接口异常

    【步骤编写规则】

    步骤必须：

    * 简洁
    * 一句话描述
    * 可直接执行

    例如：

    步骤：点击首页推荐短剧
    预期：进入短剧播放页

    不要写：

    ❌ 打开浏览器进入系统然后点击按钮

    【预期结果规则】

    预期结果必须：

    * 明确
    * 可验证
    * 一句话描述

    例如：

    预期：提示“用户名不能为空”
    预期：页面跳转至短剧播放页
    预期：返回错误码401

    【输出规则】

    1 只输出思维导图结构
    2 不需要解释
    3 层级清晰
    4 请保证每个功能生成 8-15 个测试点
    5 步骤与预期尽量简洁（非常重要）
    6 输出内容可以直接复制到 XMind
    7 **全局规则：所有输出内容必须使用中文。**

    **需求文档内容如下：**
    ${requirementText}

    ${images && images.length > 0 ? "此外，我还提供了一些设计图作为参考，请结合设计图中的 UI 细节来完善测试点。" : ""}
  `;

  const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [{ text: prompt }];
  if (images && images.length > 0) {
    images.forEach(img => {
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.data.split(',')[1] || img.data
        }
      });
    });
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: { parts }
    });

    return response.text || "";
  } catch (error: unknown) {
    console.error("Gemini API Error (XMind):", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("Safety")) {
      throw new Error("内容被安全过滤器拦截，请检查您的文档或图片内容。");
    }
    if (errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("API 请求配额已耗尽或请求过于频繁。请稍后再试，或在设置中配置您自己的 API Key 以获得更高配额。");
    }
    throw new Error(`生成思维导图失败: ${errorMsg || "未知错误"}`);
  }
}

export async function analyzeRequirements(
  requirementText: string, 
  images?: ImageContent[], 
  customApiKey?: string,
  modelName: string = "gemini-3-flash-preview",
  style: TestStyle = 'standard'
): Promise<{ report: string; revisedDocument: string }> {
  const apiKey = customApiKey || process.env.API_KEY || process.env.GEMINI_API_KEY || '';
  const ai = new GoogleGenAI({ apiKey });
  const model = modelName;
  const styleInstruction = TEST_STYLES[style].instruction;

  const prompt = `
    请扮演以下角色共同评审需求文档：

    - 资深产品经理
    - 系统架构师
    - QA测试负责人
    - 用户体验设计师

    请对需求文档进行多角色评审，并输出评审报告。

    **评审风格要求：**
    ${styleInstruction}

    重点发现：
    1 产品逻辑漏洞
    2 用户体验问题
    3 业务规则缺失
    4 异常场景缺失
    5 接口设计问题
    6 数据设计问题
    7 测试难点
    8 技术风险

    最终输出要求：
    请将输出分为两个部分：
    1. 评审报告：包含需求理解、需求问题清单、风险评估、优化建议。
    2. 修正后的完整需求文档：**这是最关键的部分**。请基于原始需求文档，将评审中发现的问题进行修正，并补充缺失的细节。
       **注意：必须保留原始文档中的所有现有章节、功能描述和细节，严禁进行任何形式的删减或概括。** 
       你需要在保持原貌的基础上进行“增量式”的完善和修正，确保输出的是一份可以直接替代原文档的、更严谨、更完整的版本。
    3. **全局规则：所有输出内容（评审报告和修正后的文档）必须使用中文。**

    请以 JSON 格式返回，包含以下字段：
    - report: 评审报告的 Markdown 内容
    - revisedDocument: 修正后的完整需求文档的 Markdown 内容（必须包含全部原始内容 + 修正补充内容）
    
    **需求文档内容如下：**
    ${requirementText}

    ${images && images.length > 0 ? "此外，我还提供了一些设计图作为参考，请结合设计图进行评审。" : ""}
  `;

  const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [{ text: prompt }];
  if (images && images.length > 0) {
    images.forEach(img => {
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.data.split(',')[1] || img.data
        }
      });
    });
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            report: { type: Type.STRING },
            revisedDocument: { type: Type.STRING }
          },
          required: ["report", "revisedDocument"]
        }
      }
    });

    if (!response.text) {
      throw new Error("AI 未返回任何内容");
    }

    return JSON.parse(response.text);
  } catch (error: unknown) {
    console.error("Gemini API Error (Analysis):", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("Safety")) {
      throw new Error("内容被安全过滤器拦截，请检查您的文档或图片内容。");
    }
    if (errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("API 请求配额已耗尽或请求过于频繁。请稍后再试，或在设置中配置您自己的 API Key 以获得更高配额。");
    }
    throw new Error(`需求分析失败: ${errorMsg || "未知错误"}`);
  }
}

export async function generateIncrementalTestCases(
  oldRequirementText: string,
  newRequirementText: string,
  existingTestCases: TestCase[],
  images?: ImageContent[],
  customApiKey?: string,
  modelName: string = "gemini-3-flash-preview",
  onProgress?: (message: string) => void,
  style: TestStyle = 'standard',
  projectOutline?: string
): Promise<{ newCases: TestCase[]; updatedCases: TestCase[]; deletedIds: string[] }> {
  const apiKey = customApiKey || process.env.API_KEY || process.env.GEMINI_API_KEY || '';
  const ai = new GoogleGenAI({ apiKey });
  const styleInstruction = TEST_STYLES[style].instruction;

  const businessContext = projectOutline ? `
    **业务背景与功能边界（项目总体需求大纲）：**
    ${projectOutline}
    
    请始终参考以上【项目总体需求大纲】作为业务背景。
  ` : "";

  const qualityRequirements = `
    **生成要求（极其重要）：**
    1. **真实业务场景**：所有测试用例必须基于该APP的实际功能模块、业务流程和业务规则。
    2. **去通用化**：严禁生成与当前APP无关或通用化的测试场景。
    3. **逻辑一致性**：测试点、步骤和预期结果需与需求中的页面结构、接口逻辑和业务规则保持严格一致。
  `;

  onProgress?.("正在对比需求变更并生成增量测试用例...");

  const prompt = `
    你是一名资深软件测试专家。我将提供两个版本的需求文档（旧版 V1.0 和新版 V1.1），以及现有的测试用例列表。
    请分析需求变更，并输出“测试用例补丁”。

    ${businessContext}
    ${qualityRequirements}

    **输入数据：**
    1. **旧版需求 (V1.0)**: 
    ${oldRequirementText.substring(0, 10000)}
    
    2. **新版需求 (V1.1)**:
    ${newRequirementText.substring(0, 10000)}
    
    3. **现有测试用例**:
    ${JSON.stringify(existingTestCases.map(tc => ({ id: tc.id, title: tc.title, module: tc.module })))}

    **任务要求：**
    1. **识别新增功能**：针对新版中新增的功能点，生成全新的测试用例。
    2. **识别修改功能**：针对逻辑发生变化的功能，输出更新后的测试用例（保持原 ID）。
    3. **识别删除功能**：识别由于需求删除而失效的用例 ID。
    4. **全局规则：所有输出内容必须使用中文。**

    **测试风格要求：**
    ${styleInstruction}

    **输出格式要求：**
    请返回一个 JSON 对象，包含以下三个字段：
    - newCases: 新增的测试用例数组（遵循标准 TestCase 结构）。
    - updatedCases: 需要更新的现有测试用例数组（必须包含原 ID）。
    - deletedIds: 需要删除的用例 ID 字符串数组。

    TestCase 结构：
    {
      "module": "模块名",
      "id": "用例编号",
      "title": "标题",
      "type": "类型",
      "preconditions": "前置条件",
      "steps": ["步骤1", "步骤2"],
      "inputData": "输入数据",
      "expectedResult": "预期结果",
      "priority": "High/Medium/Low",
      "remarks": "备注"
    }
  `;

  const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [{ text: prompt }];
  if (images && images.length > 0) {
    images.forEach(img => {
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.data.split(',')[1] || img.data
        }
      });
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            newCases: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  module: { type: Type.STRING },
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  type: { type: Type.STRING },
                  preconditions: { type: Type.STRING },
                  steps: { type: Type.ARRAY, items: { type: Type.STRING } },
                  inputData: { type: Type.STRING },
                  expectedResult: { type: Type.STRING },
                  priority: { type: Type.STRING, enum: ["High", "Medium", "Low"] },
                  remarks: { type: Type.STRING }
                },
                required: ["module", "id", "title", "type", "preconditions", "steps", "inputData", "expectedResult", "priority", "remarks"]
              }
            },
            updatedCases: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  module: { type: Type.STRING },
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  type: { type: Type.STRING },
                  preconditions: { type: Type.STRING },
                  steps: { type: Type.ARRAY, items: { type: Type.STRING } },
                  inputData: { type: Type.STRING },
                  expectedResult: { type: Type.STRING },
                  priority: { type: Type.STRING, enum: ["High", "Medium", "Low"] },
                  remarks: { type: Type.STRING }
                },
                required: ["module", "id", "title", "type", "preconditions", "steps", "inputData", "expectedResult", "priority", "remarks"]
              }
            },
            deletedIds: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["newCases", "updatedCases", "deletedIds"]
        }
      }
    });

    return JSON.parse(response.text || '{"newCases":[],"updatedCases":[],"deletedIds":[]}');
  } catch (error: unknown) {
    console.error("Gemini API Error (Incremental):", error);
    throw new Error(`增量更新失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}
