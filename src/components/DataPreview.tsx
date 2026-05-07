import React, { useState, useMemo } from 'react';
import { SYSTEM_FIELDS } from '@/utils/excelParser';
import styles from './DataPreview.module.css';

interface DataPreviewProps {
  data: any[];
  mapping: Record<string, string>;
  onDataChange: (newData: any[]) => void;
  onValidationComplete: (isValid: boolean, errors: any[]) => void;
}

export default function DataPreview({ data, mapping, onDataChange, onValidationComplete }: DataPreviewProps) {
  const [editingCell, setEditingCell] = useState<{ rowIndex: number, fieldKey: string } | null>(null);

  // Validation Logic
  const validationResults = useMemo(() => {
    const errors: any[] = [];
    const validData = [...data];
    const externalCodes = new Set<string>();
    
    data.forEach((row, rowIndex) => {
      let rowHasError = false;
      
      // 1. Check Required fields
      SYSTEM_FIELDS.forEach(field => {
        const excelColName = mapping[field.key];
        const val = row[excelColName];
        
        if (field.required && (val === undefined || val === null || String(val).trim() === '')) {
          errors.push({ rowIndex, fieldKey: field.key, msg: `必填字段缺失` });
          rowHasError = true;
        }
        
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          // Format validation
          if (field.key === 'senderPhone' || field.key === 'receiverPhone') {
            const phoneRegex = /^1[3-9]\d{9}$/;
            // simplified phone check, just digits and 11 length or simple check
            const phoneStr = String(val).replace(/\D/g, '');
            if (phoneStr.length < 8) {
              errors.push({ rowIndex, fieldKey: field.key, msg: `电话格式错误` });
            }
          }
          if (field.key === 'weight') {
            const w = parseFloat(val);
            if (isNaN(w) || w <= 0) {
              errors.push({ rowIndex, fieldKey: field.key, msg: `必须为正数` });
            }
          }
          if (field.key === 'count') {
            const c = parseFloat(val);
            if (isNaN(c) || !Number.isInteger(c) || c <= 0) {
              errors.push({ rowIndex, fieldKey: field.key, msg: `必须为正整数` });
            }
          }
          if (field.key === 'tempZone') {
            const validZones = ['常温', '冷藏', '冷冻'];
            if (!validZones.includes(String(val).trim())) {
              errors.push({ rowIndex, fieldKey: field.key, msg: `不在允许范围内(常温/冷藏/冷冻)` });
            }
          }
          if (field.key === 'externalCode') {
            const code = String(val).trim();
            if (externalCodes.has(code)) {
              errors.push({ rowIndex, fieldKey: field.key, msg: `与本批次第其他行重复` });
            }
            externalCodes.add(code);
          }
        }
      });
    });
    
    // Call onValidationComplete on next tick to avoid render loop
    setTimeout(() => {
      onValidationComplete(errors.length === 0, errors);
    }, 0);
    
    return errors;
  }, [data, mapping, onValidationComplete]);

  const handleCellClick = (rowIndex: number, fieldKey: string) => {
    setEditingCell({ rowIndex, fieldKey });
  };

  const handleCellBlur = (rowIndex: number, fieldKey: string, newValue: string) => {
    setEditingCell(null);
    const excelColName = mapping[fieldKey];
    if (data[rowIndex][excelColName] !== newValue) {
      const newData = [...data];
      newData[rowIndex] = { ...newData[rowIndex], [excelColName]: newValue };
      onDataChange(newData);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, fieldKey: string) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.stickyIndex}>行号</th>
            {SYSTEM_FIELDS.map(field => (
              <th key={field.key}>
                {field.label}
                {field.required && <span className={styles.required}>*</span>}
              </th>
            ))}
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => {
            const rowErrors = validationResults.filter(e => e.rowIndex === rowIndex);
            return (
              <tr key={row._originalRowIndex} className={rowErrors.length > 0 ? styles.rowError : ''}>
                <td className={styles.stickyIndex}>{row._originalRowIndex}</td>
                {SYSTEM_FIELDS.map(field => {
                  const excelColName = mapping[field.key];
                  const value = excelColName ? row[excelColName] : '';
                  const cellError = rowErrors.find(e => e.fieldKey === field.key);
                  const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.fieldKey === field.key;
                  
                  return (
                    <td 
                      key={field.key} 
                      className={cellError ? styles.cellError : ''}
                      onClick={() => handleCellClick(rowIndex, field.key)}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          className={styles.editInput}
                          defaultValue={value || ''}
                          onBlur={(e) => handleCellBlur(rowIndex, field.key, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, rowIndex, field.key)}
                        />
                      ) : (
                        <div className={styles.cellContent}>
                          {value || ''}
                          {cellError && (
                            <div className={styles.tooltip}>{cellError.msg}</div>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
                <td>
                  <button 
                    className={styles.deleteBtn}
                    onClick={() => {
                      const newData = data.filter((_, i) => i !== rowIndex);
                      onDataChange(newData);
                    }}
                  >
                    删除
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
