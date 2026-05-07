import React, { useState, useEffect } from 'react';
import styles from './DataPreview.module.css'; // Reusing table styles

export default function HistoryList() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const take = 20;

  const fetchOrders = async (resetPage = false) => {
    setLoading(true);
    const currentPage = resetPage ? 0 : page;
    if (resetPage) setPage(0);

    const params = new URLSearchParams({
      skip: String(currentPage * take),
      take: String(take),
      search,
    });
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);

    try {
      const res = await fetch(`/api/orders?${params.toString()}`);
      const data = await res.json();
      setOrders(data.data || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrders(true);
  };

  const handleReset = () => {
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setPage(0);
    setTimeout(() => fetchOrders(true), 0);
  };

  const inputStyle: React.CSSProperties = {
    padding: '0.5rem 0.75rem',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '0.9rem',
    outline: 'none',
    transition: 'border-color 0.2s',
  };

  const btnStyle: React.CSSProperties = {
    padding: '0.5rem 1rem',
    background: 'var(--primary)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.9rem',
  };

  const btnOutlineStyle: React.CSSProperties = {
    padding: '0.5rem 1rem',
    background: 'white',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.9rem',
  };

  const pageBtn = (disabled: boolean): React.CSSProperties => ({
    padding: '0.5rem 1rem',
    border: '1px solid var(--border-color)',
    background: disabled ? 'var(--border-light)' : 'white',
    borderRadius: 'var(--radius-sm)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 600,
    fontSize: '0.85rem',
    color: disabled ? 'var(--text-tertiary)' : 'var(--text-primary)',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>关键词</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="外部编码 / 收件人姓名"
            style={{ ...inputStyle, width: '220px' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>提交时间（起）</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{ ...inputStyle, width: '160px' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>提交时间（止）</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{ ...inputStyle, width: '160px' }}
          />
        </div>
        <button type="submit" style={btnStyle}>搜索</button>
        <button type="button" onClick={handleReset} style={btnOutlineStyle}>重置</button>
      </form>

      <div className={styles.tableContainer}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>加载中...</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>外部编码</th>
                <th>发件人</th>
                <th>收件人</th>
                <th>收件电话</th>
                <th>重量(kg)</th>
                <th>件数</th>
                <th>温层</th>
                <th>提交时间</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>暂无数据</td></tr>
              ) : (
                orders.map(order => (
                  <tr key={order.id}>
                    <td>{order.externalCode || '-'}</td>
                    <td>{order.senderName}</td>
                    <td>{order.receiverName}</td>
                    <td>{order.receiverPhone}</td>
                    <td>{order.weight}</td>
                    <td>{order.count}</td>
                    <td>{order.tempZone}</td>
                    <td>{new Date(order.createdAt).toLocaleString('zh-CN')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>共 {total} 条记录</span>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            style={pageBtn(page === 0)}
          >
            上一页
          </button>
          <span style={{ padding: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>第 {page + 1} 页</span>
          <button
            disabled={(page + 1) * take >= total}
            onClick={() => setPage(p => p + 1)}
            style={pageBtn((page + 1) * take >= total)}
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
