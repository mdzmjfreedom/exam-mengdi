'use client';

import React, { useState, useRef } from 'react';
import { UploadCloud, FileSpreadsheet, AlertCircle, CheckCircle2, Save } from 'lucide-react';
import styles from './ExcelWorkspace.module.css';
import { parseExcelFile, heuristicMapHeaders } from '@/utils/excelParser';
import DataPreview from './DataPreview';
import HistoryList from './HistoryList';
import * as XLSX from 'xlsx';

export default function ExcelWorkspace() {
  const [activeTab, setActiveTab] = useState<'upload' | 'preview' | 'history'>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  
  const [data, setData] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fingerprint, setFingerprint] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [isValid, setIsValid] = useState(false);
  const [errors, setErrors] = useState<any[]>([]);
  
  const [submitProgress, setSubmitProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const handleFileSelection = async (selectedFile: File) => {
    if (!selectedFile.name.match(/\.(xlsx|xls)$/)) {
      alert('请上传 .xlsx 或 .xls 格式的 Excel 文件');
      return;
    }
    setFile(selectedFile);
    setActiveTab('preview');
    setIsProcessing(true);
    
    try {
      const result = await parseExcelFile(selectedFile);
      
      // Check DB for mapping fingerprint (Mocking API call for now)
      try {
        const res = await fetch(`/api/mappings?fingerprint=${encodeURIComponent(result.fingerprint)}`);
        const dbMapping = await res.json();
        if (dbMapping && dbMapping.mapping) {
          setMapping(JSON.parse(dbMapping.mapping));
        } else {
          setMapping(heuristicMapHeaders(result.headers));
        }
      } catch (e) {
        setMapping(heuristicMapHeaders(result.headers));
      }
      
      setFingerprint(result.fingerprint);
      setData(result.data);
    } catch (err: any) {
      alert(`解析失败: ${err.message}`);
      setActiveTab('upload');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = async () => {
    if (!isValid) {
      alert('存在校验错误，请先修改标红的数据。');
      return;
    }
    if (data.length === 0) {
      alert('没有可提交的数据。');
      return;
    }

    setIsSubmitting(true);
    setSubmitProgress(0);
    
    // Chunking logic for 1000+ rows
    const chunkSize = 200;
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      
      // Transform mapped data to system fields
      const payload = chunk.map(row => {
        return {
          externalCode: mapping.externalCode ? String(row[mapping.externalCode] || '') : null,
          senderName: String(row[mapping.senderName] || ''),
          senderPhone: String(row[mapping.senderPhone] || ''),
          senderAddress: String(row[mapping.senderAddress] || ''),
          receiverName: String(row[mapping.receiverName] || ''),
          receiverPhone: String(row[mapping.receiverPhone] || ''),
          receiverAddress: String(row[mapping.receiverAddress] || ''),
          weight: parseFloat(row[mapping.weight]),
          count: parseInt(row[mapping.count]),
          tempZone: String(row[mapping.tempZone] || ''),
          remark: mapping.remark ? String(row[mapping.remark] || '') : null,
        };
      });

      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        
        if (res.ok) {
          successCount += chunk.length;
        } else {
          failCount += chunk.length;
        }
      } catch (err) {
        failCount += chunk.length;
      }
      
      setSubmitProgress(Math.round(((i + chunk.length) / data.length) * 100));
    }
    
    // Save mapping if successful
    if (successCount > 0) {
      await fetch('/api/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint, mapping: JSON.stringify(mapping) }),
      });
    }

    setIsSubmitting(false);
    alert(`提交完成！成功：${successCount}条，失败：${failCount}条`);
    if (successCount > 0) setActiveTab('history');
  };

  const handleExport = () => {
    // Generate an array of arrays for export
    const headers = Object.values(mapping);
    const exportData = [headers];
    
    data.forEach(row => {
      const rowArr = headers.map(h => row[h] || '');
      exportData.push(rowArr);
    });

    const ws = XLSX.utils.aoa_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ModifiedData");
    XLSX.writeFile(wb, `Modified_Export_${Date.now()}.xlsx`);
  };

  return (
    <div className={styles.workspace}>
      <div className={styles.header}>
        <div className={styles.title}>
          <FileSpreadsheet size={28} />
          <h1>智能物流订单导入系统</h1>
        </div>
        <div className={styles.tabs}>
          <button 
            className={`${styles.tab} ${activeTab === 'upload' || activeTab === 'preview' ? styles.active : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            订单导入
          </button>
          <button 
            className={`${styles.tab} ${activeTab === 'history' ? styles.active : ''}`}
            onClick={() => setActiveTab('history')}
          >
            历史运单
          </button>
        </div>
      </div>

      <div className={styles.content}>
        {activeTab === 'upload' && (
          <div 
            className={`${styles.uploadZone} glass-panel ${isDragging ? styles.dragActive : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              className={styles.hiddenInput} 
              accept=".xlsx, .xls"
              onChange={handleFileChange}
            />
            <UploadCloud className={styles.uploadIcon} />
            <h2>点击或拖拽 Excel 文件到此处</h2>
            <p>支持多种模板格式，自动识别与智能映射</p>
          </div>
        )}

        {activeTab === 'preview' && (
          <div className={`${styles.previewContainer} glass-panel animate-fade-in`}>
            <div className={styles.previewHeader}>
              <div>
                <h2>数据预览与校验</h2>
                <p className={styles.subtitle}>
                  共 {data.length} 条数据
                  {!isValid && <span style={{color: 'var(--error)', marginLeft: '1rem'}}>发现 {errors.length} 处错误，请在表格内修正</span>}
                </p>
              </div>
              <div className={styles.actions}>
                <button className={styles.btnSecondary} onClick={handleExport}>导出为 Excel</button>
                <button className={styles.btnSecondary} onClick={() => setActiveTab('upload')}>重新上传</button>
                <button className={styles.btnPrimary} onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? '提交中...' : (
                    <>
                      <Save size={18} />
                      确认提交
                    </>
                  )}
                </button>
              </div>
            </div>
            
            {isSubmitting && (
              <div className={styles.progressContainer}>
                <div className={styles.progressBar} style={{width: `${submitProgress}%`}}></div>
                <span>{submitProgress}%</span>
              </div>
            )}

            <div className={styles.tableWrapper}>
              {isProcessing ? (
                <div className={styles.placeholder}>
                  <div className="animate-spin"><UploadCloud size={32} /></div>
                  <p>正在解析 Excel 数据...</p>
                </div>
              ) : (
                <DataPreview 
                  data={data} 
                  mapping={mapping} 
                  onDataChange={setData} 
                  onValidationComplete={(v, errs) => { setIsValid(v); setErrors(errs); }}
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className={`${styles.historyContainer} glass-panel animate-fade-in`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2>历史运单记录</h2>
            </div>
            <HistoryList />
          </div>
        )}
      </div>
    </div>
  );
}
