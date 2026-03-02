/**
 * 数据仓库层 - 日志 CRUD 操作
 * 
 * 特性：
 *   - 批量写入（带并发锁）
 *   - 预编译语句
 *   - 错误重试
 *   - 查询缓存
 */
import { Mutex } from 'async-mutex';
import { getDatabase } from './index.js';
import { getConfig } from '../config/index.js';
import { getStatsCache, getLogsCache, invalidateStatsCache, invalidateLogsCache } from './cache.js';

// 并发锁
const mutex = new Mutex();

// 预编译语句缓存
let statements = null;

// 批量写入缓冲区
let batchBuffer = [];

function getStatements() {
  if (!statements) {
    const db = getDatabase();
    statements = {
      insertRequest: db.prepare(`
        INSERT INTO requests (timestamp, provider, model, method, path, status, duration_ms, is_streaming, input_tokens, output_tokens)
        VALUES (@timestamp, @provider, @model, @method, @path, @status, @durationMs, @isStreaming, @inputTokens, @outputTokens)
      `),
      insertDetail: db.prepare(`
        INSERT INTO request_details (request_id, messages, system, tools, has_images)
        VALUES (@requestId, @messages, @system, @tools, @hasImages)
      `),
      countRequests: db.prepare(`SELECT COUNT(*) as count FROM requests WHERE 1=1`),
      countByProvider: db.prepare(`SELECT provider, COUNT(*) as count, SUM(input_tokens) as input, SUM(output_tokens) as output FROM requests WHERE 1=1 GROUP BY provider`),
      countByModel: db.prepare(`SELECT model, COUNT(*) as count FROM requests WHERE model IS NOT NULL GROUP BY model ORDER BY count DESC LIMIT 10`),
      getLogsWithDetails: db.prepare(`
        SELECT r.*, d.messages, d.system, d.tools 
        FROM requests r 
        LEFT JOIN request_details d ON r.id = d.request_id 
        ORDER BY r.timestamp DESC 
        LIMIT ? OFFSET ?
      `),
      getLogsByProvider: db.prepare(`
        SELECT r.*, d.messages, d.system, d.tools 
        FROM requests r 
        LEFT JOIN request_details d ON r.id = d.request_id 
        WHERE r.provider = ?
        ORDER BY r.timestamp DESC 
        LIMIT ? OFFSET ?
      `),
      deleteOldDetails: db.prepare(`DELETE FROM request_details WHERE request_id IN (SELECT id FROM requests WHERE timestamp < ?)`),
      deleteOldRequests: db.prepare(`DELETE FROM requests WHERE timestamp < ?`),
    };
  }
  return statements;
}

/**
 * 添加日志到批量队列（线程安全）
 */
export async function addLogToBatch(data) {
  return await mutex.runExclusive(() => {
    batchBuffer.push(data);
    
    const config = getConfig();
    if (batchBuffer.length >= config.get('batchSize')) {
      return flushBatchSync();
    }
    return { queued: true, pending: batchBuffer.length };
  });
}

/**
 * 执行批量写入（同步版本，内部使用）
 */
function flushBatchSync() {
  if (batchBuffer.length === 0) return { flushed: 0 };
  
  const batch = [...batchBuffer];
  const db = getDatabase();
  const stmts = getStatements();
  
  try {
    const insertMany = db.transaction((items) => {
      for (const item of items) {
        const result = stmts.insertRequest.run({
          timestamp: item.timestamp,
          provider: item.provider,
          model: item.model || null,
          method: item.method || null,
          path: item.path || null,
          status: item.status || null,
          durationMs: item.durationMs || null,
          isStreaming: item.isStreaming ? 1 : 0,
          inputTokens: item.usage?.input_tokens || item.usage?.prompt_tokens || 0,
          outputTokens: item.usage?.output_tokens || item.usage?.completion_tokens || 0,
        });
        
        if (item.details) {
          stmts.insertDetail.run({
            requestId: result.lastInsertRowid,
            messages: item.details.messages || null,
            system: item.details.system || null,
            tools: item.details.tools || null,
            hasImages: item.details.hasImages ? 1 : 0,
          });
        }
      }
    });
    
    insertMany(batch);
    batchBuffer = [];  // 成功后清空
    
    // 使缓存失效（新数据已写入）
    invalidateStatsCache();
    invalidateLogsCache();
    
    return { flushed: batch.length };
  } catch (e) {
    console.error('Batch insert error:', e.message);
    console.error(e.stack);
    // 保留数据，下次重试
    return { error: e.message, pending: batchBuffer.length };
  }
}

