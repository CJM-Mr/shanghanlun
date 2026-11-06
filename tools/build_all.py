# -*- coding: utf-8 -*-
"""一键重建全部数据：抓原文 → 解析 → 取讲稿 → 建库
用法：python tools/build_all.py
"""
import os, sys, subprocess, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(ROOT, 'tools', 'source', 'hao.pdf')
PDF_URL = ('http://sssch.net/Admin/ckfinder/userfiles/files/shujixiazai/shujijijin(qita)/'
           '%E9%83%9D%E4%B8%87%E5%B1%B1%E8%AE%B2%E4%BC%A4%E5%AF%92%E8%AE%BA.pdf')

def run(script):
    print('\n▶', script, flush=True)
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', script)], check=True)

if __name__ == '__main__':
    os.makedirs(os.path.dirname(PDF), exist_ok=True)
    if not os.path.exists(PDF):
        print('▶ 下载《郝万山讲伤寒论》讲稿 PDF …', flush=True)
        urllib.request.urlretrieve(PDF_URL, PDF)
    run('scrape.py')        # 34 篇原文
    run('parse_book.py')    # 条文 / 方剂
    run('parse_hao.py')     # 70 讲讲稿（首次自动从 PDF 提取）
    run('build_db.py')      # SQLite（含中药与全文索引）
    print('\n完成：data/app.db')
