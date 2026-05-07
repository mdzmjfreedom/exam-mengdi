import React, { useState, useEffect } from 'react';
import { SYSTEM_FIELDS } from '@/utils/excelParser';
import styles from './MappingModal.module.css';

interface MappingModalProps {
  isOpen: boolean;
  excelHeaders: string[];
  initialMapping: Record<string, string>;
  onConfirm: (mapping: Record<string, string>) => void;
  onCancel: () => void;
}

export default function MappingModal({ isOpen, excelHeaders, initialMapping, onConfirm, onCancel }: MappingModalProps) {
  const [currentMapping, setCurrentMapping] = useState<Record<string, string>>({});

  useEffect(() => {
    setCurrentMapping(initialMapping);
  }, [initialMapping, isOpen]);

  if (!isOpen) return null;

  const handleChange = (fieldKey: string, excelHeader: string) => {
    setCurrentMapping(prev => ({
      ...prev,
      [fieldKey]: excelHeader
    }));
  };

  const handleConfirm = () => {
    onConfirm(currentMapping);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>配置模板映射规则</h2>
          <p>系统未能完全自动识别该 Excel 的所有字段，请手动指定对应关系。您的选择将被自动记忆！</p>
        </div>

        <div className={styles.content}>
          <div className={styles.row}>
            <div className={styles.colHeader}>系统字段</div>
            <div className={styles.colHeader}>Excel 表头列</div>
          </div>
          
          <div className={styles.mappingList}>
            {SYSTEM_FIELDS.map(field => (
              <div key={field.key} className={styles.row}>
                <div className={styles.fieldLabel}>
                  {field.label}
                  {field.required && <span className={styles.required}>*</span>}
                </div>
                <div className={styles.fieldSelect}>
                  <select 
                    value={currentMapping[field.key] || ''} 
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    className={styles.select}
                  >
                    <option value="">-- 请选择对应的 Excel 列 --</option>
                    {excelHeaders.map(header => (
                      <option key={header} value={header}>{header}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.btnSecondary} onClick={onCancel}>取消上传</button>
          <button className={styles.btnPrimary} onClick={handleConfirm}>确认映射并导入</button>
        </div>
      </div>
    </div>
  );
}
