import * as XLSX from 'xlsx';

export interface ParsedRow {
  _originalRowIndex: number;
  [key: string]: any;
}

export interface ParseResult {
  headers: string[];
  data: ParsedRow[];
  fingerprint: string;
}

// System required fields
export const SYSTEM_FIELDS = [
  { key: 'externalCode', label: '外部编码', required: false },
  { key: 'senderName', label: '发件人姓名', required: true },
  { key: 'senderPhone', label: '发件人电话', required: true },
  { key: 'senderAddress', label: '发件人地址', required: true },
  { key: 'receiverName', label: '收件人姓名', required: true },
  { key: 'receiverPhone', label: '收件人电话', required: true },
  { key: 'receiverAddress', label: '收件人地址', required: true },
  { key: 'weight', label: '重量 (kg)', required: true },
  { key: 'count', label: '件数', required: true },
  { key: 'tempZone', label: '温层', required: true },
  { key: 'remark', label: '备注', required: false },
];

// All known header keywords across all templates, used to identify header rows
const ALL_HEADER_KEYWORDS = [
  '外部编码', '外部订单号', '客户单号', '订单号', '单号',
  '发件人', '寄件人', '发货人', '发方',
  '发件人电话', '发件电话', '发货电话', '寄件人电话',
  '发件人地址', '发件地址', '发货地址', '寄件地址',
  '收件人', '收货人', '收方',
  '收件人电话', '收件电话', '收货电话',
  '收件人地址', '收件地址', '收货地址',
  '重量', '件数', '数量', '温层', '温度要求', '备注', '附言',
  'sender', 'receiver', 'weight', 'qty', 'temp zone', 'note', 'ref code',
  'sender tel', 'receiver tel', 'sender address', 'receiver address',
];

/**
 * Determine if a row looks like a header row by checking if its cells
 * match known header keywords. This is much more robust than just counting strings.
 */
function scoreHeaderRow(row: any[]): number {
  if (!row || row.length === 0) return 0;
  let score = 0;
  for (const cell of row) {
    const cellStr = String(cell ?? '').trim().toLowerCase();
    if (!cellStr) continue;
    for (const kw of ALL_HEADER_KEYWORDS) {
      if (cellStr === kw.toLowerCase() || cellStr.includes(kw.toLowerCase())) {
        score++;
        break; // Count each cell once
      }
    }
  }
  return score;
}

/**
 * Find the best sheet to use for data.
 */
function findDataSheet(workbook: XLSX.WorkBook): string {
  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 1) return sheetNames[0];

  // Look for sheets with data-related names
  const dataKeywords = ['订单', '数据', 'data', 'order', '导入', '下单'];
  for (const name of sheetNames) {
    if (dataKeywords.some(kw => name.toLowerCase().includes(kw.toLowerCase()))) {
      return name;
    }
  }

  // If first sheet looks like instructions (few columns), use second sheet
  const firstSheet = workbook.Sheets[sheetNames[0]];
  const firstData: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
  if (firstData.length > 0) {
    const maxCols = Math.max(
      ...firstData.slice(0, 5).map(r =>
        r.filter((c: any) => c !== '' && c !== null && c !== undefined).length
      )
    );
    if (maxCols <= 3 && sheetNames.length > 1) {
      return sheetNames[1];
    }
  }

  return sheetNames[0];
}

export function parseExcelFile(
  file: File,
  onProgress?: (pct: number, current: number, total: number) => void
): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error('文件读取失败');

        const workbook = XLSX.read(data, { type: 'array' });

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error('Excel 文件中没有有效的 Sheet');
        }

        // Find the best sheet
        const sheetName = findDataSheet(workbook);
        const sheet = workbook.Sheets[sheetName];

        if (!sheet) {
          throw new Error(`Sheet "${sheetName}" 不存在`);
        }

        // Convert to array of arrays
        const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (rawData.length === 0) {
          throw new Error('Excel 文件为空，未找到任何数据');
        }

        // Find the header row by scoring each row against known keywords
        let headerRowIndex = -1;
        let bestScore = 0;
        for (let i = 0; i < Math.min(20, rawData.length); i++) {
          const score = scoreHeaderRow(rawData[i]);
          if (score > bestScore) {
            bestScore = score;
            headerRowIndex = i;
          }
        }

        // Require at least 3 keyword matches to consider it a header
        if (headerRowIndex === -1 || bestScore < 3) {
          throw new Error('无法在 Excel 中找到有效的表头行，请检查文件格式');
        }

        // Build headers, filtering out empty/null columns
        const rawHeaders = rawData[headerRowIndex];
        const headers: string[] = [];
        const validColIndices: number[] = [];
        for (let col = 0; col < rawHeaders.length; col++) {
          const h = String(rawHeaders[col] ?? '').trim();
          if (h && h.length > 0) {
            headers.push(h);
            validColIndices.push(col);
          }
        }

        if (headers.length < 3) {
          throw new Error('表头列数不足，无法解析为有效的订单数据');
        }

        const fingerprint = headers.join('|');

        // Extract data rows
        const totalRows = rawData.length - headerRowIndex - 1;
        const rowData: ParsedRow[] = [];
        for (let i = headerRowIndex + 1; i < rawData.length; i++) {
          const rowArray = rawData[i];

          // Skip completely empty rows
          const nonEmpty = validColIndices.filter(ci => {
            const v = rowArray?.[ci];
            return v !== '' && v !== null && v !== undefined;
          });
          if (nonEmpty.length === 0) continue;

          const rowObj: ParsedRow = { _originalRowIndex: i + 1 }; // 1-based for display
          headers.forEach((header, idx) => {
            const colIndex = validColIndices[idx];
            const cellVal = rowArray?.[colIndex];
            rowObj[header] = cellVal !== undefined && cellVal !== null ? cellVal : '';
          });
          rowData.push(rowObj);

          // Report progress
          if (onProgress && totalRows > 0) {
            const pct = Math.round(((i - headerRowIndex) / totalRows) * 100);
            onProgress(Math.min(pct, 100), i - headerRowIndex, totalRows);
          }
        }

        if (rowData.length === 0) {
          throw new Error('Excel 解析后没有有效的数据行');
        }

        // Final progress
        if (onProgress) onProgress(100, rowData.length, rowData.length);

        resolve({ headers, data: rowData, fingerprint });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败，请检查文件编码或格式'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Enhanced heuristic mapping that covers all 5 template variations.
 * Uses exact match first, then contains match, ensuring no duplicate assignments.
 */
