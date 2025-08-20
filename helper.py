#!/usr/bin/env python3
"""
HTML Combiner Helper Script
Combines index.html, style.css, and script.js into a single HTML file.
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

def combine_files(html_file='index.html', css_file='style.css', js_file='script.js', output_file='combined.html', document_data=None):
    """
    Combine HTML, CSS, and JS files into a single HTML file.
    
    Args:
        html_file: Path to HTML file
        css_file: Path to CSS file  
        js_file: Path to JS file
        output_file: Output file name
        document_data: Optional document data to embed (for exports)
    """
    
    # Read all files
    html_content = read_file(html_file)
    css_content = read_file(css_file)
    js_content = read_file(js_file)
    
    if not html_content:
        print("Error: HTML file is required and must exist")
        return False
    
    # Remove CSS link tag and replace with inline styles
    css_link_pattern = r'<link[^>]*href=["\']style\.css["\'][^>]*>'
    html_content = re.sub(css_link_pattern, '', html_content, flags=re.IGNORECASE)
    
    # Remove JS script tag and replace with inline script
    js_script_pattern = r'<script[^>]*src=["\']script\.js["\'][^>]*></script>'
    html_content = re.sub(js_script_pattern, '', html_content, flags=re.IGNORECASE)
    
    # Insert CSS into head section
    if css_content:
        css_tag = f'\n  <style>\n{css_content}\n  </style>'
        # Insert before closing head tag
        html_content = html_content.replace('</head>', f'{css_tag}\n</head>')
    
    # Insert JS before closing body tag
    if js_content:
        js_tag = f'\n  <script>\n{js_content}\n  </script>'
        # Insert before closing body tag
        html_content = html_content.replace('</body>', f'{js_tag}\n</body>')
    
    # Add document data if provided (for exports)
    if document_data:
        data_tag = f'\n  <pre id="__doc__" style="display:none">{document_data}</pre>'
        # Insert after opening body tag
        html_content = html_content.replace('<body>', f'<body>{data_tag}')
    
    # Write combined file
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(html_content)
        print(f"✅ Successfully created {output_file}")
        
        # Show file size info
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
    required_files = ['index.html', 'style.css', 'script.js']
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
