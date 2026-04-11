#!/usr/bin/env python
import argparse
import html
import json
import os
import re
import time
from datetime import datetime, timezone
from typing import Any

import fitz  # PyMuPDF

from llm import BltClient, GenericOpenAIClient, LLMClient


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
UPLOAD_ROOT = os.path.join(ROOT_DIR, "docs", "user-uploads")
UPLOAD_META_DIR = os.path.join(UPLOAD_ROOT, "meta")
HOME_README_PATH = os.path.join(ROOT_DIR, "docs", "README.md")
SIDEBAR_PATH = os.path.join(ROOT_DIR, "docs", "_sidebar.md")
MAX_INPUT_CHARS = 50000
HOME_SECTION_START = "<!-- USER_UPLOAD_HOME_START -->"
HOME_SECTION_END = "<!-- USER_UPLOAD_HOME_END -->"
SIDEBAR_SECTION_START = "<!-- USER_UPLOAD_SIDEBAR_START -->"
SIDEBAR_SECTION_END = "<!-- USER_UPLOAD_SIDEBAR_END -->"
HOME_MAX_ITEMS = 8
SIDEBAR_MAX_ITEMS = 12


def log(message: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {message}", flush=True)


def yaml_escape_value(value: str) -> str:
    text = str(value or "")
    if not text:
        return '""'
    if any(c in text for c in [":", "#", '"', "'", "\n", "[", "]", "{", "}", ",", "&", "*", "!", "|", ">", "%", "@", "`"]):
        return '"' + text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n") + '"'
    return text


def _create_llm_client() -> LLMClient | None:
    api_key = os.getenv("BLT_API_KEY") or os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    model = os.getenv("BLT_SUMMARY_MODEL") or os.getenv("LLM_MODEL") or "gemini-3-flash-preview"
    base_url = os.getenv("LLM_BASE_URL") or os.getenv("OPENAI_BASE_URL") or os.getenv("BLT_PRIMARY_BASE_URL")
    is_blt = base_url and ("bltcy.ai" in base_url or "gptbest" in base_url)
    if is_blt or not base_url:
        return BltClient(api_key=api_key, model=model)
    return GenericOpenAIClient(api_key=api_key, model=model, base_url=base_url)


LLM_CLIENT = _create_llm_client()


def load_json(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, dict) else {}


def save_text(path: str, content: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def save_json(path: str, data: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def load_text(path: str) -> str:
    if not os.path.exists(path):
        return ""
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def extract_pdf_text(pdf_path: str) -> str:
    doc = fitz.open(pdf_path)
    texts: list[str] = []
    try:
        for page in doc:
            texts.append(page.get_text("text"))
    finally:
        doc.close()
    return "\n\n".join(texts).strip()


def read_source_text(source_path: str) -> str:
    ext = os.path.splitext(source_path)[1].lower()
    if ext == ".pdf":
        return extract_pdf_text(source_path)
    with open(source_path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read().strip()


def clean_excerpt(text: str, limit: int = MAX_INPUT_CHARS) -> str:
    compact = re.sub(r"\n{3,}", "\n\n", str(text or "").strip())
    if len(compact) <= limit:
        return compact
    return compact[:limit].rstrip() + "\n\n[TRUNCATED]"


def call_text(messages: list[dict[str, str]], temperature: float, max_tokens: int) -> str:
    if LLM_CLIENT is None:
        return ""
    LLM_CLIENT.kwargs.update(
        {
            "temperature": float(temperature),
            "max_tokens": int(max_tokens),
        }
    )
    resp = LLM_CLIENT.chat(messages=messages, response_format=None)
    return str(resp.get("content") or "").strip()


def call_structured_json(
    messages: list[dict[str, str]],
    schema_name: str,
    schema: dict[str, Any],
    temperature: float,
    max_tokens: int,
) -> dict[str, Any] | None:
    if LLM_CLIENT is None:
        return None
    LLM_CLIENT.kwargs.update(
        {
            "temperature": float(temperature),
            "max_tokens": int(max_tokens),
        }
    )
    resp = LLM_CLIENT.chat_structured(
        messages=messages,
        schema_name=schema_name,
        schema=schema,
        strict=True,
        allow_json_object_fallback=True,
    )
    if resp.get("refusal"):
        return None
    if resp.get("finish_reason") not in (None, "stop"):
        return None
    if resp.get("parse_error") is not None:
        raise ValueError(f"模型未返回合法 JSON：{resp.get('content')}")
    parsed = resp.get("parsed")
    return parsed if isinstance(parsed, dict) else None


def generate_glance(title: str, source_type: str, text_excerpt: str) -> dict[str, str] | None:
    schema = {
        "type": "object",
        "properties": {
            "tldr": {"type": "string"},
            "motivation": {"type": "string"},
            "method": {"type": "string"},
            "result": {"type": "string"},
            "conclusion": {"type": "string"},
        },
        "required": ["tldr", "motivation", "method", "result", "conclusion"],
        "additionalProperties": False,
    }
    messages = [
        {
            "role": "system",
            "content": "你是一名学术文献速览助手，请用中文输出简洁、准确的阅读速览。",
        },
        {
            "role": "user",
            "content": (
                f"标题：{title or '未命名文档'}\n"
                f"文件类型：{source_type}\n\n"
                f"文档内容节选如下：\n\n{text_excerpt}\n\n"
                "请严格输出 JSON："
                '{"tldr":"...","motivation":"...","method":"...","result":"...","conclusion":"..."}'
            ),
        },
    ]
    return call_structured_json(
        messages,
        schema_name="user_upload_glance",
        schema=schema,
        temperature=0.2,
        max_tokens=2048,
    )


def generate_deep_summary(title: str, source_type: str, text_excerpt: str, max_retries: int = 3) -> str:
    if LLM_CLIENT is None:
        return "未配置 LLM，无法生成自动总结。"

    system_prompt = "你是一名资深学术阅读助手，请使用中文、Markdown 格式输出结构化阅读总结。"
    user_prompt = (
        f"标题：{title or '未命名文档'}\n"
        f"文件类型：{source_type}\n\n"
        f"文档内容节选如下：\n\n{text_excerpt}\n\n"
        "请围绕以下结构输出：\n"
        "## 核心问题\n"
        "## 主要内容与方法\n"
        "## 关键发现\n"
        "## 适用场景与价值\n"
        "## 局限与注意事项\n\n"
        "要求：\n"
        "1. 使用中文。\n"
        "2. 内容客观、紧凑，不要空话。\n"
        "3. 如果文档不是标准学术论文，也请按内容本身总结，不要强行编造实验。\n"
        "4. 最后一行输出“（完）”。"
    )
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    last = ""
    for attempt in range(1, max_retries + 1):
        try:
            content = call_text(messages, temperature=0.3, max_tokens=4096)
            if not content:
                continue
            last = content
            if "（完）" in content:
                return content
            cont_messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"以下内容被截断了，请从中断处继续，不要重复：\n\n{content}\n\n最后一行输出“（完）”。"},
            ]
            cont = call_text(cont_messages, temperature=0.3, max_tokens=2048)
            merged = f"{content}\n\n{cont}".strip()
            if "（完）" in merged:
                return merged
            last = merged
        except Exception as exc:
            log(f"[WARN] 生成详细总结失败（第 {attempt} 次）：{exc}")
            time.sleep(2 * attempt)
    return last or "自动总结生成失败。"


def build_markdown(meta: dict[str, Any], glance: dict[str, str] | None, deep_summary: str, source_rel_path: str) -> str:
    title = str(meta.get("title") or meta.get("original_filename") or meta.get("file_id") or "未命名文档").strip()
    title_zh = str(meta.get("title_zh") or title).strip()
    authors = str(meta.get("authors") or "Unknown").strip()
    paper_date = str(meta.get("date") or "").strip() or "Unknown"
    upload_date = str(meta.get("upload_date") or "").strip() or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    original_filename = str(meta.get("original_filename") or "").strip()
    source_type = str(meta.get("source_type") or "").strip()
    tldr = str((glance or {}).get("tldr") or "").strip()
    motivation = str((glance or {}).get("motivation") or "").strip()
    method = str((glance or {}).get("method") or "").strip()
    result = str((glance or {}).get("result") or "").strip()
    conclusion = str((glance or {}).get("conclusion") or "").strip()

    lines = [
        "---",
        f"title: {yaml_escape_value(title)}",
        f"title_zh: {yaml_escape_value(title_zh)}",
        f"authors: {yaml_escape_value(authors)}",
        f"date: {yaml_escape_value(paper_date)}",
        'source: "用户上传"',
        f"upload_date: {yaml_escape_value(upload_date)}",
        f"original_filename: {yaml_escape_value(original_filename)}",
        f"file_type: {yaml_escape_value(source_type)}",
        f"source_file: {yaml_escape_value(source_rel_path)}",
        'tags: ["user-upload"]',
    ]
    if source_type == "pdf":
        lines.append(f"pdf: {yaml_escape_value(source_rel_path)}")
    if tldr:
        lines.append(f"tldr: {yaml_escape_value(tldr)}")
    lines.extend(
        [
            "---",
            "",
            f"# {title}",
            "",
            f"**作者**: {authors}",
            "",
            f"**上传日期**: {upload_date}",
            "",
            f"**原始文件**: [{original_filename}]({source_rel_path})",
            "",
            "---",
            "",
            "## 速览摘要（自动生成）",
            "",
        ]
    )
    if glance:
        lines.extend(
            [
                f"**TLDR**：{tldr or '未生成'} \\",
                f"**Motivation**：{motivation or '未生成'} \\",
                f"**Method**：{method or '未生成'} \\",
                f"**Result**：{result or '未生成'} \\",
                f"**Conclusion**：{conclusion or '未生成'}",
            ]
        )
    else:
        lines.append("未生成速览摘要。")

    lines.extend(
        [
            "",
            "---",
            "",
            "## 论文详细总结（自动生成）",
            "",
            deep_summary.strip() or "自动总结生成失败。",
            "",
        ]
    )
    return "\n".join(lines).strip() + "\n"


def collapse_inline_text(value: Any, limit: int = 120) -> str:
    text = re.sub(r"\s+", " ", str(value or "").strip())
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 3)].rstrip() + "..."


