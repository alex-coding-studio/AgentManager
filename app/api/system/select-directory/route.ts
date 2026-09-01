import { execFile } from 'node:child_process';
import { guardRequest } from '@/lib/request-boundary';
import { promisify } from 'node:util';

export const runtime = 'nodejs';

const execute = promisify(execFile);

export async function POST(request: Request) {
  const denied = guardRequest(request);
  if (denied) return denied;
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await execute('osascript', [
        '-e',
        'POSIX path of (choose folder with prompt "Choose a project directory")',
      ]);
      return Response.json({ path: stdout.trim().replace(/\/$/, '') });
    }

    if (process.platform === 'linux') {
      const { stdout } = await execute('zenity', [
        '--file-selection',
        '--directory',
        '--title=Choose a project directory',
      ]);
      return Response.json({ path: stdout.trim() });
    }

    if (process.platform === 'win32') {
      const script = [
        'Add-Type -AssemblyName System.Windows.Forms',
        '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
        '$dialog.Description = "Choose a project directory"',
        'if ($dialog.ShowDialog() -eq "OK") { $dialog.SelectedPath }',
      ].join('; ');
      const { stdout } = await execute('powershell.exe', [
        '-NoProfile',
        '-Command',
        script,
      ]);
      return Response.json({ path: stdout.trim() });
    }

    return Response.json(
      { error: 'The native folder picker is unavailable on this platform.' },
      { status: 501 },
    );
  } catch (error) {
    const cancelled =
      error instanceof Error &&
      ('code' in error || error.message.toLowerCase().includes('cancel'));
    return Response.json(
      {
        error: cancelled
          ? 'Folder selection was cancelled.'
          : 'Could not open the folder picker.',
      },
      { status: 400 },
    );
  }
}
