const chinese = {
  'Open Praxis': '打开 Praxis',
  Starting: '正在启动',
  'Desktop-managed service': '桌面端管理的服务',
  'Connected to existing service': '已连接现有服务',
  running: '运行中',
  'Task notifications': '任务通知',
  'Open in browser': '在浏览器中打开',
  'Stop service and quit Praxis': '停止服务并退出 Praxis',
  'Quit Praxis (keep existing service)': '退出 Praxis（保留现有服务）',
  'Quit Praxis': '退出 Praxis',
  View: '显示',
  'Praxis is still working': 'Praxis 仍在运行任务',
  'Tasks are still running. Finish or cancel them in Praxis before stopping the service.':
    '仍有任务正在运行。请先在 Praxis 中完成或取消任务，再停止服务。',
  'Keep running': '保持运行',
  'Praxis was not stopped': '未停止 Praxis',
  'Praxis could not start': '无法启动 Praxis',
  'task status unavailable': '暂时无法读取任务状态',
  Delivered: '已完成',
  Completed: '已完成',
  Failed: '失败',
  Blocked: '受阻',
  'Decision needed': '需要确认',
};

export function desktopText(language, text) {
  return language === 'zh-CN' ? (chinese[text] ?? text) : text;
}