def escape_markdown_link_text(value: Any) -> str:
    return str(value or "").replace("[", r"\[").replace("]", r"\]").replace("\n", " ").strip()


def build_sorted_entries() -> list[dict[str, Any]]:
    if not os.path.isdir(UPLOAD_META_DIR):
        return []

    entries: list[dict[str, Any]] = []
    for name in os.listdir(UPLOAD_META_DIR):
        if not name.endswith(".json"):
            continue
        path = os.path.join(UPLOAD_META_DIR, name)
        try:
            item = load_json(path)
        except Exception as exc:
            log(f"[WARN] 跳过损坏的上传元数据 {name}: {exc}")
            continue
        if not isinstance(item, dict):
            continue
        item["_meta_name"] = name
        entries.append(item)

    return sorted(
        entries,
        key=lambda item: (
            str(item.get("upload_date") or ""),
            str(item.get("file_id") or ""),
        ),
        reverse=True,
    )


def render_upload_index(entries: list[dict[str, Any]]) -> str:
    items = list(entries)
    lines = [
        "# 我的上传文献",
        "",
        "本目录用于存放用户自己上传的文献，以及对应的自动阅读总结页面。",
        "",
        "## 使用方法",
        "",
        "1. 点击页面右下角的 **📤 上传按钮**",
        "2. 拖拽或选择要上传的文件（支持 PDF、Markdown、TXT 格式）",
        "3. 填写文献信息（可选）",
        "4. 点击确认上传",
        "",
        "## 已上传文献",
        "",
        "<!-- USER_UPLOAD_LIST_START -->",
    ]
    if items:
        for item in items:
            file_id = str(item.get("file_id") or "").strip()
            title = str(item.get("title") or item.get("original_filename") or file_id).strip() or "未命名文档"
            original_filename = str(item.get("original_filename") or "").strip()
            upload_date = str(item.get("upload_date") or "").strip() or "Unknown"
            summary_status = "已生成" if str(item.get("summary_status") or "").strip() == "done" else "处理中"
            tldr = collapse_inline_text(item.get("tldr") or "", limit=90)
            line = f'- [{title}](#/user-uploads/{file_id}) · `{original_filename}` · {upload_date} · {summary_status}'
            if tldr:
                line += f" · TLDR: {tldr}"
            lines.append(line)
    else:
        lines.append("- 暂无上传文献")
    lines.extend(
        [
            "<!-- USER_UPLOAD_LIST_END -->",
            "",
            "## 数据存储与处理",
            "",
            "- 上传确认后，文件会同步写入 GitHub 仓库的 `docs/user-uploads/` 目录",
            "- 上传完成后会自动触发工作流，读取文件并生成 AI 总结页面",
            "- 页面侧边栏中的“用户上传模式”也会保留最近上传记录，方便快速跳转",
            "",
            "---",
            "",
            "*上传时间: 系统自动生成*",
            "",
        ]
    )
    return "\n".join(lines)


