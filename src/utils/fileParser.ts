import * as pdfjs from 'pdfjs-dist';
import mammoth from 'mammoth';

// Use a more robust way to set the worker
// We use the same version as the installed package to ensure compatibility
const PDFJS_VERSION = '4.4.168'; 
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

export async function parseFile(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'pdf':
      return parsePdf(file);
    case 'docx':
      return parseDocx(file);
    case 'md':
    case 'txt':
      return parseText(file);
    default:
      throw new Error('不支持的文件格式。请上传 PDF、DOCX 或 MD 文件。');
  }
}

async function parsePdf(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ 
      data: arrayBuffer,
      useSystemFonts: true,
      isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
      fullText += pageText + '\n';
    }

    return fullText;
  } catch (error) {
    console.error('PDF 解析错误:', error);
    if (error instanceof Error && error.message.includes('toHex')) {
      throw new Error('由于兼容性问题，PDF 解析失败。请尝试将 PDF 转换为其他格式，或使用更简单的 PDF。');
    }
    throw new Error('解析 PDF 文件失败。请确保它是一个有效的 PDF 文档。');
  }
}

async function parseDocx(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  } catch (error) {
    console.error('DOCX 解析错误:', error);
    throw new Error('解析 Word 文件失败。请确保它是一个有效的 .docx 文档。');
  }
}

async function parseText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsText(file);
  });
}