export function heuristicMapHeaders(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const usedHeaders = new Set<string>();

  const rules: Record<string, string[]> = {
    externalCode: [
      '外部编码', '外部订单号', '客户单号', '订单号', '外部单号', '单号',
      'ref code', 'order id', 'order no',
    ],
    senderName: [
      '发件人姓名', '发件人', '寄件人姓名', '寄件人', '发货人', '发方',
      'sender name', 'sender',
    ],
    senderPhone: [
      '发件人电话', '发件人手机', '发件电话', '寄件人电话', '寄件人联系方式',
      '发货电话', '发方电话',
      'sender tel', 'sender phone',
    ],
    senderAddress: [
      '发件人地址', '发件地址', '寄件人地址', '寄件人完整地址', '寄件地址',
      '发货地址', '发方地址',
      'sender address', 'sender addr',
    ],
    receiverName: [
      '收件人姓名', '收件人', '收货人姓名', '收货人', '收方',
      'receiver name', 'receiver', 'consignee',
    ],
    receiverPhone: [
      '收件人电话', '收件人手机', '收件电话', '收货人联系方式', '收货电话', '收方电话',
      'receiver tel', 'receiver phone',
    ],
    receiverAddress: [
      '收件人地址', '收件地址', '收货人地址', '收货人完整地址', '收货地址', '收方地址',
      'receiver address', 'receiver addr',
    ],
    weight: [
      '重量(kg)', '重量(KG)', '重量', 'weight(kg)', 'weight',
    ],
    count: [
      '件数', '包裹数', '包裹数量', '数量', 'qty', 'quantity',
    ],
    tempZone: [
      '温层', '温度要求', '温度', '冷藏要求', '储运条件',
      'temp zone', 'temperature',
    ],
    remark: [
      '备注', '附言', '附加说明', '留言',
      'note', 'remark', 'memo',
    ],
  };

  // Pass 1: Exact match (case-insensitive, trimmed)
  for (const field of SYSTEM_FIELDS) {
    const possibleNames = rules[field.key] || [];
    for (const pn of possibleNames) {
      const found = headers.find(h => 
        !usedHeaders.has(h) && h.toLowerCase().trim() === pn.toLowerCase().trim()
      );
      if (found) {
        mapping[field.key] = found;
        usedHeaders.add(found);
        break;
      }
    }
  }

  // Pass 2: Contains match for any still unmatched fields
  for (const field of SYSTEM_FIELDS) {
    if (mapping[field.key]) continue; // Already matched
    const possibleNames = rules[field.key] || [];
    for (const pn of possibleNames) {
      const found = headers.find(h =>
        !usedHeaders.has(h) && h.toLowerCase().includes(pn.toLowerCase())
      );
      if (found) {
        mapping[field.key] = found;
        usedHeaders.add(found);
        break;
      }
    }
  }

  return mapping;
}

/**
 * Count how many required fields are successfully mapped
 */
export function getMappingConfidence(mapping: Record<string, string>): {
  mapped: number;
  total: number;
  score: number;
} {
  const requiredFields = SYSTEM_FIELDS.filter(f => f.required);
  const mapped = requiredFields.filter(
    f => mapping[f.key] && mapping[f.key].trim() !== ''
  ).length;
  return {
    mapped,
    total: requiredFields.length,
    score: requiredFields.length > 0 ? mapped / requiredFields.length : 0,
  };
}
