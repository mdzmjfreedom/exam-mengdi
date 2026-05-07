import React, { useState, useEffect } from 'react';
import styles from './DataPreview.module.css'; // Reusing table styles

export default function HistoryList() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const take = 20;

  const fetchOrders = async (resetPage = false) => {
    setLoading(true);
    const currentPage = resetPage ? 0 : page;
    if (resetPage) setPage(0);
    
    try {
      const res = await fetch(`/api/orders?skip=${currentPage * take}&take=${take}&search=${encodeURIComponent(search)}`);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem' }}>
        <input 
          type="text" 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
          placeholder="搜索外部单号或收件人..."
          style={{ padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '4px', width: '300px' }}
        />
        <button 
          type="submit" 
          style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          搜索
        </button>
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
                <th>导入时间</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan={8} style={{textAlign: 'center'}}>暂无数据</td></tr>
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
                    <td>{new Date(order.createdAt).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--text-secondary)' }}>共 {total} 条记录</span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            disabled={page === 0} 
            onClick={() => setPage(p => p - 1)}
            style={{ padding: '0.5rem 1rem', border: '1px solid var(--border-color)', background: 'white', borderRadius: '4px', cursor: page === 0 ? 'not-allowed' : 'pointer' }}
          >
            上一页
          </button>
          <span style={{ padding: '0.5rem' }}>第 {page + 1} 页</span>
          <button 
            disabled={(page + 1) * take >= total} 
            onClick={() => setPage(p => p + 1)}
            style={{ padding: '0.5rem 1rem', border: '1px solid var(--border-color)', background: 'white', borderRadius: '4px', cursor: (page + 1) * take >= total ? 'not-allowed' : 'pointer' }}
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