/**
 * 执行批量写入（异步版本，外部调用）
 */
export async function flushBatch() {
  return await mutex.runExclusive(() => flushBatchSync());
}

/**
 * 获取统计信息（带缓存）
 */
export function getStats(timeFilter = '') {
  const cache = getStatsCache();
  const cacheKey = `stats:${timeFilter || 'all'}`;
  
  // 尝试从缓存获取
  const cached = cache.get(cacheKey);
  if (cached !== null) {
    return cached;
  }
  
  const db = getDatabase();
  
  // 动态构建带时间过滤的查询
  const countSql = `SELECT COUNT(*) as count FROM requests WHERE 1=1 ${timeFilter}`;
  const providerSql = `SELECT provider, COUNT(*) as count, SUM(input_tokens) as input, SUM(output_tokens) as output FROM requests WHERE 1=1 ${timeFilter} GROUP BY provider`;
  const modelSql = `SELECT model, COUNT(*) as count FROM requests WHERE model IS NOT NULL ${timeFilter} GROUP BY model ORDER BY count DESC LIMIT 10`;
  
  const stats = {
    totalRequests: db.prepare(countSql).get().count,
    byProvider: {},
    byModel: {},
    totalTokens: { input: 0, output: 0 },
  };
  
  db.prepare(providerSql).all().forEach(row => {
    stats.byProvider[row.provider] = { 
      requests: row.count, 
      inputTokens: row.input || 0, 
      outputTokens: row.output || 0 
    };
    stats.totalTokens.input += row.input || 0;
    stats.totalTokens.output += row.output || 0;
  });
  
  db.prepare(modelSql).all().forEach(row => {
    stats.byModel[row.model] = row.count;
  });
  
  // 存入缓存
  cache.set(cacheKey, stats);
  
  return stats;
}

/**
 * 获取日志列表（带缓存）
 */
export function getLogs(limit = 100, offset = 0, provider = null) {
  const cache = getLogsCache();
  const cacheKey = `logs:${limit}:${offset}:${provider || 'all'}`;
  
  // 尝试从缓存获取
  const cached = cache.get(cacheKey);
  if (cached !== null) {
    return cached;
  }
  
  const stmt = provider 
    ? getStatements().getLogsByProvider 
    : getStatements().getLogsWithDetails;
  
  const params = provider 
    ? [provider, limit, offset] 
    : [limit, offset];
  
  const logs = stmt.all(...params).map(row => ({
    id: row.id,
    timestamp: row.timestamp,
    provider: row.provider,
    model: row.model,
    status: row.status,
    durationMs: row.duration_ms,
    isStreaming: !!row.is_streaming,
    tokens: { input: row.input_tokens, output: row.output_tokens },
    details: row.messages ? {
      messages: JSON.parse(row.messages),
      system: row.system,
      tools: row.tools ? JSON.parse(row.tools) : [],
    } : null,
  }));
  
  // 存入缓存
  cache.set(cacheKey, logs);
  
  return logs;
}

/**
 * 清理旧数据
 */
export function cleanupOldLogs(days = null) {
  const config = getConfig();
  days = days || config.get('retentionDays');
  
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const stmts = getStatements();
  const db = getDatabase();
  
  stmts.deleteOldDetails.run(cutoff);
  const result = stmts.deleteOldRequests.run(cutoff);
  db.pragma('optimize');
  
  return { deleted: result.changes, cutoff };
}

/**
 * 获取待处理的缓冲区大小（用于监控）
 */
export function getPendingCount() {
  return batchBuffer.length;
}
