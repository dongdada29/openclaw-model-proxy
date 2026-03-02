/**
 * API 层 - RESTful API 路由
 */
import { getConfig } from '../config/index.js';
import { flushBatch, getStats, getLogs, cleanupOldLogs } from '../db/repository.js';
import { getProviderList } from '../providers/index.js';

/**
 * 处理 API 请求
 */
export function handleApiRequest(req, res) {
  const config = getConfig();
  const baseUrl = `http://localhost:${config.get('port')}`;
  const url = new URL(req.url, baseUrl);
  const path = url.pathname;

  // 路由表
  const routes = {
    'GET /_health': () => handleHealth(res),
    'GET /_stats': () => handleStats(url, res),
    'GET /_logs': () => handleLogs(url, res),
    'GET /_providers': () => handleProviders(res),
    'GET /_cleanup': () => handleCleanup(url, res),
    'POST /_flush': () => handleFlush(res),
  };

  const routeKey = `${req.method} ${path}`;
  const handler = routes[routeKey];

  if (handler) {
    handler();
    return true;
  }

  return false;
}

/**
 * GET /_health - 健康检查
 */
function handleHealth(res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));
}

/**
 * GET /_stats - 统计信息
 */
function handleStats(url, res) {
  const period = url.searchParams.get('period') || 'day';
  const timeFilter = buildTimeFilter(period);
  
  const stats = getStats(timeFilter);
  stats.period = period;
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(stats, null, 2));
}

/**
 * GET /_logs - 日志查询
 */
function handleLogs(url, res) {
  const limit = parseInt(url.searchParams.get('limit')) || 100;
  const offset = parseInt(url.searchParams.get('offset')) || 0;
  const provider = url.searchParams.get('provider');
  
  const logs = getLogs(limit, offset, provider);
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(logs, null, 2));
}

/**
 * GET /_providers - 供应商列表
 */
function handleProviders(res) {
  const providers = getProviderList();
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(providers, null, 2));
}

/**
 * GET /_cleanup - 清理旧数据
 */
function handleCleanup(url, res) {
  const config = getConfig();
  const days = parseInt(url.searchParams.get('days')) || config.get('retentionDays');
  
  const result = cleanupOldLogs(days);
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result, null, 2));
}

/**
 * POST /_flush - 手动刷新批量写入
 */
function handleFlush(res) {
  const result = flushBatch();
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result, null, 2));
}

/**
 * 构建时间过滤 SQL
 */
function buildTimeFilter(period) {
  const filters = {
    hour: `AND timestamp > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 hour')`,
    day: `AND timestamp > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day')`,
    week: `AND timestamp > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')`,
    month: `AND timestamp > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days')`,
  };
  return filters[period] || filters.day;
}
