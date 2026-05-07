import React, { useState, useMemo, useEffect, useRef } from 'react';
import { SYSTEM_FIELDS } from '@/utils/excelParser';
import styles from './DataPreview.module.css';

interface DataPreviewProps {
  data: any[];
  mapping: Record<string, string>;
  onDataChange: (newData: any[]) => void;
  onValidationComplete: (isValid: boolean, errors: any[]) => void;
}

export default function DataPreview({ data, mapping, onDataChange, onValidationComplete }: DataPreviewProps) {
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; fieldKey: string } | null>(null);
  const [dbDuplicates, setDbDuplicates] = useState<Set<string>>(new Set());
  const lastCheckedRef = useRef<string>('');

  // Check external codes against database
  useEffect(() => {
    if (!mapping.externalCode) return;

    const codes = data
      .map(row => String(row[mapping.externalCode] || '').trim())
      .filter(c => c !== '');

    const codesKey = codes.sort().join(',');
    if (codesKey === lastCheckedRef.current) return;
    lastCheckedRef.current = codesKey;

    if (codes.length === 0) {
      setDbDuplicates(new Set());
      return;
    }

    const uniqueCodes = [...new Set(codes)];
    fetch('/api/orders/check-duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codes: uniqueCodes }),
    })
      .then(res => res.json())
      .then(result => {
        setDbDuplicates(new Set(result.duplicates || []));
      })
      .catch(() => {
        setDbDuplicates(new Set());
      });
  }, [data, mapping]);

  // Validation Logic
  const validationResults = useMemo(() => {
    const errors: any[] = [];

    // Build map of external codes -> row indices for batch duplicate detection
    const codeMap = new Map<string, number[]>();
    if (mapping.externalCode) {
      data.forEach((row, rowIndex) => {
        const code = String(row[mapping.externalCode] || '').trim();
        if (code) {
          if (!codeMap.has(code)) codeMap.set(code, []);
          codeMap.get(code)!.push(rowIndex);
        }
      });
    }

    data.forEach((row, rowIndex) => {
      SYSTEM_FIELDS.forEach(field => {
        const excelColName = mapping[field.key];
        if (!excelColName) {
          if (field.required) {
            errors.push({ rowIndex, fieldKey: field.key, msg: '字段未映射' });
          }
          return;
        }

        const val = row[excelColName];
        const strVal = String(val ?? '').trim();

        // Required field check
        if (field.required && strVal === '') {
          errors.push({ rowIndex, fieldKey: field.key, msg: '必填字段缺失' });
          return;
        }

        if (strVal === '') return;

        // Phone format validation
        if (field.key === 'senderPhone' || field.key === 'receiverPhone') {
          const digits = strVal.replace(/\D/g, '');
          if (digits.length < 7 || digits.length > 15) {
            errors.push({ rowIndex, fieldKey: field.key, msg: '电话格式错误' });
          }
        }

        // Weight validation
        if (field.key === 'weight') {
          const w = parseFloat(strVal);
          if (isNaN(w) || w <= 0) {
            errors.push({ rowIndex, fieldKey: field.key, msg: '必须为正数' });
          }
        }

        // Count validation
        if (field.key === 'count') {
          const c = parseFloat(strVal);
          if (isNaN(c) || !Number.isInteger(c) || c <= 0) {
            errors.push({ rowIndex, fieldKey: field.key, msg: '必须为正整数' });
          }
        }

        // Temperature zone validation
        if (field.key === 'tempZone') {
          const validZones = ['常温', '冷藏', '冷冻'];
          if (!validZones.includes(strVal)) {
            errors.push({ rowIndex, fieldKey: field.key, msg: '不在允许范围内(常温/冷藏/冷冻)' });
          }
        }

        // External code duplicate checks
        if (field.key === 'externalCode' && strVal) {
          // 1. Batch internal duplicate
          const dupes = codeMap.get(strVal);
          if (dupes && dupes.length > 1) {
            const otherRows = dupes
              .filter(i => i !== rowIndex)
              .map(i => data[i]._originalRowIndex);
            errors.push({
              rowIndex,
              fieldKey: field.key,
              msg: `批次内重复，与第 ${otherRows.join(', ')} 行重复`,
            });
          }

          // 2. Database duplicate
          if (dbDuplicates.has(strVal)) {
            errors.push({
              rowIndex,
              fieldKey: field.key,
              msg: '与数据库中已有数据重复',
            });
          }
        }
      });
    });

    // Notify parent on next tick
    setTimeout(() => {
      onValidationComplete(errors.length === 0, errors);
    }, 0);

    return errors;
  }, [data, mapping, dbDuplicates, onValidationComplete]);

  const handleCellClick = (rowIndex: number, fieldKey: string) => {
    setEditingCell({ rowIndex, fieldKey });
  };

  const handleCellBlur = (rowIndex: number, fieldKey: string, newValue: string) => {
    setEditingCell(null);
    const excelColName = mapping[fieldKey];
    if (!excelColName) return;
    if (String(data[rowIndex][excelColName] ?? '') !== newValue) {
      const newData = [...data];
      newData[rowIndex] = { ...newData[rowIndex], [excelColName]: newValue };
      onDataChange(newData);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, fieldKey: string) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      e.currentTarget.blur();
      const fieldIndex = SYSTEM_FIELDS.findIndex(f => f.key === fieldKey);
      if (e.shiftKey) {
        // Move to previous field
        const prevField = SYSTEM_FIELDS[fieldIndex - 1];
        if (prevField) {
          setTimeout(() => setEditingCell({ rowIndex, fieldKey: prevField.key }), 30);
        }
      } else {
        // Move to next field, or next row's first field
        const nextField = SYSTEM_FIELDS[fieldIndex + 1];
        if (nextField) {
          setTimeout(() => setEditingCell({ rowIndex, fieldKey: nextField.key }), 30);
        } else if (rowIndex + 1 < data.length) {
          setTimeout(() => setEditingCell({ rowIndex: rowIndex + 1, fieldKey: SYSTEM_FIELDS[0].key }), 30);
        }
      }
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
                {!mapping[field.key] && <span className={styles.unmapped}> (未映射)</span>}
              </th>
            ))}
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => {
            const rowErrors = validationResults.filter(e => e.rowIndex === rowIndex);
            return (
              <tr key={rowIndex} className={rowErrors.length > 0 ? styles.rowError : ''}>
                <td className={styles.stickyIndex}>{row._originalRowIndex}</td>
                {SYSTEM_FIELDS.map(field => {
                  const excelColName = mapping[field.key];
                  const value = excelColName ? (row[excelColName] ?? '') : '';
                  const cellErrors = rowErrors.filter(e => e.fieldKey === field.key);
                  const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.fieldKey === field.key;

                  return (
                    <td
                      key={field.key}
                      className={cellErrors.length > 0 ? styles.cellError : ''}
                      onClick={() => handleCellClick(rowIndex, field.key)}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          className={styles.editInput}
                          defaultValue={String(value)}
                          onBlur={(e) => handleCellBlur(rowIndex, field.key, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, rowIndex, field.key)}
                        />
                      ) : (
                        <div className={styles.cellContent}>
                          <span>{String(value)}</span>
                          {cellErrors.length > 0 && (
                            <div className={styles.tooltip}>
                              {cellErrors.map((err, i) => (
                                <div key={i}>{err.msg}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
                <td>
                  <button
                    className={styles.deleteBtn}
                    onClick={(e) => {
                      e.stopPropagation();
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
