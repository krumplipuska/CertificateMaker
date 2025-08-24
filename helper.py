#!/usr/bin/env python3
"""
HTML Combiner Helper Script
Combines `index.html` with all local CSS and JS files referenced via
<link rel="stylesheet" href="..."> and <script src="..."></script>
into a single self-contained HTML file.
"""

import os
import re
from pathlib import Path

def read_file(filepath):
    """Read file content safely"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        print(f"Warning: {filepath} not found")
        return ""
    except Exception as e:
        print(f"Error reading {filepath}: {e}")
        return ""

def _is_local_asset(src: str) -> bool:
    """Return True if the referenced src/href is a local file path."""
    if not src:
        return False
    lower = src.strip().lower()
    if lower.startswith('http://') or lower.startswith('https://'):
        return False
    if lower.startswith('//'):
        return False
    if lower.startswith('data:'):
        return False
    return True


def _inline_css_links(html_content: str, base_dir: str) -> str:
    """Replace local <link ... rel="stylesheet" href="..."> with inline <style>."""
    link_pattern = re.compile(r"<link([^>]*)href=['\"]([^'\"]+)['\"]([^>]*)>", flags=re.IGNORECASE)

    def replace_link(match: re.Match) -> str:
        pre_attrs = match.group(1) or ''
        href = match.group(2) or ''
        post_attrs = match.group(3) or ''
        attrs_combined = f"{pre_attrs} {post_attrs}".lower()
        if 'rel="stylesheet"' not in attrs_combined and 'rel=stylesheet' not in attrs_combined:
            return match.group(0)
        if not _is_local_asset(href):
            return match.group(0)
        css_path = os.path.normpath(os.path.join(base_dir, href))
        css_content = read_file(css_path)
        if not css_content:
            return match.group(0)
        return f"\n  <style>\n{css_content}\n  </style>\n"

    return link_pattern.sub(replace_link, html_content)


def _extract_local_scripts(html_content: str, base_dir: str):
    """
    Remove local <script src="..."></script> tags from HTML and collect their
    contents in original document order. Returns (html_without_local_src, script_tags).
    script_tags is a list of strings like '<script>...</script>' or
    '<script type="module">...</script>' preserving 'type="module"' if present.
    """
    script_pattern = re.compile(r"<script([^>]*)src=['\"]([^'\"]+)['\"]([^>]*)>\s*</script>", flags=re.IGNORECASE)

    collected_tags = []

    def replace_script(match: re.Match) -> str:
        pre_attrs = match.group(1) or ''
        src = match.group(2) or ''
        post_attrs = match.group(3) or ''
        attrs_combined = f"{pre_attrs} {post_attrs}".lower()
        if not _is_local_asset(src):
            return match.group(0)
        js_path = os.path.normpath(os.path.join(base_dir, src))
        js_content = read_file(js_path)
        if not js_content:
            return ''
        is_module = 'type="module"' in attrs_combined or 'type=module' in attrs_combined
        if is_module:
            collected_tags.append(f"\n  <script type=\"module\">\n{js_content}\n  </script>\n")
        else:
            collected_tags.append(f"\n  <script>\n{js_content}\n  </script>\n")
        return ''

    html_without_local_src = script_pattern.sub(replace_script, html_content)
    return html_without_local_src, collected_tags


def combine_files(html_file='index.html', output_file='combined.html', document_data=None, base_dir='.'):
    """
    Combine HTML with all local CSS/JS assets into a single HTML file.

    Args:
        html_file: Path to the source HTML file
        output_file: Output file name
        document_data: Optional document data to embed (for exports)
        base_dir: Base directory to resolve relative asset paths
    """

    html_content = read_file(html_file)

    if not html_content:
        print("Error: HTML file is required and must exist")
        return False

    # Inline CSS link tags in place
    html_content = _inline_css_links(html_content, base_dir=base_dir)

    # Extract local JS scripts and remove them from the document
    html_content, collected_script_tags = _extract_local_scripts(html_content, base_dir=base_dir)

    # Add document data if provided (for exports)
    if document_data:
        data_tag = f"\n  <pre id=\"__doc__\" style=\"display:none\">{document_data}</pre>"
        html_content = html_content.replace('<body>', f'<body>{data_tag}')

    # Re-insert collected JS scripts just before closing body to ensure DOM is ready
    if collected_script_tags:
        scripts_combined = ''.join(collected_script_tags)
        if '</body>' in html_content:
            html_content = html_content.replace('</body>', f"{scripts_combined}\n</body>")
        else:
            html_content = f"{html_content}\n{scripts_combined}"

    # Write combined file
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(html_content)
        print(f"✅ Successfully created {output_file}")

        size = os.path.getsize(output_file)
        print(f"📁 File size: {size:,} bytes ({size/1024:.1f} KB)")
        return True

    except Exception as e:
        print(f"❌ Error writing {output_file}: {e}")
        return False

def create_export(document_data, output_file='export.html'):
    """
    Create an export file with embedded document data
    
    Args:
        document_data: The document data to embed
        output_file: Output file name
    """
    return combine_files(output_file=output_file, document_data=document_data)

def main():
    """Main function - can be called from command line or imported"""
    print("🔧 HTML Combiner Helper")
    print("=" * 30)
    
    # Check if required files exist
    required_files = ['index.html']
    missing_files = [f for f in required_files if not Path(f).exists()]
    
    if missing_files:
        print(f"⚠️  Missing files: {', '.join(missing_files)}")
        if 'index.html' in missing_files:
            print("❌ Cannot proceed without index.html")
            return False
    
    # Combine files
    success = combine_files()
    
    if success:
        print("\n✨ All files combined successfully!")
        print("📝 You can now use the combined.html file")
    else:
        print("\n❌ Failed to combine files")
    
    return success

if __name__ == '__main__':
    main()