def render_home_section(entries: list[dict[str, Any]]) -> str:
    lines = [
        "## 我的上传文献",
        "",
    ]
    items = list(entries[:HOME_MAX_ITEMS])
    if items:
        for item in items:
            file_id = str(item.get("file_id") or "").strip()
            title = escape_markdown_link_text(item.get("title") or item.get("original_filename") or file_id or "未命名文档")
            original_filename = str(item.get("original_filename") or "").strip()
            upload_date = str(item.get("upload_date") or "").strip() or "Unknown"
            status = "已生成" if str(item.get("summary_status") or "").strip() == "done" else "处理中"
            line = f'- [{title}](#/user-uploads/{file_id}) · `{original_filename}` · {upload_date} · {status}'
            tldr = collapse_inline_text(item.get("tldr") or "", limit=120)
            if tldr:
                line += f" · TLDR: {tldr}"
            lines.append(line)
    else:
        lines.append("- 暂无上传文献")
    lines.append("")
    return "\n".join(lines).strip()


def render_sidebar_section(entries: list[dict[str, Any]]) -> str:
    lines = [
        '* <a class="dpr-sidebar-root-link dpr-sidebar-noactive-link" href="javascript:void(0)" data-dpr-hash="#/user-uploads/README">我的上传文献</a>'
    ]
    items = list(entries[:SIDEBAR_MAX_ITEMS])
    if items:
        for item in items:
            file_id = str(item.get("file_id") or "").strip()
            title = html.escape(str(item.get("title") or item.get("original_filename") or file_id or "未命名文档").strip(), quote=True)
            route = html.escape(f"#/user-uploads/{file_id}", quote=True)
            lines.append(
                f'  * <a class="dpr-sidebar-noactive-link" href="javascript:void(0)" data-dpr-hash="{route}">{title}</a>'
            )
    else:
        lines.append('  * <a class="dpr-sidebar-noactive-link" href="javascript:void(0)" data-dpr-hash="#/user-uploads/README">上传入口</a>')
    return "\n".join(lines).strip()


