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

export function parseExcelFile(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Use first sheet
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Convert to JSON
        // Using header: 1 gives us an array of arrays
        const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        
        if (rawData.length === 0) {
          throw new Error('Excel 文件为空');
        }

        // Find the header row heuristically (row with most string columns)
        let headerRowIndex = 0;
        let maxCols = 0;
        
        for (let i = 0; i < Math.min(10, rawData.length); i++) {
          const row = rawData[i];
          const cols = row.filter((cell: any) => typeof cell === 'string' && cell.trim() !== '').length;
          if (cols > maxCols) {
            maxCols = cols;
            headerRowIndex = i;
          }
        }
        
        const headers = rawData[headerRowIndex].map((h: any) => String(h).trim());
        const fingerprint = headers.join('|');
        
        // Extract data
        const rowData: ParsedRow[] = [];
        for (let i = headerRowIndex + 1; i < rawData.length; i++) {
          const rowArray = rawData[i];
          // Skip completely empty rows
          if (rowArray.every((cell: any) => cell === '' || cell === null || cell === undefined)) {
            continue;
          }
          
          const rowObj: ParsedRow = { _originalRowIndex: i + 1 }; // 1-based index
          headers.forEach((header, colIdx) => {
            if (header) {
              rowObj[header] = rowArray[colIdx];
            }
          });
          rowData.push(rowObj);
        }
        
        resolve({ headers, data: rowData, fingerprint });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
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

export function heuristicMapHeaders(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}; // map system field key -> excel header name
  
  const rules: Record<string, string[]> = {
    externalCode: ['外部编码', '订单号', '外部单号', 'ID', '外部系统编号'],
    senderName: ['发件人', '发件人姓名', '寄件人', '寄件人姓名', '发方'],
    senderPhone: ['发件人电话', '发件人手机', '寄件人联系方式', '寄件人电话'],
    senderAddress: ['发件人地址', '寄件人完整地址', '寄件地址', '发方地址'],
    receiverName: ['收件人', '收件人姓名', '收货人', '收货人姓名', '收方', 'Receiver'],
    receiverPhone: ['收件人电话', '收货人联系方式', '收方电话', '收件人手机'],
    receiverAddress: ['收件人地址', '收货人完整地址', '收货地址', '收方地址'],
    weight: ['重量', '重量 (kg)', '重量(kg)', '重', 'Weight'],
    count: ['件数', '包裹数', '包裹数量', '数量'],
    tempZone: ['温层', '温度', '冷藏要求', '储运条件'],
    remark: ['备注', '附加说明', '说明', '留言'],
  };

  for (const field of SYSTEM_FIELDS) {
    const possibleNames = rules[field.key] || [];
    const matchedHeader = headers.find(h => possibleNames.some(pn => h.toLowerCase().includes(pn.toLowerCase())));
    if (matchedHeader) {
      mapping[field.key] = matchedHeader;
    }
  }

  return mapping;
}
