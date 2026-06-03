const fs = require('fs');
const path = require('path');

const FILE_CATEGORIES = {
  Images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico'],
  Documents: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp', '.md', '.txt', '.rtf', '.csv'],
  Archives: ['.zip', '.tar', '.gz', '.bz2', '.7z', '.rar', '.tgz'],
  Code: ['.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.swift', '.kt', '.scala', '.php', '.sh', '.bash', '.zsh'],
  Config: ['.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.env', '.xml'],
  Web: ['.html', '.htm', '.css', '.scss', '.sass', '.less'],
  Executables: ['.exe', '.msi', '.appimage', '.deb', '.rpm', '.dmg'],
  Videos: ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'],
  Audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma'],
};

async function main(args) {
  const { directory, dryRun } = args || {};

  if (!directory) {
    return { error: 'Missing required field: directory' };
  }

  console.log(`[file-organizer] Organizing ${directory}${dryRun ? ' (dry run)' : ''}`);

  try {
    const dirPath = path.resolve(directory);
    if (!fs.existsSync(dirPath)) {
      return { error: `Directory not found: ${dirPath}` };
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = entries.filter(e => e.isFile());

    if (files.length === 0) {
      return { result: 'No files found to organize.' };
    }

    const summary = [];
    const uncategorized = [];

    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      const category = Object.entries(FILE_CATEGORIES).find(([, exts]) => exts.includes(ext));
      const folder = category ? category[0] : 'Other';

      if (!category) {
        uncategorized.push(file.name);
      }

      const targetDir = path.join(dirPath, folder);
      const targetPath = path.join(targetDir, file.name);

      if (!dryRun) {
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        const sourcePath = path.join(dirPath, file.name);
        fs.renameSync(sourcePath, targetPath);
      }

      summary.push({ file: file.name, category: folder, moved: !dryRun });
    }

    const result = {
      result: dryRun ? 'Dry run complete' : 'Files organized',
      totalFiles: files.length,
      categories: [...new Set(summary.map(s => s.category))],
      summary,
    };

    if (uncategorized.length > 0) {
      result.uncategorized = uncategorized;
    }

    console.log(`[file-organizer] Organized ${files.length} files into ${result.categories.length} categories`);
    return result;
  } catch (err) {
    console.error('[file-organizer] Error:', err.message);
    return { error: err.message };
  }
}

module.exports = { main };
