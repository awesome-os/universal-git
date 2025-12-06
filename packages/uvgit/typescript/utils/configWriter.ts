/**
 * Config Writing Utilities
 * High-level utilities for writing Git configuration
 */
import type { GitDir } from '../GitDir.ts';
import type { FileSystemFileHandle } from '@awesome-os/native-file-system-adapter-src';

/**
 * Adds a remote configuration
 */
export async function addRemote(
  gitDir: GitDir,
  name: string,
  url: string,
  fetch?: string
): Promise<void> {
  const handle = await gitDir.resolve('config');
  if (!handle || handle.kind !== 'file') {
    throw new Error('Cannot write config: config file not found');
  }

  const file = await (handle as FileSystemFileHandle).getFile();
  let content = await file.text();

  // Check if remote already exists
  const remoteSection = `[remote "${name}"]`;
  if (content.includes(remoteSection)) {
    // Update existing remote
    const lines = content.split('\n');
    const startIndex = lines.findIndex((line) => line.trim() === remoteSection);
    if (startIndex === -1) {
      throw new Error(`Remote ${name} section found but malformed`);
    }

    // Find end of section
    let endIndex = startIndex + 1;
    while (endIndex < lines.length && !lines[endIndex].trim().startsWith('[')) {
      endIndex++;
    }

    // Replace section
    const newLines = [
      remoteSection,
      `\turl = ${url}`,
    ];
    if (fetch) {
      newLines.push(`\tfetch = ${fetch}`);
    }

    const updatedLines = [
      ...lines.slice(0, startIndex),
      ...newLines,
      ...lines.slice(endIndex),
    ];
    content = updatedLines.join('\n');
  } else {
    // Add new remote
    const newSection = [
      '',
      remoteSection,
      `\turl = ${url}`,
    ];
    if (fetch) {
      newSection.push(`\tfetch = ${fetch}`);
    }
    content += '\n' + newSection.join('\n') + '\n';
  }

  // Write updated config
  const writable = await (handle as FileSystemFileHandle).createWritable();
  try {
    const encoder = new TextEncoder();
    await writable.write(encoder.encode(content));
  } finally {
    await writable.close();
  }
}

/**
 * Sets a config value
 */
export async function setConfig(
  gitDir: GitDir,
  section: string,
  key: string,
  value: string
): Promise<void> {
  const handle = await gitDir.resolve('config');
  if (!handle || handle.kind !== 'file') {
    throw new Error('Cannot write config: config file not found');
  }

  const file = await (handle as FileSystemFileHandle).getFile();
  let content = await file.text();

  const sectionHeader = `[${section}]`;
  const lines = content.split('\n');
  const sectionIndex = lines.findIndex((line) => line.trim() === sectionHeader);

  if (sectionIndex === -1) {
    // Add new section
    content += `\n${sectionHeader}\n\t${key} = ${value}\n`;
  } else {
    // Update existing section
    let keyIndex = sectionIndex + 1;
    while (keyIndex < lines.length && !lines[keyIndex].trim().startsWith('[')) {
      if (lines[keyIndex].trim().startsWith(key)) {
        // Update existing key
        lines[keyIndex] = `\t${key} = ${value}`;
        content = lines.join('\n');
        break;
      }
      keyIndex++;
    }

    if (keyIndex >= lines.length || lines[keyIndex].trim().startsWith('[')) {
      // Key not found, add it
      lines.splice(keyIndex, 0, `\t${key} = ${value}`);
      content = lines.join('\n');
    }
  }

  // Write updated config
  const writable = await (handle as FileSystemFileHandle).createWritable();
  try {
    const encoder = new TextEncoder();
    await writable.write(encoder.encode(content));
  } finally {
    await writable.close();
  }
}