def upsert_marked_section(base: str, start_marker: str, end_marker: str, section_body: str) -> str:
    body = section_body.strip()
    if not body:
        body = "-"
    block = f"{start_marker}\n{body}\n{end_marker}"
    source = str(base or "").strip()
    if start_marker in source and end_marker in source:
        pattern = re.compile(re.escape(start_marker) + r"[\s\S]*?" + re.escape(end_marker), re.MULTILINE)
        replaced = pattern.sub(block, source, count=1)
        return replaced.strip() + "\n"
    if source:
        return source + "\n\n" + block + "\n"
    return block + "\n"


def regenerate_upload_readme(entries: list[dict[str, Any]]) -> None:
    readme_path = os.path.join(UPLOAD_ROOT, "README.md")
    save_text(readme_path, render_upload_index(entries))


def regenerate_home_readme(entries: list[dict[str, Any]]) -> None:
    current = load_text(HOME_README_PATH)
    updated = upsert_marked_section(current, HOME_SECTION_START, HOME_SECTION_END, render_home_section(entries))
    save_text(HOME_README_PATH, updated)


def regenerate_sidebar(entries: list[dict[str, Any]]) -> None:
    current = load_text(SIDEBAR_PATH)
    updated = upsert_marked_section(current, SIDEBAR_SECTION_START, SIDEBAR_SECTION_END, render_sidebar_section(entries))
    save_text(SIDEBAR_PATH, updated)


def regenerate_indexes() -> None:
    entries = build_sorted_entries()
    regenerate_upload_readme(entries)
    regenerate_home_readme(entries)
    regenerate_sidebar(entries)


def process_upload(file_id: str) -> None:
    meta_path = os.path.join(UPLOAD_META_DIR, f"{file_id}.json")
    if not os.path.exists(meta_path):
        raise FileNotFoundError(f"未找到上传元数据：{meta_path}")

    meta = load_json(meta_path)
    source_rel = str(meta.get("source_rel_path") or "").strip()
    page_rel = str(meta.get("page_rel_path") or "").strip()
    if not source_rel or not page_rel:
        raise ValueError("上传元数据缺少 source_rel_path 或 page_rel_path")

    source_path = os.path.join(ROOT_DIR, source_rel.replace("/", os.sep))
    page_path = os.path.join(ROOT_DIR, page_rel.replace("/", os.sep))
    if not os.path.exists(source_path):
        raise FileNotFoundError(f"未找到上传源文件：{source_path}")

    title = str(meta.get("title") or meta.get("original_filename") or file_id).strip()
    source_type = str(meta.get("source_type") or os.path.splitext(source_path)[1].lstrip(".")).strip().lower()
    log(f"[INFO] 开始处理用户上传文件：file_id={file_id}, source={source_rel}")

    source_text = read_source_text(source_path)
    text_excerpt = clean_excerpt(source_text)
    if not text_excerpt:
        deep_summary = "无法从该文件提取可用文本，暂时无法生成自动总结。"
        glance = None
    else:
        glance = generate_glance(title, source_type, text_excerpt)
        deep_summary = generate_deep_summary(title, source_type, text_excerpt)

    source_link = "./" + os.path.relpath(source_path, os.path.dirname(page_path)).replace("\\", "/")
    markdown = build_markdown(meta, glance, deep_summary, source_link)
    save_text(page_path, markdown)
    meta["summary_status"] = "done"
    meta["summary_updated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta["tldr"] = str((glance or {}).get("tldr") or "").strip()
    save_json(meta_path, meta)
    regenerate_indexes()
    log(f"[INFO] 已生成上传文献总结页：{page_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="处理用户上传文献并生成总结页面。")
    parser.add_argument("--file-id", required=True, help="用户上传文件的唯一 file_id。")
    args = parser.parse_args()
    process_upload(str(args.file_id or "").strip())


if __name__ == "__main__":
    main()
