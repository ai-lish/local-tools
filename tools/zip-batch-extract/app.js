'use strict';

(function () {
  var incompleteText = '套件不完整：請先把 zip 完整解壓，再開啟 START-HERE.html';
  if (!window.JSZip) {
    var alert = document.createElement('p');
    alert.setAttribute('role', 'alert');
    alert.textContent = incompleteText;
    alert.style.cssText = 'margin:1rem;padding:1rem;border:2px solid #982d25;color:#982d25;font-weight:700';
    document.body.prepend(alert);
    return;
  }

  var fileInput = document.getElementById('zip-files');
  var dropZone = document.getElementById('drop-zone');
  var chooseButton = document.getElementById('choose-files');
  var queueElement = document.getElementById('queue');
  var queueCount = document.getElementById('queue-count');
  var totalSize = document.getElementById('total-size');
  var memoryWarning = document.getElementById('memory-warning');
  var processButton = document.getElementById('process-button');
  var statusMessage = document.getElementById('status-message');
  var progressWrap = document.getElementById('progress-wrap');
  var progressBar = document.getElementById('progress');
  var progressLabel = document.getElementById('progress-label');
  var reportPanel = document.getElementById('report-panel');
  var reportElement = document.getElementById('report');
  var downloadLink = document.getElementById('download-link');
  var queue = [];
  var nextId = 1;
  var busy = false;
  var completed = false;
  var objectUrl = '';
  var oneGiB = 1024 * 1024 * 1024;

  function setMessage(text, isError) {
    statusMessage.textContent = text || '';
    if (isError) statusMessage.setAttribute('data-error', 'true');
    else statusMessage.removeAttribute('data-error');
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    var units = ['KB', 'MB', 'GB', 'TB'];
    var value = bytes / 1024;
    var unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2) + ' ' + units[unit];
  }

  function updateSummary() {
    var bytes = queue.reduce(function (sum, item) { return sum + item.file.size; }, 0);
    totalSize.textContent = '總大小：' + formatBytes(bytes);
    queueCount.textContent = queue.length ? queue.length + ' 個 ZIP' : '尚未加入檔案';
    memoryWarning.hidden = bytes <= oneGiB;
    processButton.disabled = busy || completed || queue.length === 0;
  }

  function renderQueue() {
    queueElement.replaceChildren();
    if (!queue.length) {
      var empty = document.createElement('li');
      empty.className = 'queue-empty';
      empty.textContent = '尚未加入 ZIP 檔。';
      queueElement.appendChild(empty);
    }
    queue.forEach(function (item) {
      var row = document.createElement('li');
      row.className = 'queue-item';
      var meta = document.createElement('div');
      meta.className = 'file-meta';
      var name = document.createElement('div');
      name.className = 'file-name';
      name.textContent = item.file.name;
      var size = document.createElement('div');
      size.className = 'file-size';
      size.textContent = formatBytes(item.file.size);
      meta.append(name, size);
      var status = document.createElement('div');
      status.className = 'file-status';
      status.textContent = item.status;
      status.dataset.state = item.state || '';
      var removeButton = document.createElement('button');
      removeButton.className = 'remove-button';
      removeButton.type = 'button';
      removeButton.textContent = '移除';
      removeButton.setAttribute('aria-label', '移除 ' + item.file.name);
      removeButton.disabled = busy || completed;
      removeButton.addEventListener('click', function () {
        queue = queue.filter(function (candidate) { return candidate.id !== item.id; });
        renderQueue();
      });
      row.append(meta, status, removeButton);
      queueElement.appendChild(row);
    });
    updateSummary();
  }

  function addFiles(fileList) {
    if (busy || completed) return;
    var added = 0;
    var rejected = [];
    Array.prototype.forEach.call(fileList || [], function (file) {
      if (!/\.zip$/i.test(file.name)) {
        rejected.push(file.name);
        return;
      }
      queue.push({ id: nextId++, file: file, status: '待處理', state: 'waiting' });
      added += 1;
    });
    renderQueue();
    if (rejected.length) {
      setMessage('只接受 .zip 檔，已略過：' + rejected.join('、'), true);
    } else if (added) {
      setMessage('已加入 ' + added + ' 個 ZIP。你可以再選取或拖入其他 ZIP。');
    }
  }

  function bytesToKey(bytes) {
    var result = '';
    for (var index = 0; index < bytes.length; index += 1) result += bytes[index].toString(16).padStart(2, '0');
    return result;
  }

  function crc32(bytes) {
    var crc = 0xffffffff;
    for (var index = 0; index < bytes.length; index += 1) {
      crc ^= bytes[index];
      for (var bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function read64(view, offset) {
    var value;
    if (typeof view.getBigUint64 === 'function') value = view.getBigUint64(offset, true);
    else value = BigInt(view.getUint32(offset, true)) + (BigInt(view.getUint32(offset + 4, true)) << 32n);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('ZIP 索引超出瀏覽器可處理範圍');
    return Number(value);
  }

  function hasFileAncestor(path, files) {
    var parts = path.split('/');
    var prefix = parts[0];
    for (var index = 0; index < parts.length - 1; index += 1) {
      if (files.has(prefix)) return true;
      prefix += '/' + parts[index + 1];
    }
    return false;
  }

  function addParentDirectories(path, directories) {
    var parts = path.split('/');
    while (parts.length > 1) {
      parts.pop();
      directories.add(parts.join('/'));
    }
  }

  function decodeStrict(bytes, encoding) {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  }

  function decodeLegacyName(bytes) {
    try { return { name: decodeStrict(bytes, 'utf-8'), mode: 'UTF-8（自動判斷）' }; } catch (_) {}
    try { return { name: decodeStrict(bytes, 'big5'), mode: 'Big5' }; } catch (_) {}
    try { return { name: decodeStrict(bytes, 'gbk'), mode: 'GBK' }; } catch (_) {}
    throw new Error('ZIP 檔名無法以 UTF-8、Big5 或 GBK 解碼');
  }

  function invalidateUnicodePathExtra(view, start, length, rawName) {
    var cursor = start;
    var end = start + length;
    var unicodeName = null;
    while (cursor + 4 <= end) {
      var id = view.getUint16(cursor, true);
      var size = view.getUint16(cursor + 2, true);
      var valueStart = cursor + 4;
      if (valueStart + size > end) throw new Error('ZIP extra field 長度錯誤');
      if (id === 0x7075) {
        if (size >= 5 && view.getUint8(valueStart) === 1 &&
            view.getUint32(valueStart + 1, true) === crc32(rawName) && unicodeName === null) {
          try {
            unicodeName = decodeStrict(bytesFromView(view, valueStart + 5, size - 5), 'utf-8');
          } catch (_) {}
        }
        // The application selects the name explicitly. Hide every Unicode
        // Path field from JSZip: its CRC check uses the local raw name, which
        // may differ from the authoritative central-directory name.
        view.setUint16(cursor, 0, true);
      }
      cursor = valueStart + size;
    }
    return unicodeName;
  }

  function invalidateUnicodeCommentExtra(view, start, length, rawComment) {
    var cursor = start;
    var end = start + length;
    while (cursor + 4 <= end) {
      var id = view.getUint16(cursor, true);
      var size = view.getUint16(cursor + 2, true);
      var valueStart = cursor + 4;
      if (valueStart + size > end) throw new Error('ZIP extra field 長度錯誤');
      if (id === 0x6375 && size >= 5 && view.getUint8(valueStart) === 1 &&
          view.getUint32(valueStart + 1, true) === crc32(rawComment)) {
        view.setUint32(valueStart + 1, view.getUint32(valueStart + 1, true) ^ 1, true);
      }
      cursor = valueStart + size;
    }
  }

  function bytesFromView(view, start, length) {
    var bytes = new Uint8Array(length);
    for (var index = 0; index < length; index += 1) bytes[index] = view.getUint8(start + index);
    return bytes;
  }

  function decodeArchiveName(rawName, flags, unicodeName) {
    if (flags & 0x0800) return { name: decodeStrict(rawName, 'utf-8'), mode: 'UTF-8（旗標）' };
    if (unicodeName !== null) return { name: unicodeName, mode: 'UTF-8（Unicode Path 欄位）' };
    return decodeLegacyName(rawName);
  }

  function zip64LocalOffset(view, extraStart, extraLength, uncompressed32, compressed32) {
    var cursor = extraStart;
    var end = extraStart + extraLength;
    while (cursor + 4 <= end) {
      var id = view.getUint16(cursor, true);
      var size = view.getUint16(cursor + 2, true);
      var valueStart = cursor + 4;
      if (valueStart + size > end) throw new Error('ZIP extra field 長度錯誤');
      if (id === 0x0001) {
        var fieldOffset = valueStart;
        if (uncompressed32 === 0xffffffff) fieldOffset += 8;
        if (compressed32 === 0xffffffff) fieldOffset += 8;
        if (fieldOffset + 8 > valueStart + size) throw new Error('ZIP64 本機檔案位置不完整');
        return read64(view, fieldOffset);
      }
      cursor = valueStart + size;
    }
    throw new Error('ZIP64 本機檔案位置缺少 extra field');
  }

  function uniqueArchiveKey(index, reservedNames) {
    var candidate = '\u0000LT_ARCHIVE_ENTRY_' + index + '\u0000';
    while (reservedNames.has(candidate)) candidate += '_';
    reservedNames.add(candidate);
    return candidate;
  }

  function parseCentralNames(arrayBuffer) {
    var bytes = new Uint8Array(arrayBuffer);
    var view = new DataView(arrayBuffer);
    var searchStart = Math.max(0, bytes.length - 65557);
    var endOffset = -1;
    for (var offset = bytes.length - 22; offset >= searchStart; offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054b50 &&
          offset + 22 + view.getUint16(offset + 20, true) === bytes.length) {
        endOffset = offset;
        break;
      }
    }
    if (endOffset < 0) throw new Error('找不到 ZIP 結尾記錄');
    if (view.getUint16(endOffset + 4, true) !== 0 || view.getUint16(endOffset + 6, true) !== 0) {
      throw new Error('不支援分卷或多磁碟 ZIP');
    }
    var totalCount = view.getUint16(endOffset + 10, true);
    var centralSize = view.getUint32(endOffset + 12, true);
    var centralOffset = view.getUint32(endOffset + 16, true);
    var directoryEnd = endOffset;
    if (totalCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
      var locatorOffset = endOffset - 20;
      if (locatorOffset < 0 || view.getUint32(locatorOffset, true) !== 0x07064b50 ||
          view.getUint32(locatorOffset + 4, true) !== 0 || view.getUint32(locatorOffset + 16, true) !== 1) {
        throw new Error('ZIP64 結尾記錄不完整');
      }
      var zip64Offset = read64(view, locatorOffset + 8);
      if (zip64Offset + 56 > bytes.length || view.getUint32(zip64Offset, true) !== 0x06064b50) {
        zip64Offset = locatorOffset - 56;
      }
      if (zip64Offset < 0 || view.getUint32(zip64Offset, true) !== 0x06064b50) throw new Error('ZIP64 索引損壞');
      var zip64Size = read64(view, zip64Offset + 4);
      if (zip64Offset + 12 + zip64Size !== locatorOffset) throw new Error('ZIP64 結尾長度錯誤');
      if (view.getUint32(zip64Offset + 16, true) !== 0 || view.getUint32(zip64Offset + 20, true) !== 0) {
        throw new Error('不支援分卷或多磁碟 ZIP');
      }
      totalCount = read64(view, zip64Offset + 32);
      centralSize = read64(view, zip64Offset + 40);
      centralOffset = read64(view, zip64Offset + 48);
      directoryEnd = zip64Offset;
    }
    if (centralCountIsInvalid(totalCount) || centralSize > bytes.length) throw new Error('ZIP 中央目錄索引錯誤');
    var centralStart = directoryEnd - centralSize;
    if (centralStart < 0 || centralOffset > centralStart) throw new Error('ZIP 中央目錄位置錯誤');
    var cursor = centralStart;
    var entries = [];
    var uniqueRawNames = new Set();
    var uniqueDecodedNames = new Set();
    var reservedNames = new Set();
    var outputFiles = new Set();
    var outputDirectories = new Set();
    var modes = new Set();
    var hasHeaderNameMismatch = false;
    for (var index = 0; index < totalCount; index += 1) {
      if (cursor + 46 > directoryEnd || view.getUint32(cursor, true) !== 0x02014b50) {
        throw new Error('ZIP 中央目錄項目損壞');
      }
      var versionMade = view.getUint16(cursor + 4, true);
      var flags = view.getUint16(cursor + 8, true);
      if (flags & 0x0041) throw new Error('加密 ZIP 不受支援');
      var nameLength = view.getUint16(cursor + 28, true);
      var extraLength = view.getUint16(cursor + 30, true);
      var commentLength = view.getUint16(cursor + 32, true);
      var externalAttributes = view.getUint32(cursor + 38, true);
      var nameStart = cursor + 46;
      var extraStart = nameStart + nameLength;
      var next = extraStart + extraLength + commentLength;
      if (!nameLength || next > directoryEnd) throw new Error('ZIP 檔名或中央目錄長度錯誤');
      var rawName = bytes.slice(nameStart, extraStart);
      var rawComment = bytes.slice(extraStart + extraLength, next);
      var rawKey = bytesToKey(rawName);
      if (uniqueRawNames.has(rawKey)) throw new Error('ZIP 含重複檔名');
      uniqueRawNames.add(rawKey);
      var centralUnicodeName = invalidateUnicodePathExtra(view, extraStart, extraLength, rawName);
      invalidateUnicodeCommentExtra(view, extraStart, extraLength, rawComment);
      var decoded = decodeArchiveName(rawName, flags, centralUnicodeName);
      var name = decoded.name;
      var mode = decoded.mode;
      if (uniqueDecodedNames.has(name)) throw new Error('ZIP 解碼後出現重複檔名');
      uniqueDecodedNames.add(name);
      modes.add(mode);
      var platform = versionMade >>> 8;
      var unixMode = platform === 3 ? (externalAttributes >>> 16) & 0xffff : 0;
      var unixType = unixMode & 0xf000;
      var isDirectory = name.endsWith('/') || Boolean(externalAttributes & 0x10) || unixType === 0x4000;
      var isSymlink = unixType === 0xa000;
      var isSpecial = unixType !== 0 && unixType !== 0x8000 && unixType !== 0x4000 && !isSymlink;
      var pathResult = safeMemberPath(name, isDirectory);
      var archiveKey = name;
      var preSkippedReason = '';
      if (pathResult.error) {
        archiveKey = uniqueArchiveKey(index, reservedNames);
        preSkippedReason = pathResult.error;
      } else if (isSymlink) {
        archiveKey = uniqueArchiveKey(index, reservedNames);
        preSkippedReason = '符號連結';
      } else if (isSpecial) {
        archiveKey = uniqueArchiveKey(index, reservedNames);
        preSkippedReason = '非一般檔案項目';
      } else {
        var pathName = pathResult.path;
        var pathConflict = false;
        if (isDirectory) {
          pathConflict = outputFiles.has(pathName) || hasFileAncestor(pathName, outputFiles);
          if (!pathConflict) {
            outputDirectories.add(pathName);
            addParentDirectories(pathName, outputDirectories);
          }
        } else {
          pathConflict = outputFiles.has(pathName) || outputDirectories.has(pathName) ||
            hasFileAncestor(pathName, outputFiles);
          if (!pathConflict) {
            outputFiles.add(pathName);
            addParentDirectories(pathName, outputDirectories);
          }
        }
        if (pathConflict) {
          archiveKey = uniqueArchiveKey(index, reservedNames);
          preSkippedReason = '清理後路徑重複或衝突';
        } else {
          archiveKey = pathName + (isDirectory ? '/' : '');
          reservedNames.add(archiveKey);
        }
      }
      var localHeaderOffset = view.getUint32(cursor + 42, true);
      if (localHeaderOffset === 0xffffffff) {
        localHeaderOffset = zip64LocalOffset(view, extraStart, extraLength,
          view.getUint32(cursor + 24, true), view.getUint32(cursor + 20, true));
      }
      if (localHeaderOffset + 30 > bytes.length || view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
        throw new Error('ZIP 本機檔案標頭錯誤');
      }
      var localNameLength = view.getUint16(localHeaderOffset + 26, true);
      var localExtraLength = view.getUint16(localHeaderOffset + 28, true);
      var localFlags = view.getUint16(localHeaderOffset + 6, true);
      var localNameStart = localHeaderOffset + 30;
      var localExtraStart = localNameStart + localNameLength;
      if (localExtraStart + localExtraLength > bytes.length) throw new Error('ZIP 本機檔案標頭長度錯誤');
      var localRawName = bytes.slice(localNameStart, localExtraStart);
      var localUnicodeName = invalidateUnicodePathExtra(view, localExtraStart, localExtraLength, localRawName);
      var localDecoded = null;
      try { localDecoded = decodeArchiveName(localRawName, localFlags, localUnicodeName); } catch (_) {}
      if (bytesToKey(localRawName) !== rawKey || (localFlags & 0x0800) !== (flags & 0x0800) ||
          !localDecoded || localDecoded.name !== name || localDecoded.mode !== mode) hasHeaderNameMismatch = true;
      view.setUint16(cursor + 8, flags & ~0x0800, true);
      view.setUint16(localHeaderOffset + 6, view.getUint16(localHeaderOffset + 6, true) & ~0x0800, true);
      entries.push({
        name: name,
        archiveKey: archiveKey,
        localRawKey: bytesToKey(localRawName),
        path: pathResult.path || '',
        preSkippedReason: preSkippedReason,
        isDirectory: isDirectory,
        isSymlink: isSymlink,
        isSpecial: isSpecial
      });
      cursor = next;
    }
    if (cursor !== centralStart + centralSize) throw new Error('ZIP 中央目錄長度與項目數不符');
    return {
      entries: entries,
      modes: modes,
      hasHeaderNameMismatch: hasHeaderNameMismatch
    };
  }

  function centralCountIsInvalid(count) {
    return !Number.isSafeInteger(count) || count < 0;
  }

  function safeMemberPath(rawName, isDirectory) {
    if (rawName.indexOf('\\') !== -1) return { error: '含反斜線' };
    if (/[\u0000-\u001f]/.test(rawName)) return { error: '路徑含控制字元' };
    var cleaned = rawName.replace(/\/+/g, '/');
    while (cleaned.indexOf('./') === 0) cleaned = cleaned.slice(2);
    if (cleaned.split('/').some(function (part) { return part === '..'; })) return { error: '路徑含 ..' };
    if (cleaned.charAt(0) === '/' || /^[A-Za-z]:/.test(cleaned)) return { error: '絕對路徑或磁碟代號' };
    if (isDirectory) cleaned = cleaned.replace(/\/+$/, '');
    var parts = cleaned.split('/').filter(function (part) { return part !== '.'; });
    cleaned = parts.join('/');
    if (!cleaned || parts.some(function (part) { return !part; })) return { error: '空白或無效路徑' };
    return { path: cleaned };
  }

  function safeFolderName(filename) {
    var base = filename.replace(/\.zip$/i, '');
    base = base.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().replace(/^\.+|\.+$/g, '');
    if (!base) base = 'archive';
    return base.slice(0, 120);
  }

  function uniqueFolderName(filename, usedNames) {
    var base = safeFolderName(filename);
    var candidate = base;
    var suffix = 2;
    while (usedNames.has(candidate.toLocaleLowerCase('en'))) {
      candidate = base + ' (' + suffix + ')';
      suffix += 1;
    }
    usedNames.add(candidate.toLocaleLowerCase('en'));
    return candidate;
  }

  function setProgress(value, text) {
    progressBar.value = Math.max(0, Math.min(100, value));
    progressLabel.textContent = text;
  }

  async function processArchive(item, outputZip, usedFolders, currentIndex, totalArchives) {
    var skipped = [];
    var pendingFiles = [];
    var pendingDirectories = [];
    var modes;
    var notes = [];
    try {
      var arrayBuffer = await item.file.arrayBuffer();
      var metadata = parseCentralNames(arrayBuffer);
      modes = metadata.modes;
      if (metadata.hasHeaderNameMismatch) notes.push('本機標頭名稱與中央目錄不一致，已採用中央目錄');
      var decodeCallIndex = 0;
      var archive = await window.JSZip.loadAsync(arrayBuffer, {
        checkCRC32: true,
        createFolders: false,
        decodeFileName: function () {
          var callIndex = decodeCallIndex;
          decodeCallIndex += 1;
          if (callIndex === 0) return '';
          var entryCall = callIndex - 1;
          var entryIndex = Math.floor(entryCall / 2);
          var isFilenameCall = entryCall % 2 === 0;
          var entry = metadata.entries[entryIndex];
          if (!entry) return '';
          // The pinned JSZip 3.10.1 decoder calls are: archive comment, then
          // each local filename and file comment in central-directory order.
          // Returning the central-directory choice for each filename also
          // handles duplicate or swapped local raw names without alias clashes.
          return isFilenameCall ? entry.archiveKey : '';
        }
      });
      var entriesByArchiveKey = new Map();
      Object.keys(archive.files).forEach(function (key) {
        var entry = archive.files[key];
        entriesByArchiveKey.set(entry.name, entry);
      });
      var extractedCount = 0;
      var validFiles = metadata.entries.filter(function (entry) { return !entry.isDirectory; }).length;
      var processedFiles = 0;
      for (var entryIndex = 0; entryIndex < metadata.entries.length; entryIndex += 1) {
        var entryInfo = metadata.entries[entryIndex];
        if (entryInfo.preSkippedReason) {
          skipped.push({ path: entryInfo.name, reason: entryInfo.preSkippedReason });
          continue;
        }
        if (entryInfo.isDirectory) {
          pendingDirectories.push(entryInfo.path);
          continue;
        }
        var jsEntry = entriesByArchiveKey.get(entryInfo.archiveKey);
        if (!jsEntry || jsEntry.dir) throw new Error('ZIP 檔案項目與中央目錄不一致：' + entryInfo.name);
        var bytes = await jsEntry.async('uint8array', function (metadataProgress) {
          var entryPercent = metadataProgress && Number.isFinite(metadataProgress.percent) ? metadataProgress.percent : 0;
          var archivePercent = ((currentIndex + (processedFiles + entryPercent / 100) / Math.max(1, validFiles)) / totalArchives) * 82;
          setProgress(archivePercent, '解壓 ' + item.file.name + '：' + (processedFiles + 1) + '/' + validFiles + ' 個檔案');
        });
        pendingFiles.push({ path: entryInfo.path, bytes: bytes });
        extractedCount += 1;
        processedFiles += 1;
      }
      var folderName = uniqueFolderName(item.file.name, usedFolders);
      pendingDirectories.forEach(function (directory) { outputZip.folder(folderName + '/' + directory); });
      pendingFiles.forEach(function (file) {
        outputZip.file(folderName + '/' + file.path, file.bytes, { binary: true, createFolders: true });
      });
      return {
        file: item.file,
        folder: folderName,
        extracted: extractedCount,
        skipped: skipped,
        modes: Array.from(modes),
        notes: notes,
        status: '完成'
      };
    } catch (error) {
      var errorText = error && error.message ? error.message : '';
      var reason = /encrypt|加密/i.test(errorText) ? '加密 ZIP 不受支援' : 'ZIP 損壞或格式不支援';
      skipped.push({ path: item.file.name, reason: reason });
      return {
        file: item.file,
        folder: '',
        extracted: 0,
        skipped: skipped,
        modes: modes ? Array.from(modes) : [],
        notes: notes,
        status: '已略過：加密／損壞'
      };
    }
  }

  function buildReport(results) {
    var lines = [
      'ZIP 批量解壓報告',
      '建立時間：' + new Date().toLocaleString('zh-HK'),
      '輸入 ZIP：' + results.length + ' 個',
      ''
    ];
    results.forEach(function (result, index) {
      lines.push((index + 1) + '. ' + result.file.name + '（' + formatBytes(result.file.size) + '）');
      lines.push('   狀態：' + result.status);
      lines.push('   解出檔案：' + result.extracted + ' 個');
      lines.push('   檔名解碼：' + (result.modes.length ? result.modes.join('、') : '未能判定'));
      if (result.folder) lines.push('   輸出資料夾：' + result.folder + '/');
      (result.notes || []).forEach(function (note) {
        lines.push('   注意：' + note);
      });
      if (result.skipped.length) {
        lines.push('   略過項目：');
        result.skipped.forEach(function (entry) {
          lines.push('   - ' + entry.path + '：' + entry.reason);
        });
      } else {
        lines.push('   略過項目：無');
      }
      lines.push('');
    });
    lines.push('安全提示：本工具只在瀏覽器本機處理檔案；不會上載，也不會自動解開 ZIP 內的 ZIP。');
    return lines.join('\n');
  }

  function makeDownloadName() {
    var now = new Date();
    var part = function (value) { return String(value).padStart(2, '0'); };
    return 'extracted-' + now.getFullYear() + part(now.getMonth() + 1) + part(now.getDate()) +
      '-' + part(now.getHours()) + part(now.getMinutes()) + '.zip';
  }

  async function processBatch() {
    if (busy || completed || !queue.length) return;
    busy = true;
    processButton.disabled = true;
    chooseButton.disabled = true;
    fileInput.disabled = true;
    progressWrap.hidden = false;
    reportPanel.hidden = true;
    downloadLink.hidden = true;
    setMessage('正在讀取 ZIP，請保持頁面開啟。');
    renderQueue();
    var outputZip = new window.JSZip();
    var usedFolders = new Set(['_report.txt']);
    var results = [];
    try {
      for (var index = 0; index < queue.length; index += 1) {
        var item = queue[index];
        item.status = '處理中';
        item.state = 'working';
        renderQueue();
        var result = await processArchive(item, outputZip, usedFolders, index, queue.length);
        results.push(result);
        item.status = result.status + '（' + result.extracted + ' 個檔案，略過 ' + result.skipped.length + ' 項）';
        item.state = result.status.indexOf('已略過') === 0 ? 'skipped' : 'done';
        renderQueue();
      }
      var report = buildReport(results);
      reportElement.textContent = report;
      reportPanel.hidden = false;
      outputZip.file('_report.txt', report);
      setProgress(84, '正在建立合併 ZIP…');
      var blob = await outputZip.generateAsync({
        type: 'blob',
        mimeType: 'application/zip',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      }, function (metadata) {
        var percent = metadata && Number.isFinite(metadata.percent) ? metadata.percent : 0;
        setProgress(84 + percent * 0.16, '正在建立合併 ZIP：' + Math.round(percent) + '%');
      });
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob);
      downloadLink.href = objectUrl;
      downloadLink.download = makeDownloadName();
      downloadLink.textContent = '下載合併 ZIP（' + formatBytes(blob.size) + '）';
      downloadLink.hidden = false;
      setProgress(100, '完成。請下載合併 ZIP；處理報告亦已放入 ZIP 根目錄。');
      setMessage('已完成 ' + results.length + ' 個來源 ZIP。請查看報告，再下載合併 ZIP。');
      completed = true;
    } catch (error) {
      setMessage('建立合併 ZIP 時遇到問題：' + (error && error.message ? error.message : '未知錯誤'), true);
      setProgress(progressBar.value, '處理未能完成。');
    } finally {
      busy = false;
      chooseButton.disabled = completed;
      fileInput.disabled = completed;
      processButton.disabled = true;
      renderQueue();
    }
  }

  chooseButton.addEventListener('click', function (event) {
    event.preventDefault();
    fileInput.click();
  });
  fileInput.addEventListener('change', function () {
    addFiles(fileInput.files);
    fileInput.value = '';
  });
  ['dragenter', 'dragover'].forEach(function (eventName) {
    dropZone.addEventListener(eventName, function (event) {
      event.preventDefault();
      event.stopPropagation();
      dropZone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(function (eventName) {
    dropZone.addEventListener(eventName, function (event) {
      event.preventDefault();
      event.stopPropagation();
      dropZone.classList.remove('dragover');
    });
  });
  dropZone.addEventListener('drop', function (event) {
    addFiles(event.dataTransfer.files);
  });
  dropZone.addEventListener('keydown', function (event) {
    if (event.target !== dropZone) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });
  processButton.addEventListener('click', processBatch);
  window.addEventListener('beforeunload', function () {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  });
  renderQueue();
}());
