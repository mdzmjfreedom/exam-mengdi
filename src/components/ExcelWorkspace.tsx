'use client';

import React, { useState, useRef, useCallback } from 'react';
import { UploadCloud, FileSpreadsheet, Save, Download, Plus, AlertTriangle, CheckCircle2 } from 'lucide-react';
import styles from './ExcelWorkspace.module.css';
import { parseExcelFile, heuristicMapHeaders, getMappingConfidence, SYSTEM_FIELDS } from '@/utils/excelParser';
import DataPreview from './DataPreview';
import HistoryList from './HistoryList';
import MappingModal from './MappingModal';
import * as XLSX from 'xlsx';

export default function ExcelWorkspace() {
  const [activeTab, setActiveTab] = useState<'upload' | 'preview' | 'history'>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const [data, setData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fingerprint, setFingerprint] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [parseProgress, setParseProgress] = useState({ pct: 0, current: 0, total: 0 });

  const [isValid, setIsValid] = useState(false);
  const [errors, setErrors] = useState<any[]>([]);

  const [submitProgress, setSubmitProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: number; fail: number } | null>(null);

  // Mapping modal state
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [pendingParseResult, setPendingParseResult] = useState<any>(null);

  // Toast state
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'warning'; msg: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (type: 'success' | 'error' | 'warning', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

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
    if (!selectedFile.name.match(/\.(xlsx|xls)$/i)) {
      showToast('error', '请上传 .xlsx 或 .xls 格式的 Excel 文件');
      return;
    }

    // Check file size (warn for very large files)
    if (selectedFile.size > 50 * 1024 * 1024) {
      showToast('warning', '文件较大，解析可能需要一些时间...');
    }

    setFile(selectedFile);
    setIsProcessing(true);
    setParseProgress({ pct: 0, current: 0, total: 0 });
    setSubmitResult(null);

    try {
      const result = await parseExcelFile(selectedFile, (pct, current, total) => {
        setParseProgress({ pct, current, total });
      });

      // Try to fetch saved mapping from DB first
      let savedMapping: Record<string, string> | null = null;
      try {
        const res = await fetch(`/api/mappings?fingerprint=${encodeURIComponent(result.fingerprint)}`);
        const dbMapping = await res.json();
        if (dbMapping && dbMapping.mapping) {
          savedMapping = JSON.parse(dbMapping.mapping);
        }
      } catch (e) {
        // Ignore, will fall back to heuristic
      }

      const autoMapping = savedMapping || heuristicMapHeaders(result.headers);
      const confidence = getMappingConfidence(autoMapping);

      setHeaders(result.headers);
      setFingerprint(result.fingerprint);

      if (confidence.score < 0.7) {
        // Low confidence — show mapping modal for manual mapping
        setPendingParseResult(result);
        setMapping(autoMapping);
        setShowMappingModal(true);
        setIsProcessing(false);
      } else {
        // High confidence — auto map and go to preview
        setMapping(autoMapping);
        setData(result.data);
        setIsProcessing(false);
        setActiveTab('preview');
        if (savedMapping) {
          showToast('success', `已自动应用已记忆的模板映射规则（${confidence.mapped}/${confidence.total} 个必填字段已匹配）`);
        } else {
          showToast('success', `智能识别完成：${confidence.mapped}/${confidence.total} 个必填字段已自动匹配`);
        }
      }
    } catch (err: any) {
      showToast('error', `解析失败: ${err.message}`);
      setIsProcessing(false);
    }
  };

  const handleMappingConfirm = async (confirmedMapping: Record<string, string>) => {
    setShowMappingModal(false);
    setMapping(confirmedMapping);
    if (pendingParseResult) {
      setData(pendingParseResult.data);
      setPendingParseResult(null);
    }
    setActiveTab('preview');

    // Save mapping to DB for future use (template learning)
    try {
      await fetch('/api/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint, mapping: JSON.stringify(confirmedMapping) }),
      });
      showToast('success', '映射规则已保存，下次上传相同模板将自动识别！');
    } catch {
      // Ignore save error
    }
  };

  const handleMappingCancel = () => {
    setShowMappingModal(false);
    setPendingParseResult(null);
    setIsProcessing(false);
  };

  const handleAddRow = () => {
    const newRow: any = { _originalRowIndex: data.length > 0 ? Math.max(...data.map(r => r._originalRowIndex)) + 1 : 1 };
    headers.forEach(h => { newRow[h] = ''; });
    setData([...data, newRow]);
  };

  const handleSubmit = async () => {
    if (!isValid) {
      showToast('error', `存在 ${errors.length} 处校验错误，请先修正标红的数据后再提交`);
      return;
    }
    if (data.length === 0) {
      showToast('warning', '没有可提交的数据');
      return;
    }

    setIsSubmitting(true);
    setSubmitProgress(0);

    const chunkSize = 200;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);

      const payload = chunk.map(row => ({
        externalCode: mapping.externalCode ? String(row[mapping.externalCode] || '').trim() || null : null,
        senderName: String(row[mapping.senderName] || ''),
        senderPhone: String(row[mapping.senderPhone] || ''),
        senderAddress: String(row[mapping.senderAddress] || ''),
        receiverName: String(row[mapping.receiverName] || ''),
        receiverPhone: String(row[mapping.receiverPhone] || ''),
        receiverAddress: String(row[mapping.receiverAddress] || ''),
        weight: parseFloat(row[mapping.weight]) || 0,
        count: parseInt(row[mapping.count]) || 0,
        tempZone: String(row[mapping.tempZone] || ''),
        remark: mapping.remark ? String(row[mapping.remark] || '') || null : null,
      }));

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
      } catch {
        failCount += chunk.length;
      }

      setSubmitProgress(Math.round(((i + chunk.length) / data.length) * 100));
    }

    // Save mapping
    if (successCount > 0 && fingerprint) {
      try {
        await fetch('/api/mappings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fingerprint, mapping: JSON.stringify(mapping) }),
        });
      } catch { /* ignore */ }
    }

    setIsSubmitting(false);
    setSubmitResult({ success: successCount, fail: failCount });
    if (failCount === 0) {
      showToast('success', `全部提交成功！共 ${successCount} 条`);
    } else {
      showToast('warning', `提交完成：成功 ${successCount} 条，失败 ${failCount} 条`);
    }
  };

  const handleExport = () => {
    const exportHeaders = SYSTEM_FIELDS.map(f => f.label);
    const exportData = [exportHeaders];

    data.forEach(row => {
      const rowArr = SYSTEM_FIELDS.map(f => {
        const excelCol = mapping[f.key];
        return excelCol ? row[excelCol] || '' : '';
      });
      exportData.push(rowArr);
    });

    const ws = XLSX.utils.aoa_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '导出数据');
    XLSX.writeFile(wb, `订单数据导出_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('success', 'Excel 文件已导出');
  };

  const handleValidationComplete = useCallback((v: boolean, errs: any[]) => {
    setIsValid(v);
    setErrors(errs);
  }, []);

  return (
    <div className={styles.workspace}>
      {/* Toast Notification */}
      {toast && (
        <div className={`${styles.toast} ${styles['toast_' + toast.type]}`}>
          {toast.type === 'success' && <CheckCircle2 size={18} />}
          {toast.type === 'error' && <AlertTriangle size={18} />}
          {toast.type === 'warning' && <AlertTriangle size={18} />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Mapping Modal */}
      <MappingModal
        isOpen={showMappingModal}
        excelHeaders={headers}
        initialMapping={mapping}
        onConfirm={handleMappingConfirm}
        onCancel={handleMappingCancel}
      />

      <div className={styles.header}>
        <div className={styles.title}>
          <FileSpreadsheet size={28} />
          <h1>智能物流订单导入系统</h1>
        </div>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab !== 'history' ? styles.active : ''}`}
            onClick={() => setActiveTab(data.length > 0 ? 'preview' : 'upload')}
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
            {isProcessing ? (
              <>
                <div className={styles.spinnerContainer}>
                  <div className={styles.spinner}></div>
                </div>
                <h2>正在解析 Excel 数据...</h2>
                <div className={styles.parseProgressWrap}>
                  <div className={styles.progressContainer}>
                    <div className={styles.progressBar} style={{ width: `${parseProgress.pct}%` }}></div>
                  </div>
                  <p>{parseProgress.pct}% — {parseProgress.current}/{parseProgress.total} 条</p>
                </div>
              </>
            ) : (
              <>
                <UploadCloud className={styles.uploadIcon} />
                <h2>点击或拖拽 Excel 文件到此处</h2>
                <p>支持 .xlsx / .xls 格式，自动识别多种模板，智能匹配列映射</p>
              </>
            )}
          </div>
        )}

        {activeTab === 'preview' && (
          <div className={`${styles.previewContainer} glass-panel animate-fade-in`}>
            <div className={styles.previewHeader}>
              <div>
                <h2>数据预览与校验</h2>
                <p className={styles.subtitle}>
                  共 {data.length} 条数据 · 文件: {file?.name}
                  {!isValid && (
                    <span className={styles.errorBadge}>
                      <AlertTriangle size={14} />
                      发现 {errors.length} 处错误
                    </span>
                  )}
                  {isValid && data.length > 0 && (
                    <span className={styles.successBadge}>
                      <CheckCircle2 size={14} />
                      校验通过
                    </span>
                  )}
                </p>
              </div>
              <div className={styles.actions}>
                <button className={styles.btnSecondary} onClick={handleAddRow}>
                  <Plus size={16} /> 新增行
                </button>
                <button className={styles.btnSecondary} onClick={handleExport}>
                  <Download size={16} /> 导出 Excel
                </button>
                <button className={styles.btnSecondary} onClick={() => { setActiveTab('upload'); setData([]); }}>
                  重新上传
                </button>
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
                <div className={styles.progressBar} style={{ width: `${submitProgress}%` }}></div>
                <span className={styles.progressText}>{submitProgress}%</span>
              </div>
            )}

            {submitResult && (
              <div className={styles.resultBanner}>
                提交结果：成功 <strong>{submitResult.success}</strong> 条，失败 <strong>{submitResult.fail}</strong> 条
              </div>
            )}

            {/* Error Summary Panel */}
            {!isValid && errors.length > 0 && (
              <div className={styles.errorSummary}>
                <h3><AlertTriangle size={16} /> 全部错误列表（共 {errors.length} 处）</h3>
                <div className={styles.errorList}>
                  {errors.slice(0, 50).map((err, i) => {
                    const fieldInfo = SYSTEM_FIELDS.find(f => f.key === err.fieldKey);
                    return (
                      <div key={i} className={styles.errorItem}>
                        第 {data[err.rowIndex]?._originalRowIndex || err.rowIndex + 1} 行，
                        <strong>{fieldInfo?.label || err.fieldKey}</strong>：{err.msg}
                      </div>
                    );
                  })}
                  {errors.length > 50 && <div className={styles.errorItem}>... 还有 {errors.length - 50} 处错误</div>}
                </div>
              </div>
            )}

            <div className={styles.tableWrapper}>
              <DataPreview
                data={data}
                mapping={mapping}
                onDataChange={setData}
                onValidationComplete={handleValidationComplete}
              />
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
