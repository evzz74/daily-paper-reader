// 用户上传文献模块
// 允许用户上传自己的PDF或Markdown文件到本地阅读
(function () {
  'use strict';

  const UPLOAD_DIR = 'docs/user-uploads';
  const SUPPORTED_EXTENSIONS = ['.pdf', '.md', '.txt'];
  let uploadOverlay = null;
  let isUploading = false;

  const normalizeText = (value) => String(value || '').trim();

  const generateFileId = (filename) => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const safeName = filename.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').substring(0, 50);
    return `${safeName}_${timestamp}_${random}`;
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileExtension = (filename) => {
    const lastDot = filename.lastIndexOf('.');
    return lastDot === -1 ? '' : filename.substring(lastDot).toLowerCase();
  };

  const isSupportedFile = (filename) => {
    const ext = getFileExtension(filename);
    return SUPPORTED_EXTENSIONS.includes(ext);
  };

  // 解析PDF文件（简单提取文本，实际项目中可能需要更复杂的PDF解析库）
  const parsePDF = async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        // 注意：这里只是简单读取，实际PDF解析需要专门的库如pdf.js
        resolve({
          type: 'pdf',
          content: e.target.result,
          size: file.size,
          name: file.name,
        });
      };
      reader.readAsArrayBuffer(file);
    });
  };

  // 解析文本文件
  const parseTextFile = async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve({
          type: 'text',
          content: e.target.result,
          size: file.size,
          name: file.name,
        });
      };
      reader.readAsText(file);
    });
  };

  // 生成论文的Markdown内容
  const generatePaperMarkdown = (fileData, metadata) => {
    const now = new Date().toISOString().split('T')[0];
    const fileId = generateFileId(fileData.name);

    let content = fileData.content;
    // 如果是文本内容，进行简单的格式化
    if (fileData.type === 'text') {
      // 尝试提取标题（第一行）
      const lines = content.split('\n');
      const title = lines[0].trim() || fileData.name;
      const body = lines.slice(1).join('\n');

      return {
        fileId,
        markdown: `---
title: "${metadata.title || title}"
title_zh: "${metadata.titleZh || metadata.title || title}"
authors: "${metadata.authors || 'Unknown'}"
date: "${metadata.date || now}"
source: "用户上传"
upload_date: "${now}"
file_type: "${fileData.type}"
original_filename: "${fileData.name}"
tags: ["user-upload"]
---

# ${metadata.title || title}

**作者**: ${metadata.authors || 'Unknown'}

**上传日期**: ${now}

**原文档**: ${fileData.name}

---

${body}
`,
      };
    }

    // PDF 或其他二进制文件
    return {
      fileId,
      markdown: `---
title: "${metadata.title || fileData.name}"
title_zh: "${metadata.titleZh || metadata.title || fileData.name}"
authors: "${metadata.authors || 'Unknown'}"
date: "${metadata.date || now}"
source: "用户上传"
upload_date: "${now}"
file_type: "${fileData.type}"
original_filename: "${fileData.name}"
file_size: "${formatFileSize(fileData.size)}"
tags: ["user-upload", "pdf"]
---

# ${metadata.title || fileData.name}

**作者**: ${metadata.authors || 'Unknown'}

**上传日期**: ${now}

**文件大小**: ${formatFileSize(fileData.size)}

**原文档**: ${fileData.name}

---

> 此文件为PDF格式，请在浏览器中直接下载查看。

[下载 PDF](${fileData.name})
`,
    };
  };

  // 保存到本地存储（模拟）
  const saveToLocalStorage = (fileId, markdown) => {
    try {
      const uploads = JSON.parse(localStorage.getItem('dpr_user_uploads') || '[]');
      uploads.push({
        id: fileId,
        date: new Date().toISOString(),
        preview: markdown.substring(0, 500),
      });
      localStorage.setItem('dpr_user_uploads', JSON.stringify(uploads));
      localStorage.setItem(`dpr_upload_${fileId}`, markdown);
      return true;
    } catch (e) {
      console.error('保存到本地存储失败:', e);
      return false;
    }
  };

  // 创建上传浮层
  const createUploadOverlay = () => {
    if (uploadOverlay) return uploadOverlay;

    uploadOverlay = document.createElement('div');
    uploadOverlay.id = 'user-upload-overlay';
    uploadOverlay.className = 'user-upload-overlay';
    uploadOverlay.innerHTML = `
      <div class="user-upload-panel">
        <div class="user-upload-header">
          <h3>📄 上传文献</h3>
          <button class="user-upload-close" title="关闭">×</button>
        </div>
        <div class="user-upload-body">
          <div class="user-upload-dropzone" id="user-upload-dropzone">
            <div class="user-upload-dropzone-icon">📁</div>
            <div class="user-upload-dropzone-text">
              拖拽文件到此处，或 <span class="user-upload-browse">点击选择</span>
            </div>
            <div class="user-upload-dropzone-hint">
              支持格式：PDF, Markdown (.md), 文本文件 (.txt)，最大 20MB
            </div>
            <input type="file" id="user-upload-input" accept=".pdf,.md,.txt" multiple style="display:none;" />
          </div>

          <div class="user-upload-metadata" id="user-upload-metadata" style="display:none;">
            <h4>📋 文献信息（可选）</h4>
            <div class="user-upload-form">
              <div class="user-upload-form-row">
                <label>标题（英文）</label>
                <input type="text" id="upload-meta-title" placeholder="输入文献标题" />
              </div>
              <div class="user-upload-form-row">
                <label>标题（中文）</label>
                <input type="text" id="upload-meta-title-zh" placeholder="输入中文标题" />
              </div>
              <div class="user-upload-form-row">
                <label>作者</label>
                <input type="text" id="upload-meta-authors" placeholder="多个作者用逗号分隔" />
              </div>
              <div class="user-upload-form-row">
                <label>发表日期</label>
                <input type="date" id="upload-meta-date" />
              </div>
            </div>
          </div>

          <div class="user-upload-filelist" id="user-upload-filelist"></div>

          <div class="user-upload-actions">
            <button class="user-upload-btn secondary" id="user-upload-cancel">取消</button>
            <button class="user-upload-btn primary" id="user-upload-confirm" disabled>确认上传</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(uploadOverlay);
    bindUploadEvents();
    return uploadOverlay;
  };

  // 绑定上传事件
  const bindUploadEvents = () => {
    const dropzone = document.getElementById('user-upload-dropzone');
    const fileInput = document.getElementById('user-upload-input');
    const browseSpan = dropzone.querySelector('.user-upload-browse');
    const closeBtn = uploadOverlay.querySelector('.user-upload-close');
    const cancelBtn = document.getElementById('user-upload-cancel');
    const confirmBtn = document.getElementById('user-upload-confirm');

    // 拖拽事件
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      handleFiles(e.dataTransfer.files);
    });

    // 点击选择文件
    browseSpan.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      handleFiles(e.target.files);
    });

    // 关闭按钮
    closeBtn.addEventListener('click', closeUploadOverlay);
    cancelBtn.addEventListener('click', closeUploadOverlay);

    // 确认上传
    confirmBtn.addEventListener('click', processUpload);

    // 点击遮罩关闭
    uploadOverlay.addEventListener('click', (e) => {
      if (e.target === uploadOverlay) {
        closeUploadOverlay();
      }
    });
  };

  let pendingFiles = [];

  const handleFiles = (files) => {
    pendingFiles = [];
    const fileList = document.getElementById('user-upload-filelist');
    fileList.innerHTML = '';

    Array.from(files).forEach((file) => {
      if (!isSupportedFile(file.name)) {
        showUploadMessage(`不支持的文件格式: ${file.name}`, 'error');
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        showUploadMessage(`文件过大: ${file.name} (最大支持 20MB)`, 'error');
        return;
      }
      pendingFiles.push(file);

      const fileItem = document.createElement('div');
      fileItem.className = 'user-upload-fileitem';
      fileItem.innerHTML = `
        <span class="user-upload-fileicon">${getFileIcon(file.name)}</span>
        <span class="user-upload-filename">${escapeHtml(file.name)}</span>
        <span class="user-upload-filesize">${formatFileSize(file.size)}</span>
        <button class="user-upload-fileremove" data-file="${escapeHtml(file.name)}">×</button>
      `;
      fileList.appendChild(fileItem);
    });

    if (pendingFiles.length > 0) {
      document.getElementById('user-upload-metadata').style.display = 'block';
      document.getElementById('user-upload-confirm').disabled = false;
    }

    // 绑定删除按钮
    fileList.querySelectorAll('.user-upload-fileremove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const filename = e.target.dataset.file;
        pendingFiles = pendingFiles.filter((f) => f.name !== filename);
        e.target.closest('.user-upload-fileitem').remove();
        if (pendingFiles.length === 0) {
          document.getElementById('user-upload-metadata').style.display = 'none';
          document.getElementById('user-upload-confirm').disabled = true;
        }
      });
    });
  };

  const getFileIcon = (filename) => {
    const ext = getFileExtension(filename);
    if (ext === '.pdf') return '📕';
    if (ext === '.md') return '📝';
    if (ext === '.txt') return '📄';
    return '📎';
  };

  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  const showUploadMessage = (message, type = 'info') => {
    const fileList = document.getElementById('user-upload-filelist');
    const msgDiv = document.createElement('div');
    msgDiv.className = `user-upload-message ${type}`;
    msgDiv.textContent = message;
    fileList.appendChild(msgDiv);
    setTimeout(() => msgDiv.remove(), 3000);
  };

  const processUpload = async () => {
    if (isUploading || pendingFiles.length === 0) return;

    isUploading = true;
    const confirmBtn = document.getElementById('user-upload-confirm');
    confirmBtn.disabled = true;
    confirmBtn.textContent = '上传中...';

    const metadata = {
      title: document.getElementById('upload-meta-title').value,
      titleZh: document.getElementById('upload-meta-title-zh').value,
      authors: document.getElementById('upload-meta-authors').value,
      date: document.getElementById('upload-meta-date').value,
    };

    try {
      for (const file of pendingFiles) {
        let fileData;
        if (getFileExtension(file.name) === '.pdf') {
          fileData = await parsePDF(file);
        } else {
          fileData = await parseTextFile(file);
        }

        const { fileId, markdown } = generatePaperMarkdown(fileData, metadata);
        saveToLocalStorage(fileId, markdown);

        // 添加到侧边栏（通过自定义事件通知 docsify-plugin）
        document.dispatchEvent(
          new CustomEvent('dpr-user-upload-complete', {
            detail: { fileId, title: metadata.title || file.name, date: new Date().toISOString() },
          })
        );
      }

      showUploadMessage('上传成功！', 'success');
      setTimeout(() => {
        closeUploadOverlay();
        // 刷新页面以显示新上传的文献
        if (window.location.hash.includes('user-uploads')) {
          window.location.reload();
        }
      }, 1000);
    } catch (error) {
      console.error('上传失败:', error);
      showUploadMessage('上传失败: ' + error.message, 'error');
    } finally {
      isUploading = false;
      confirmBtn.disabled = false;
      confirmBtn.textContent = '确认上传';
    }
  };

  const openUploadOverlay = () => {
    const overlay = createUploadOverlay();
    overlay.style.display = 'flex';
    requestAnimationFrame(() => {
      overlay.classList.add('show');
    });
    pendingFiles = [];
    document.getElementById('user-upload-filelist').innerHTML = '';
    document.getElementById('user-upload-metadata').style.display = 'none';
    document.getElementById('user-upload-confirm').disabled = true;
  };

  const closeUploadOverlay = () => {
    if (!uploadOverlay) return;
    uploadOverlay.classList.remove('show');
    setTimeout(() => {
      uploadOverlay.style.display = 'none';
    }, 300);
  };

  // 添加样式
  const addStyles = () => {
    if (document.getElementById('user-upload-styles')) return;

    const style = document.createElement('style');
    style.id = 'user-upload-styles';
    style.textContent = `
      /* 上传按钮 */
      .user-upload-btn-entry {
        position: fixed;
        bottom: 80px;
        right: 20px;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        font-size: 24px;
        cursor: pointer;
        z-index: 100;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .user-upload-btn-entry:hover {
        transform: translateY(-2px) scale(1.05);
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
      }

      /* 上传浮层 */
      .user-upload-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        z-index: 10000;
        display: none;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.3s ease;
      }
      .user-upload-overlay.show {
        opacity: 1;
      }
      .user-upload-panel {
        background: white;
        border-radius: 12px;
        width: 90%;
        max-width: 600px;
        max-height: 90vh;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        transform: translateY(20px);
        transition: transform 0.3s ease;
      }
      .user-upload-overlay.show .user-upload-panel {
        transform: translateY(0);
      }
      .user-upload-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid #eee;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }
      .user-upload-header h3 {
        margin: 0;
        font-size: 18px;
      }
      .user-upload-close {
        background: none;
        border: none;
        color: white;
        font-size: 28px;
        cursor: pointer;
        line-height: 1;
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background 0.2s;
      }
      .user-upload-close:hover {
        background: rgba(255, 255, 255, 0.2);
      }
      .user-upload-body {
        padding: 20px;
        overflow-y: auto;
        max-height: calc(90vh - 70px);
      }

      /* 拖放区域 */
      .user-upload-dropzone {
        border: 2px dashed #ccc;
        border-radius: 8px;
        padding: 40px 20px;
        text-align: center;
        transition: all 0.3s;
        cursor: pointer;
        background: #fafafa;
      }
      .user-upload-dropzone.dragover,
      .user-upload-dropzone:hover {
        border-color: #667eea;
        background: #f0f4ff;
      }
      .user-upload-dropzone-icon {
        font-size: 48px;
        margin-bottom: 12px;
      }
      .user-upload-dropzone-text {
        font-size: 16px;
        color: #333;
        margin-bottom: 8px;
      }
      .user-upload-browse {
        color: #667eea;
        cursor: pointer;
        text-decoration: underline;
      }
      .user-upload-dropzone-hint {
        font-size: 12px;
        color: #999;
      }

      /* 元数据表单 */
      .user-upload-metadata {
        margin-top: 20px;
        padding: 16px;
        background: #f8f9fa;
        border-radius: 8px;
      }
      .user-upload-metadata h4 {
        margin: 0 0 12px 0;
        font-size: 14px;
        color: #333;
      }
      .user-upload-form-row {
        margin-bottom: 12px;
      }
      .user-upload-form-row:last-child {
        margin-bottom: 0;
      }
      .user-upload-form-row label {
        display: block;
        font-size: 12px;
        color: #666;
        margin-bottom: 4px;
      }
      .user-upload-form-row input {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
        box-sizing: border-box;
      }
      .user-upload-form-row input:focus {
        outline: none;
        border-color: #667eea;
      }

      /* 文件列表 */
      .user-upload-filelist {
        margin-top: 16px;
      }
      .user-upload-fileitem {
        display: flex;
        align-items: center;
        padding: 10px 12px;
        background: #f0f4ff;
        border-radius: 6px;
        margin-bottom: 8px;
        gap: 10px;
      }
      .user-upload-fileicon {
        font-size: 20px;
      }
      .user-upload-filename {
        flex: 1;
        font-size: 14px;
        color: #333;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .user-upload-filesize {
        font-size: 12px;
        color: #999;
      }
      .user-upload-fileremove {
        background: #ff4444;
        color: white;
        border: none;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .user-upload-fileremove:hover {
        background: #cc0000;
      }
      .user-upload-message {
        padding: 10px 16px;
        border-radius: 6px;
        margin-top: 10px;
        font-size: 14px;
      }
      .user-upload-message.success {
        background: #d4edda;
        color: #155724;
      }
      .user-upload-message.error {
        background: #f8d7da;
        color: #721c24;
      }
      .user-upload-message.info {
        background: #d1ecf1;
        color: #0c5460;
      }

      /* 操作按钮 */
      .user-upload-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid #eee;
      }
      .user-upload-btn {
        padding: 10px 24px;
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
      }
      .user-upload-btn.secondary {
        background: #f0f0f0;
        color: #666;
      }
      .user-upload-btn.secondary:hover {
        background: #e0e0e0;
      }
      .user-upload-btn.primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }
      .user-upload-btn.primary:hover:not(:disabled) {
        opacity: 0.9;
        transform: translateY(-1px);
      }
      .user-upload-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      /* 用户上传区域侧边栏样式 */
      .sidebar-nav .user-uploads-section {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid #eee;
      }
      .sidebar-nav .user-uploads-title {
        font-size: 12px;
        color: #999;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        padding: 0 16px 8px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .sidebar-nav .user-upload-add {
        cursor: pointer;
        font-size: 18px;
        color: #667eea;
      }
      .sidebar-nav .user-upload-add:hover {
        color: #764ba2;
      }
    `;
    document.head.appendChild(style);
  };

  // 创建上传入口按钮
  const createUploadEntryButton = () => {
    if (document.getElementById('user-upload-entry-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'user-upload-entry-btn';
    btn.className = 'user-upload-btn-entry';
    btn.innerHTML = '📤';
    btn.title = '上传文献';
    btn.addEventListener('click', openUploadOverlay);
    document.body.appendChild(btn);
  };

  // 初始化
  const init = () => {
    addStyles();
    createUploadEntryButton();

    // 暴露全局接口
    window.DPRUserUpload = {
      open: openUploadOverlay,
      close: closeUploadOverlay,
      getUploads: () => {
        try {
          return JSON.parse(localStorage.getItem('dpr_user_uploads') || '[]');
        } catch {
          return [];
        }
      },
      getUploadContent: (fileId) => {
        try {
          return localStorage.getItem(`dpr_upload_${fileId}`) || '';
        } catch {
          return '';
        }
      },
    };
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
