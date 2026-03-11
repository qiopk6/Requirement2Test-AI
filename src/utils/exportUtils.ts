import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { TestCase } from '../services/gemini';

/**
 * Export test cases to a styled Excel file
 */
export const exportToExcel = (testCases: TestCase[], fileName: string = '测试用例.xlsx') => {
  const headers = ['模块/接口', '用例编号', '标题', '类型', '前置条件', '步骤', '输入数据', '预期结果', '优先级', '备注'];
  
  const data = testCases.map(tc => [
    tc.module,
    tc.id,
    tc.title,
    tc.type,
    tc.preconditions,
    tc.steps.join('\n'),
    tc.inputData,
    tc.expectedResult,
    tc.priority,
    tc.remarks
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);

  // Set column widths
  const colWidths = [
    { wch: 15 }, // 模块
    { wch: 10 }, // 编号
    { wch: 30 }, // 标题
    { wch: 10 }, // 类型
    { wch: 30 }, // 前置
    { wch: 40 }, // 步骤
    { wch: 20 }, // 输入
    { wch: 40 }, // 预期
    { wch: 8 },  // 优先级
    { wch: 20 }  // 备注
  ];
  worksheet['!cols'] = colWidths;

  // Add filters to the header row
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  worksheet['!autofilter'] = { ref: XLSX.utils.encode_range(range) };

  // Create workbook and append sheet
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '测试用例');

  // Export file
  XLSX.writeFile(workbook, fileName);
};

/**
 * Parse Markdown header structure into XMind JSON format
 */
const parseMarkdownToXMind = (markdown: string) => {
  const lines = markdown.split('\n').filter(line => line.trim() !== '');
  
  // Find the first header to use as root if possible, otherwise use a default
  let rootTitle = '测试思维导图';
  let startIndex = 0;
  
  const firstHeaderMatch = lines[0].match(/^(#+)\s*(.*)/);
  if (firstHeaderMatch) {
    rootTitle = firstHeaderMatch[2].trim();
    startIndex = 1;
  }

  interface XMindNode {
    id: string;
    title: string;
    children?: { attached: XMindNode[] };
  }

  const rootTopic: XMindNode = {
    id: `topic-${Math.random().toString(36).substr(2, 9)}`,
    title: rootTitle,
    children: { attached: [] }
  };

  // Stack to keep track of parent nodes at each level
  // Level 0 is the rootTopic
  const stack: { level: number; node: XMindNode }[] = [{ level: 0, node: rootTopic }];

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const headerMatch = line.match(/^(#+)\s*(.*)/);
    let level: number;
    let title: string;

    if (headerMatch) {
      // If it's a header, level is determined by number of #
      // We normalize it so that the first level below root is 1
      level = headerMatch[1].length;
      title = headerMatch[2].trim();
    } else {
      // If it's not a header (e.g. a list item or plain text), 
      // treat it as a child of the last header
      const listMatch = line.match(/^[-*+]\s*(.*)/);
      title = listMatch ? listMatch[1].trim() : line;
      level = stack[stack.length - 1].level + 1;
    }

    const newNode = {
      id: `topic-${Math.random().toString(36).substr(2, 9)}`,
      title: title,
      children: { attached: [] }
    };

    // Find the correct parent in the stack
    // We want the last node with a level strictly less than the current level
    while (stack.length > 1 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].node;
    if (!parent.children) parent.children = { attached: [] };
    parent.children.attached.push(newNode);
    stack.push({ level, node: newNode });
  }

  // Clean up empty children
  const clean = (node: XMindNode) => {
    if (node.children && node.children.attached.length === 0) {
      delete node.children;
    } else if (node.children) {
      node.children.attached.forEach(clean);
    }
  };
  clean(rootTopic);

  return rootTopic;
};

/**
 * Export Markdown content to a real .xmind file
 */
export const exportToXMind = async (markdown: string, fileName: string = '测试点.xmind') => {
  const rootTopic = parseMarkdownToXMind(markdown);
  
  const contentJson = [
    {
      id: `sheet-${Math.random().toString(36).substr(2, 9)}`,
      class: 'sheet',
      title: 'Sheet 1',
      rootTopic: rootTopic
    }
  ];

  const metadataJson = {
    'creator': { 'name': 'AI Test Gen', 'version': '1.0.0' },
    'createdTime': Date.now()
  };

  const manifestJson = {
    'file-entries': {
      'content.json': { 'content-type': 'application/json' },
      'metadata.json': { 'content-type': 'application/json' }
    }
  };

  const zip = new JSZip();
  zip.file('content.json', JSON.stringify(contentJson));
  zip.file('metadata.json', JSON.stringify(metadataJson));
  zip.file('manifest.json', JSON.stringify(manifestJson));

  const content = await zip.generateAsync({ type: 'blob' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(content);
  link.download = fileName;
  link.click();
};
