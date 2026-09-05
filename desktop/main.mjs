import { desktopText } from './language.mjs';
import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  Notification,
  dialog,
  shell,
  nativeImage,
  session,
} from 'electron';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DesktopService,
  localNavigation,
  notificationTransitions,
  readJson,
  readResponses,
} from './runtime.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const home = process.env.PRAXIS_HOME || path.join(homedir(), '.praxis');
const config = await readJson(path.join(home, 'desktop/config.json'));
let language = (await readJson(path.join(home, 'settings.json'), {})).language;
const t = (text) => desktopText(language, text);
let menuState = '';
let window;
let tray;
let service;
let origin;
let timer;
let polling = false;
let quitting = false;
let quitRequested = false;
let initialized = false;
let states = new Map();
let responses = [];
let notificationsEnabled = true;
let connection = 'Starting';
let lastUrl;
const notifications = new Set();

app.setName('Praxis');
app.setPath('userData', path.join(home, 'desktop/browser'));
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  app.on('second-instance', () => {
    if (origin) void openWindow();
  });
  app.on('activate', () => {
    if (origin) void openWindow();
  });
  app.on('window-all-closed', () => {});
  app.on('before-quit', (event) => {
    if (!quitting) {
      event.preventDefault();
      void quitDesktop();
    }
  });
  void app.whenReady().then(async () => {
    try {
      if (
        !config ||
        !path.isAbsolute(config.root) ||
        !path.isAbsolute(config.node) ||
        !Number.isInteger(config.port) ||
        config.port < 1 ||
        config.port > 65535 ||
        !['dev', 'start'].includes(config.mode)
      ) {
        throw new Error(
          'Run npm run desktop from the Praxis repository to configure this local app.',
        );
      }
      origin = `http://localhost:${config.port}`;
      service = new DesktopService(config, home);
      session.defaultSession.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      const icon = nativeImage
        .createFromPath(path.join(directory, 'tray.png'))
        .resize({ width: 18, height: 18 });
      icon.setTemplateImage(process.platform === 'darwin');
      tray = new Tray(icon);
      tray.setToolTip('Praxis');
      tray.on('double-click', () => void openWindow());
      updateMenu();
      connection =
        (await service.start()) === 'started'
          ? 'Desktop-managed service'
          : 'Connected to existing service';
      await pollResponses();
      await openWindow();
      timer = setInterval(() => void pollResponses(), 2_000);
      updateMenu();
    } catch (error) {
      dialog.showErrorBox(t('Praxis could not start'), error.message);
      try {
        await service?.stop();
      } catch (stopError) {
        console.error(stopError);
      }
      app.exit(1);
    }
  });
}

async function openWindow(target = lastUrl || origin, separate = false) {
  const url = localNavigation(target, origin);
  if (!url) return;
  if (!separate && window && !window.isDestroyed()) {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    if (target !== window.webContents.getURL()) await window.loadURL(url);
    return;
  }
  const created = new BrowserWindow({
    title: 'Praxis',
    width: 1440,
    height: 960,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#171717',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
    },
  });
  if (!separate) window = created;
  created.once('ready-to-show', () => created.show());
  created.on('closed', () => {
    if (window === created) window = null;
  });
  created.webContents.on('did-navigate', (_event, url) => {
    if (!separate) lastUrl = localNavigation(url, origin) || lastUrl;
  });
  created.webContents.on('did-navigate-in-page', (_event, url) => {
    if (!separate) lastUrl = localNavigation(url, origin) || lastUrl;
  });
  created.webContents.on('will-navigate', (event, url) => {
    if (!localNavigation(url, origin)) {
      event.preventDefault();
      void openExternal(url);
    }
  });
  created.webContents.on('will-redirect', (event, url) => {
    if (!localNavigation(url, origin)) event.preventDefault();
  });
  created.webContents.setWindowOpenHandler(({ url }) => {
    if (localNavigation(url, origin)) void openWindow(url, true);
    else void openExternal(url);
    return { action: 'deny' };
  });
  await created.loadURL(url);
}

async function openExternal(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password)
      await shell.openExternal(url.href);
  } catch (error) {
    console.error(error);
  }
}

async function pollResponses() {
  if (polling) return;
  polling = true;
  try {
    responses = await readResponses(home);
    language = (await readJson(path.join(home, 'settings.json'), {})).language;
    const changes = notificationTransitions(states, responses, initialized);
    states = changes.next;
    initialized = true;
    for (const response of changes.notifications) {
      if (!notificationsEnabled || !Notification.isSupported()) continue;
      const notification = new Notification({
        title: `${response.projectName} · ${t(response.title)}`,
        body: (response.detail || response.subject?.label || '').slice(0, 350),
      });
      notifications.add(notification);
      notification.on(
        'click',
        () => void openWindow(response.logUrlPath, true),
      );
      notification.on('close', () => notifications.delete(notification));
      notification.on('failed', (_event, error) => {
        notifications.delete(notification);
        console.error(error);
      });
      notification.show();
    }
    updateMenu();
  } catch (error) {
    console.error('Unable to read task status:', error.message);
    tray?.setToolTip(`Praxis — ${t('task status unavailable')}`);
  } finally {
    polling = false;
  }
}

function updateMenu() {
  if (!tray) return;
  const active = responses.filter(
    (response) => response.status === 'running',
  ).length;
  const signature = JSON.stringify([
    active,
    connection,
    notificationsEnabled,
    language,
  ]);
  if (signature === menuState) return;
  menuState = signature;
  const template = [
    { label: t('Open Praxis'), click: () => void openWindow() },
    { label: `${t(connection)} · ${active} ${t('running')}`, enabled: false },
    { type: 'separator' },
    {
      label: t('Task notifications'),
      type: 'checkbox',
      checked: notificationsEnabled,
      click: (item) => {
        notificationsEnabled = item.checked;
      },
    },
    {
      label: t('Open in browser'),
      click: () => void shell.openExternal(origin),
    },
    { type: 'separator' },
    {
      label: service?.owned
        ? t('Stop service and quit Praxis')
        : t('Quit Praxis (keep existing service)'),
      click: () => void quitDesktop(),
    },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
  tray.setToolTip(`Praxis · ${active} ${t('running')}`);
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Praxis',
        submenu: [
          template[0],
          { type: 'separator' },
          {
            label: t('Quit Praxis'),
            accelerator: 'CmdOrCtrl+Q',
            click: () => void quitDesktop(),
          },
        ],
      },
      { role: 'editMenu' },
      {
        label: t('View'),
        submenu: [
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { role: 'togglefullscreen' },
        ],
      },
      { role: 'windowMenu' },
    ]),
  );
}

async function quitDesktop() {
  if (quitRequested) return;
  quitRequested = true;
  try {
    if (service?.owned) {
      const current = await readResponses(home);
      if (current.some((response) => response.status === 'running')) {
        await dialog.showMessageBox({
          type: 'info',
          title: t('Praxis is still working'),
          message: t(
            'Tasks are still running. Finish or cancel them in Praxis before stopping the service.',
          ),
          buttons: [t('Keep running')],
        });
        return;
      }
      await service.stop();
    }
    clearInterval(timer);
    quitting = true;
    app.quit();
  } catch (error) {
    dialog.showErrorBox(t('Praxis was not stopped'), error.message);
  } finally {
    quitRequested = false;
  }
}
